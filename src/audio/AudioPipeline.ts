import type { EventBus } from '../core/EventBus';
import type { AudioChunkData, MetricDataPoint, ParticipantRole } from '../types';
import { EventType } from '../types';
import { computeRMS, computeSpectralCentroid, computeVoiceEnergy } from './voiceEnergy';
import { estimateSpeechRate } from './speechRate';
import { PitchTracker } from './pitchTracker';
import type { VadManager } from './VadManager';
import { TalkTimeAccumulator } from './talkTime';
import { InterruptionDetector } from './interruptionDetector';

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

  private pitchTrackers: Record<ParticipantRole, PitchTracker> = {
    tutor: new PitchTracker(),
    student: new PitchTracker(),
  };

  private rmsHistory: Record<ParticipantRole, number[]> = {
    tutor: [],
    student: [],
  };

  private talkTime = new TalkTimeAccumulator();
  private interruptionDetector = new InterruptionDetector();

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

    // Update RMS history
    const history = this.rmsHistory[participant];
    history.push(rms);
    if (history.length > this.config.rmsHistorySize) {
      history.shift();
    }

    // VAD — read from VadManager (ML-based, runs independently)
    const isSpeaking = this.vadManager?.isSpeaking(participant) ?? false;

    // Speech rate
    const speechRate = estimateSpeechRate(history, this.config.sampleRateHz);

    // Pitch tracking
    const { pitch, pitchVariance } = this.pitchTrackers[participant].update(timeDomainData, sampleRate);

    // Volume variance from history
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const volumeVariance = Math.min(1,
      history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length * 100
    );

    // Spectral brightness: normalize centroid Hz to 0-1
    const spectralBrightness = Math.min(1, centroidHz / 4000);

    // Voice energy (no raw volume — gain-dependent and unreliable)
    const voiceEnergy = computeVoiceEnergy(volumeVariance, spectralBrightness, speechRate);

    // Talk time & interruption tracking
    const tutorSpeaking = this.vadManager?.isSpeaking('tutor') ?? false;
    const studentSpeaking = this.vadManager?.isSpeaking('student') ?? false;
    this.talkTime.update(tutorSpeaking, studentSpeaking, timestamp);
    this.interruptionDetector.update(tutorSpeaking, studentSpeaking, timestamp);

    // Emit
    const dp: MetricDataPoint = {
      source: 'audio',
      participant,
      timestamp,
      isSpeaking,
      voiceEnergy,
      amplitude: rms,
      volumeVariance,
      spectralBrightness,
      speechRate,
      pitch: pitch ?? undefined,
      pitchVariance,
    };

    this.eventBus.emit(EventType.AUDIO_METRICS, dp);
  }

  getTalkTime(): { tutor: number; student: number } {
    return this.talkTime.getTalkTimePercent();
  }

  getSilenceDurationMs(): number {
    return this.talkTime.getCurrentSilenceDurationMs();
  }

  getInterruptionCount(): number {
    return this.interruptionDetector.getCount();
  }

  getRmsHistory(participant: ParticipantRole): number[] {
    return [...this.rmsHistory[participant]];
  }
}
