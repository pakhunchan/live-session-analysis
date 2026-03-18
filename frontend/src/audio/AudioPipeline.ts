import type { EventBus } from '../core/EventBus';
import type { AudioChunkData, MetricDataPoint, ParticipantRole } from '../types';
import { EventType } from '../types';
import { computeRMS, computeSpectralCentroid, computeVoiceEnergy } from './voiceEnergy';
import { estimateSpeechRate } from './speechRate';
import { PitchTracker } from './pitchTracker';
import type { VadManager } from './VadManager';
import { VoiceActivityDetector } from './vad';
import { TalkTimeAccumulator } from './talkTime';

export interface AudioPipelineConfig {
  rmsHistorySize: number;
  sampleRateHz: number;
}

const DEFAULT_CONFIG: AudioPipelineConfig = {
  rmsHistorySize: 100,  // ~5 sec at 20 Hz
  sampleRateHz: 20,
};

export class AudioPipeline {
  private eventBus: EventBus;
  private config: AudioPipelineConfig;

  private vadManager: VadManager | null = null;

  // Fallback threshold-based VAD — used when VadManager (vad-web) isn't active
  private fallbackVads: Record<ParticipantRole, VoiceActivityDetector> = {
    tutor: new VoiceActivityDetector(),
    student: new VoiceActivityDetector(),
  };

  private pitchTrackers: Record<ParticipantRole, PitchTracker> = {
    tutor: new PitchTracker(),
    student: new PitchTracker(),
  };

  private rmsHistory: Record<ParticipantRole, number[]> = {
    tutor: [],
    student: [],
  };

  private talkTime = new TalkTimeAccumulator();

  // Client-side speech debounce — holds isSpeaking=true through brief VAD drops
  private lastSpeakingTs: Record<ParticipantRole, number> = { tutor: 0, student: 0 };
  private static readonly SPEECH_HOLD_MS = 300;

  constructor(eventBus: EventBus, config: Partial<AudioPipelineConfig> = {}) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setVadManager(vm: VadManager): void {
    this.vadManager = vm;
  }

  processChunk(chunk: AudioChunkData): void {
    const { participant, timeDomainData, sampleRate, timestamp } = chunk;

    // Compute features
    const rms = computeRMS(timeDomainData);
    const centroidHz = computeSpectralCentroid(timeDomainData, sampleRate);

    // VAD — prefer VadManager (ML-based), fall back to threshold VAD
    // Always update fallback so it stays warm even when VadManager is active
    const fallbackResult = this.fallbackVads[participant].update(rms, chunk.frequencyData, sampleRate);
    const rawSpeaking = this.vadManager?.isSpeaking(participant) ?? fallbackResult;

    // Client-side speech hold — keep isSpeaking=true for SPEECH_HOLD_MS after last active frame
    if (rawSpeaking) {
      this.lastSpeakingTs[participant] = timestamp;
    }
    const isSpeaking = rawSpeaking || (timestamp - this.lastSpeakingTs[participant]) < AudioPipeline.SPEECH_HOLD_MS;

    // Only add to RMS history while speaking — keeps history clean of ambient noise
    const history = this.rmsHistory[participant];
    if (isSpeaking) {
      history.push(rms);
      if (history.length > this.config.rmsHistorySize) {
        history.shift();
      }
    }

    // Pitch tracking (always runs — has its own silence gating + decay)
    const { pitch, pitchVariance } = this.pitchTrackers[participant].update(timeDomainData, sampleRate);

    // VAD gate: only compute feature metrics when speaking to filter ambient noise
    let speechRate = 0;
    let volumeVariance = 0;
    let spectralBrightness = 0;
    let voiceEnergy = 0;

    if (isSpeaking && history.length >= 2) {
      speechRate = estimateSpeechRate(history, this.config.sampleRateHz);

      const mean = history.reduce((a, b) => a + b, 0) / history.length;
      volumeVariance = Math.min(1,
        history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length * 100
      );

      spectralBrightness = Math.min(1, centroidHz / 4000);

      voiceEnergy = computeVoiceEnergy(volumeVariance, spectralBrightness, speechRate);
    }

    // Talk time tracking — use same VAD fallback logic
    const tutorSpeaking = this.vadManager?.isSpeaking('tutor')
      ?? this.fallbackVads.tutor.isSpeaking();
    const studentSpeaking = this.vadManager?.isSpeaking('student')
      ?? this.fallbackVads.student.isSpeaking();
    this.talkTime.update(tutorSpeaking, studentSpeaking, timestamp);

    // Emit
    const dp: MetricDataPoint = {
      source: 'audio',
      participant,
      timestamp,
      isSpeaking,
      isSpeakingRaw: rawSpeaking,
      voiceEnergy,
      amplitude: rms,
      volumeVariance,
      spectralBrightness,
      speechRate,
      pitch: pitch ?? undefined,
      pitchVariance,
    };

    // Latency trace — sample ~1 per second (at 20Hz audio, 50ms window → ~5% of messages)
    const now = Date.now();
    if (now % 1000 < 55) {
      dp._trace = { t0_capture: timestamp, t1_processed: now, t2_sent: 0 };
    }

    this.eventBus.emit(EventType.AUDIO_METRICS, dp);
  }

  getTalkTime(): { tutor: number; student: number } {
    return this.talkTime.getTalkTimePercent();
  }

  getSilenceDurationMs(): number {
    return this.talkTime.getCurrentSilenceDurationMs();
  }

  getRmsHistory(participant: ParticipantRole): number[] {
    return [...this.rmsHistory[participant]];
  }
}
