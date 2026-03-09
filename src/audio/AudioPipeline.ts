import type { EventBus } from '../core/EventBus';
import type { AudioChunkData, MetricDataPoint, ParticipantRole } from '../types';
import { EventType } from '../types';
import { computeRMS, computeSpectralCentroid, computeVoiceEnergy } from './voiceEnergy';
import { estimateSpeechRate } from './speechRate';
import { VoiceActivityDetector } from './vad';
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

  private vads: Record<ParticipantRole, VoiceActivityDetector> = {
    tutor: new VoiceActivityDetector(),
    student: new VoiceActivityDetector(),
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

  processChunk(chunk: AudioChunkData): void {
    const { participant, timeDomainData, frequencyData, sampleRate, timestamp } = chunk;

    // Compute features
    const rms = computeRMS(timeDomainData);
    const spectralCentroid = computeSpectralCentroid(frequencyData, sampleRate);

    // Update RMS history
    const history = this.rmsHistory[participant];
    history.push(rms);
    if (history.length > this.config.rmsHistorySize) {
      history.shift();
    }

    // VAD
    const isSpeaking = this.vads[participant].update(rms, frequencyData, sampleRate);

    // Speech rate
    const speechRate = estimateSpeechRate(history, this.config.sampleRateHz);

    // Volume variance from history
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const volumeVariance = Math.min(1,
      history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length * 100
    );

    // Normalized volume (0-1, assuming typical speech RMS ~0.01-0.3)
    const volumeLevel = Math.min(1, rms / 0.3);

    // Voice energy
    const voiceEnergy = computeVoiceEnergy(volumeLevel, volumeVariance, spectralCentroid, speechRate);

    // Talk time & interruption tracking
    const tutorSpeaking = this.vads.tutor.isSpeaking();
    const studentSpeaking = this.vads.student.isSpeaking();
    this.talkTime.update(tutorSpeaking, studentSpeaking, timestamp);
    this.interruptionDetector.update(tutorSpeaking, studentSpeaking, timestamp);

    // Normalized spectral brightness (0-1, centroid typically 500-4000 Hz)
    const spectralBrightness = Math.min(1, spectralCentroid / 4000);

    // Emit
    const dp: MetricDataPoint = {
      source: 'audio',
      participant,
      timestamp,
      isSpeaking,
      voiceEnergy,
      amplitude: rms,
      volume: volumeLevel,
      volumeVariance,
      spectralBrightness,
      speechRate,
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
