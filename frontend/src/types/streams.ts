import type { ParticipantRole } from './metrics';

export interface StreamConfig {
  videoFps: number;       // frames per second for video sampling (default: 2)
  audioSampleHz: number;  // audio sampling rate (default: 20)
  fftSize: number;        // FFT size for audio analysis (default: 2048)
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  videoFps: 2,
  audioSampleHz: 20,
  fftSize: 2048,
};

export interface FrameData {
  participant: ParticipantRole;
  imageData: ImageBitmap | HTMLVideoElement;
  timestamp: number;
  width: number;
  height: number;
}

export interface AudioChunkData {
  participant: ParticipantRole;
  timeDomainData: Float32Array;
  frequencyData: Float32Array;
  sampleRate: number;
  timestamp: number;
}
