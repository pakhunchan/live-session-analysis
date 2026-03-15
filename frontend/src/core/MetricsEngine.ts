import type {
  MetricDataPoint,
  MetricSnapshot,
  ParticipantMetrics,
  ParticipantRole,
  SessionMetrics,
  EngagementTrend,
  EnergyBreakdown,
  InterruptionCounts,
  DataStatus,
  LatencyTrace,
} from '../types';
import { engagementScore } from './engagement';

const STALE_THRESHOLD_MS = 3000;

export interface MetricsEngineConfig {
  sessionId: string;
  snapshotIntervalMs: number;  // default 500 (2 Hz)
  trendWindowSize: number;     // number of snapshots for trend calc
  historyMaxLength: number;    // max snapshots to keep in memory
}

const DEFAULT_CONFIG: MetricsEngineConfig = {
  sessionId: '',
  snapshotIntervalMs: 500,
  trendWindowSize: 10,
  historyMaxLength: 3600,  // ~30 min at 2 Hz
};

interface ParticipantAccumulator {
  latestVideo: MetricDataPoint | null;
  latestAudio: MetricDataPoint | null;
  lastVideoReceivedAt: number | null;
  lastAudioReceivedAt: number | null;
  speakingMs: number;
  lastAudioTimestamp: number | null;
}

function defaultParticipantMetrics(): ParticipantMetrics {
  return {
    eyeContactScore: 0,
    talkTimePercent: 0,
    energyScore: 0,
    isSpeaking: false,
    faceDetected: false,
    faceConfidence: 0,
    distractionDurationMs: 0,
  };
}

/**
 * Pure function: fuse latest data points into a MetricSnapshot.
 */
export function computeSnapshot(
  sessionId: string,
  timestamp: number,
  tutorAcc: ParticipantAccumulator,
  studentAcc: ParticipantAccumulator,
  interruptions: InterruptionCounts,
  currentSilenceDurationMs: number,
  sessionElapsedMs: number,
  recentSnapshots: MetricSnapshot[],
  trendWindowSize: number,
  distractionDurations: Record<ParticipantRole, number> = { tutor: 0, student: 0 },
): MetricSnapshot {
  const tutor = buildParticipantMetrics(tutorAcc, sessionElapsedMs, distractionDurations.tutor, timestamp);
  const student = buildParticipantMetrics(studentAcc, sessionElapsedMs, distractionDurations.student, timestamp);

  const session: SessionMetrics = {
    interruptions,
    currentSilenceDurationMs,
    engagementTrend: computeTrend(recentSnapshots, trendWindowSize),
    sessionElapsedMs,
  };

  return { timestamp, sessionId, tutor, student, session };
}

function buildParticipantMetrics(
  acc: ParticipantAccumulator,
  sessionElapsedMs: number,
  distractionDurationMs: number = 0,
  now: number = Date.now(),
): ParticipantMetrics {
  const video = acc.latestVideo;
  const audio = acc.latestAudio;

  // "Stale" only applies when data was previously received but stopped arriving.
  // Never-received data uses default values (0/false), not null.
  // Arrival-based: compare tutor's Date.now() at ingestion vs snapshot time (single clock).
  const videoStale = video !== null && acc.lastVideoReceivedAt !== null
    && (now - acc.lastVideoReceivedAt) > STALE_THRESHOLD_MS;
  const audioStale = audio !== null && acc.lastAudioReceivedAt !== null
    && (now - acc.lastAudioReceivedAt) > STALE_THRESHOLD_MS;

  const faceDetected = videoStale ? false : (video?.faceDetected ?? false);
  const faceConfidence = videoStale ? 0 : (video?.faceConfidence ?? 0);

  const dataStatus: DataStatus = {
    videoStale,
    audioStale,
    lowConfidence: !videoStale && faceDetected && faceConfidence < 0.5,
  };

  return {
    eyeContactScore: videoStale ? null : (faceDetected ? (video?.eyeContact ?? 0) : 0),
    talkTimePercent: audioStale ? null : (sessionElapsedMs > 0 ? acc.speakingMs / sessionElapsedMs : 0),
    energyScore: videoStale && audioStale ? null : computeEnergy(videoStale ? null : video, audioStale ? null : audio),
    isSpeaking: audioStale ? null : (audio?.isSpeaking ?? false),
    faceDetected,
    faceConfidence,
    distractionDurationMs,
    energyBreakdown: videoStale && audioStale ? null : buildEnergyBreakdown(videoStale ? null : video, audioStale ? null : audio),
    dataStatus,
  };
}

function buildEnergyBreakdown(
  video: MetricDataPoint | null,
  audio: MetricDataPoint | null,
): EnergyBreakdown {
  return {
    blinkActivity: video?.blinkActivity ?? 0,
    browActivity: video?.browActivity ?? 0,
    lipActivity: video?.lipActivity ?? 0,
    genuineSmile: video?.genuineSmile ?? 0,
    expressionEnergy: video?.expressionEnergy ?? 0,
    headNodActivity: video?.headNodActivity ?? 0,
    eyeWideness: video?.eyeWideness ?? 0,
    lipTension: video?.lipTension ?? 0,
    gazeVariationX: video?.gazeVariationX ?? 0,
    volumeVariance: audio?.volumeVariance ?? 0,
    spectralBrightness: audio?.spectralBrightness ?? 0,
    speechRate: audio?.speechRate ?? 0,
    voiceEnergy: audio?.voiceEnergy ?? 0,
    pitch: audio?.pitch ?? 0,
    pitchVariance: audio?.pitchVariance ?? 0,
  };
}

function computeEnergy(
  video: MetricDataPoint | null,
  audio: MetricDataPoint | null,
): number | null {
  if (!video && !audio) return null;
  const expressionEnergy = video?.expressionEnergy ?? 0;
  const voiceEnergy = audio?.voiceEnergy ?? 0;
  // Weighted: 20% expression, 80% voice when both present
  if (video?.faceDetected && audio) {
    return expressionEnergy * 0.2 + voiceEnergy * 0.8;
  }
  if (video?.faceDetected) return expressionEnergy;
  if (audio) return voiceEnergy;
  return 0;
}

/**
 * Pure function: compute engagement trend from recent snapshots.
 */
export function computeTrend(
  recentSnapshots: MetricSnapshot[],
  windowSize: number,
): EngagementTrend {
  if (recentSnapshots.length < 2) return 'stable';

  const window = recentSnapshots.slice(-windowSize);
  if (window.length < 2) return 'stable';

  // Average engagement via shared engagementScore formula, skipping null scores
  const scores = window
    .map((s) => {
      const t = engagementScore(s.tutor);
      const st = engagementScore(s.student);
      if (t === null || st === null) return null;
      return (t + st) / 2;
    })
    .filter((v): v is number => v !== null);

  // Simple linear regression slope
  const n = scores.length;
  const xMean = (n - 1) / 2;
  const yMean = scores.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (scores[i] - yMean);
    den += (i - xMean) ** 2;
  }

  const slope = den === 0 ? 0 : num / den;
  const threshold = 0.02;  // minimum slope to count as trending

  if (slope > threshold) return 'rising';
  if (slope < -threshold) return 'declining';
  return 'stable';
}

export class MetricsEngine {
  private config: MetricsEngineConfig;
  private startTime: number = 0;
  private history: MetricSnapshot[] = [];
  private interruptionCounts: InterruptionCounts = { student: 0, tutor: 0, accident: 0 };
  private currentSilenceDurationMs = 0;
  private lastSilenceCheckTime = 0;

  private distractionState: Record<ParticipantRole, {
    lastDistractedAt: number | null;
    durationMs: number;
  }> = {
    tutor: { lastDistractedAt: null, durationMs: 0 },
    student: { lastDistractedAt: null, durationMs: 0 },
  };

  private tutorAcc: ParticipantAccumulator = { latestVideo: null, latestAudio: null, lastVideoReceivedAt: null, lastAudioReceivedAt: null, speakingMs: 0, lastAudioTimestamp: null };
  private studentAcc: ParticipantAccumulator = { latestVideo: null, latestAudio: null, lastVideoReceivedAt: null, lastAudioReceivedAt: null, speakingMs: 0, lastAudioTimestamp: null };

  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private onSnapshot: ((snapshot: MetricSnapshot) => void) | null = null;
  private onTrace: ((trace: LatencyTrace) => void) | null = null;

  constructor(config: Partial<MetricsEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setTraceCallback(cb: (trace: LatencyTrace) => void): void {
    this.onTrace = cb;
  }

  /** Update interruption counts from backend-computed data */
  setInterruptionCounts(counts: InterruptionCounts): void {
    this.interruptionCounts = counts;
  }

  start(onSnapshot?: (snapshot: MetricSnapshot) => void): void {
    this.startTime = Date.now();
    this.lastSilenceCheckTime = this.startTime;
    this.onSnapshot = onSnapshot ?? null;

    this.snapshotTimer = setInterval(() => {
      const snapshot = this.produceSnapshot();
      this.history.push(snapshot);
      if (this.history.length > this.config.historyMaxLength) {
        this.history.shift();
      }
      this.onSnapshot?.(snapshot);
    }, this.config.snapshotIntervalMs);
  }

  stop(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  ingestDataPoint(dp: MetricDataPoint): void {
    if (dp._trace) {
      dp._trace.t6_ingested = Date.now();
      this.onTrace?.(dp._trace);
    }

    const acc = dp.participant === 'tutor' ? this.tutorAcc : this.studentAcc;

    if (dp.source === 'video') {
      acc.latestVideo = dp;
      acc.lastVideoReceivedAt = Date.now();

      // Distraction tracking: sustained low eye contact
      const ds = this.distractionState[dp.participant];
      const eyeContact = dp.eyeContact ?? 0;
      const isDistracted = (dp.faceDetected ?? false) && eyeContact < 0.3;

      if (isDistracted) {
        if (ds.lastDistractedAt !== null) {
          const delta = dp.timestamp - ds.lastDistractedAt;
          ds.durationMs += Math.min(delta, 2000); // clamp to prevent huge jumps
        }
        ds.lastDistractedAt = dp.timestamp;
      } else {
        ds.lastDistractedAt = null;
        ds.durationMs = 0;
      }
    } else {
      // Update speaking accumulator using actual time delta between audio samples
      if (dp.isSpeaking && acc.lastAudioTimestamp !== null) {
        const deltaMs = dp.timestamp - acc.lastAudioTimestamp;
        // Clamp to prevent huge jumps from stale timestamps
        acc.speakingMs += Math.min(deltaMs, 1000);
      }
      acc.lastAudioTimestamp = dp.timestamp;
      acc.latestAudio = dp;
      acc.lastAudioReceivedAt = Date.now();
    }

    // Silence + interruption tracking (driven by audio data points from both participants)
    const now = dp.timestamp;
    const tutorSpeaking = this.tutorAcc.latestAudio?.isSpeaking ?? false;
    const studentSpeaking = this.studentAcc.latestAudio?.isSpeaking ?? false;

    if (!tutorSpeaking && !studentSpeaking) {
      this.currentSilenceDurationMs += now - this.lastSilenceCheckTime;
    } else {
      this.currentSilenceDurationMs = 0;
    }
    this.lastSilenceCheckTime = now;

  }

  getHistory(): MetricSnapshot[] {
    return [...this.history];
  }

  getLatestSnapshot(): MetricSnapshot | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  private produceSnapshot(): MetricSnapshot {
    const now = Date.now();
    const sessionElapsedMs = now - this.startTime;

    return computeSnapshot(
      this.config.sessionId,
      now,
      this.tutorAcc,
      this.studentAcc,
      this.interruptionCounts,
      this.currentSilenceDurationMs,
      sessionElapsedMs,
      this.history,
      this.config.trendWindowSize,
      {
        tutor: this.distractionState.tutor.durationMs,
        student: this.distractionState.student.durationMs,
      },
    );
  }
}
