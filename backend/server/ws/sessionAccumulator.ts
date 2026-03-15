import type { InterruptionDetector } from './interruptionDetector.js';

type ParticipantRole = 'tutor' | 'student';

interface MetricDataPoint {
  participant: ParticipantRole;
  source: 'video' | 'audio';
  timestamp: number;
  eyeContact?: number;
  faceDetected?: boolean;
  faceConfidence?: number;
  expressionEnergy?: number;
  blinkActivity?: number;
  browActivity?: number;
  lipActivity?: number;
  genuineSmile?: number;
  headNodActivity?: number;
  eyeWideness?: number;
  lipTension?: number;
  gazeVariationX?: number;
  isSpeaking?: boolean;
  voiceEnergy?: number;
  volumeVariance?: number;
  spectralBrightness?: number;
  speechRate?: number;
  pitch?: number;
  pitchVariance?: number;
}

interface ParticipantRunning {
  eyeContactSum: number;
  eyeContactCount: number;
  energySum: number;
  energyCount: number;
  speakingMs: number;
  lastAudioTimestamp: number | null;
  lastIsSpeaking: boolean;
  // For engagement score
  engagementSum: number;
  engagementCount: number;
}

interface KeyMoment {
  timestamp: number;
  type: 'attention_drop' | 'engagement_spike' | 'long_silence' | 'interruption_burst' | 'energy_shift';
  description: string;
}

export interface SessionSummaryData {
  sessionId: string;
  durationMs: number;
  avgMetrics: {
    tutor: { eyeContactScore?: number; energyScore?: number };
    student: { eyeContactScore?: number; energyScore?: number };
  };
  totalInterruptions: number;
  talkTimeRatio: { tutor: number; student: number };
  engagementScore: number;
  keyMoments: KeyMoment[];
  nudgesTriggered: Array<{ type: string }>;
}

function computeEngagement(eyeContact: number | null, isSpeaking: boolean, expressionEnergy: number, voiceEnergy: number): number | null {
  if (isSpeaking) {
    return 0.8 + voiceEnergy * 0.2;
  }
  if (eyeContact === null) return null;
  const eyeGate = eyeContact >= 0.4 ? 1 : 0;
  return eyeGate * 0.8 + expressionEnergy * 0.2;
}

function defaultRunning(): ParticipantRunning {
  return {
    eyeContactSum: 0,
    eyeContactCount: 0,
    energySum: 0,
    energyCount: 0,
    speakingMs: 0,
    lastAudioTimestamp: null,
    lastIsSpeaking: false,
    engagementSum: 0,
    engagementCount: 0,
  };
}

export class SessionAccumulator {
  private sessionId: string;
  private startMs: number;
  private running: Record<ParticipantRole, ParticipantRunning> = {
    tutor: defaultRunning(),
    student: defaultRunning(),
  };
  private keyMoments: KeyMoment[] = [];
  private fetched = false;

  // Key moment detection state
  private lowEyeRun = 0;
  private lastEngagementWindow: number[] = [];
  private maxSilenceMs = 0;
  private silenceReported = false;
  private lastInterruptionTotal = 0;
  private interruptionWindowCounts: number[] = [];
  private lastEnergyWindow: number[] = [];

  // Silence tracking
  private lastTutorSpeaking = false;
  private lastStudentSpeaking = false;
  private silenceStartMs: number | null = null;
  private currentSilenceMs = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.startMs = Date.now();
  }

  get isFetched(): boolean {
    return this.fetched;
  }

  markFetched(): void {
    this.fetched = true;
  }

  ingest(dp: MetricDataPoint): void {
    const r = this.running[dp.participant];

    if (dp.source === 'video') {
      if (dp.faceDetected && dp.eyeContact !== undefined) {
        r.eyeContactSum += dp.eyeContact;
        r.eyeContactCount++;
      }
      const exprEnergy = dp.expressionEnergy ?? 0;
      r.energySum += exprEnergy;
      r.energyCount++;

      // Engagement for video frames (non-speaking case)
      if (!r.lastIsSpeaking) {
        const eyeContact = dp.faceDetected ? (dp.eyeContact ?? 0) : 0;
        const eng = computeEngagement(eyeContact, false, exprEnergy, 0);
        if (eng !== null) {
          r.engagementSum += eng;
          r.engagementCount++;
        }
      }

      // Key moment: attention drops (student only)
      if (dp.participant === 'student') {
        const eye = dp.faceDetected ? (dp.eyeContact ?? 0) : 1;
        if (eye < 0.3) {
          this.lowEyeRun++;
          if (this.lowEyeRun === 20) { // ~10s at 2Hz
            this.addMoment(dp.timestamp, 'attention_drop', 'Student attention dropped significantly');
          }
        } else {
          this.lowEyeRun = 0;
        }
      }
    } else {
      // Audio
      if (dp.isSpeaking && r.lastAudioTimestamp !== null) {
        const delta = dp.timestamp - r.lastAudioTimestamp;
        r.speakingMs += Math.min(delta, 1000);
      }
      r.lastAudioTimestamp = dp.timestamp;
      r.lastIsSpeaking = dp.isSpeaking ?? false;

      // Engagement for speaking frames
      if (dp.isSpeaking) {
        const voiceEnergy = dp.voiceEnergy ?? 0;
        const eng = computeEngagement(null, true, 0, voiceEnergy);
        if (eng !== null) {
          r.engagementSum += eng;
          r.engagementCount++;
        }
      }

      // Silence tracking
      if (dp.participant === 'tutor') this.lastTutorSpeaking = dp.isSpeaking ?? false;
      if (dp.participant === 'student') this.lastStudentSpeaking = dp.isSpeaking ?? false;

      if (!this.lastTutorSpeaking && !this.lastStudentSpeaking) {
        if (this.silenceStartMs === null) this.silenceStartMs = dp.timestamp;
        this.currentSilenceMs = dp.timestamp - this.silenceStartMs;
      } else {
        this.silenceStartMs = null;
        this.currentSilenceMs = 0;
        this.silenceReported = false;
      }

      if (this.currentSilenceMs >= 60_000 && !this.silenceReported) {
        this.addMoment(dp.timestamp, 'long_silence', 'Extended silence (>1 minute)');
        this.silenceReported = true;
      }
    }

    // Energy shift detection (student, rolling window)
    if (dp.participant === 'student' && dp.source === 'video') {
      const energy = dp.expressionEnergy ?? 0;
      this.lastEnergyWindow.push(energy);
      if (this.lastEnergyWindow.length > 40) { // ~20s at 2Hz
        const baseline = this.lastEnergyWindow[0];
        const recent = this.lastEnergyWindow.slice(-20);
        const allLow = recent.every(e => baseline - e > 0.3);
        if (allLow) {
          this.addMoment(dp.timestamp, 'energy_shift', 'Student energy dropped significantly');
        }
        this.lastEnergyWindow.shift();
      }
    }
  }

  /** Check interruption detector for burst detection */
  checkInterruptions(detector: InterruptionDetector): void {
    const counts = detector.getCounts();
    const total = counts.student + counts.tutor + counts.accident;
    this.interruptionWindowCounts.push(total);
    // 30s window at 1Hz broadcast rate
    if (this.interruptionWindowCounts.length > 30) {
      const old = this.interruptionWindowCounts.shift()!;
      if (total - old >= 3) {
        this.addMoment(Date.now(), 'interruption_burst', 'Burst of interruptions detected');
      }
    }
    this.lastInterruptionTotal = total;
  }

  getSessionSummary(detector: InterruptionDetector): SessionSummaryData {
    const now = Date.now();
    const durationMs = now - this.startMs;
    const totalElapsed = durationMs || 1; // avoid div by 0

    const counts = detector.getCounts();
    const totalInterruptions = counts.student + counts.tutor + counts.accident;

    const tutorR = this.running.tutor;
    const studentR = this.running.student;

    const tutorTalk = tutorR.speakingMs / totalElapsed;
    const studentTalk = studentR.speakingMs / totalElapsed;

    const studentEngagement = studentR.engagementCount > 0
      ? Math.round((studentR.engagementSum / studentR.engagementCount) * 100)
      : 0;

    return {
      sessionId: this.sessionId,
      durationMs,
      avgMetrics: {
        tutor: {
          eyeContactScore: tutorR.eyeContactCount > 0 ? tutorR.eyeContactSum / tutorR.eyeContactCount : undefined,
          energyScore: tutorR.energyCount > 0 ? tutorR.energySum / tutorR.energyCount : undefined,
        },
        student: {
          eyeContactScore: studentR.eyeContactCount > 0 ? studentR.eyeContactSum / studentR.eyeContactCount : undefined,
          energyScore: studentR.energyCount > 0 ? studentR.energySum / studentR.energyCount : undefined,
        },
      },
      totalInterruptions,
      talkTimeRatio: { tutor: tutorTalk, student: studentTalk },
      engagementScore: studentEngagement,
      keyMoments: this.keyMoments.map(m => ({
        ...m,
        timestamp: m.timestamp - this.startMs,  // convert to relative offset (ms from session start)
      })),
      nudgesTriggered: [], // Nudges are frontend-only; backend doesn't track them
    };
  }

  private addMoment(timestamp: number, type: KeyMoment['type'], description: string): void {
    // Deduplicate: skip if same type within 30s
    const isDuplicate = this.keyMoments.some(
      m => m.type === type && Math.abs(m.timestamp - timestamp) < 30_000,
    );
    if (!isDuplicate) {
      this.keyMoments.push({ timestamp, type, description });
    }
  }
}
