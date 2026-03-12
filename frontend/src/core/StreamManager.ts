import type { ParticipantRole, StreamConfig, FrameData, AudioChunkData } from '../types';
import { DEFAULT_STREAM_CONFIG } from '../types';

export interface IAudioContext {
  createAnalyser(): IAudioAnalyserNode;
  createMediaStreamSource(stream: MediaStream): { connect(node: IAudioAnalyserNode): void };
  sampleRate: number;
}

export interface IAudioAnalyserNode {
  fftSize: number;
  frequencyBinCount: number;
  getFloatTimeDomainData(array: Float32Array): void;
  getFloatFrequencyData(array: Float32Array): void;
}

interface ParticipantStream {
  mediaStream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
  audioContext: IAudioContext | null;
  analyser: IAudioAnalyserNode | null;
}

type FrameCallback = (data: FrameData) => void;
type AudioCallback = (data: AudioChunkData) => void;

export class StreamManager {
  private config: StreamConfig;
  private streams: Record<ParticipantRole, ParticipantStream> = {
    tutor: { mediaStream: null, videoElement: null, audioContext: null, analyser: null },
    student: { mediaStream: null, videoElement: null, audioContext: null, analyser: null },
  };

  private frameCallbacks: FrameCallback[] = [];
  private audioCallbacks: AudioCallback[] = [];

  private videoTimer: ReturnType<typeof setInterval> | null = null;
  private audioTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // Allow injection for testing
  private audioContextFactory: ((stream: MediaStream) => IAudioContext) | null = null;

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
  }

  setAudioContextFactory(factory: (stream: MediaStream) => IAudioContext): void {
    this.audioContextFactory = factory;
  }

  getStream(participant: ParticipantRole): MediaStream | null {
    return this.streams[participant].mediaStream;
  }

  setStream(participant: ParticipantRole, stream: MediaStream): void {
    const ps = this.streams[participant];
    ps.mediaStream = stream;

    // Set up audio analysis
    this.setupAudio(participant, stream);
  }

  setVideoElement(participant: ParticipantRole, element: HTMLVideoElement): void {
    this.streams[participant].videoElement = element;
  }

  private setupAudio(participant: ParticipantRole, stream: MediaStream): void {
    const ps = this.streams[participant];

    // Skip audio setup if stream has no audio tracks
    if (typeof stream.getAudioTracks === 'function' && stream.getAudioTracks().length === 0) return;

    if (this.audioContextFactory) {
      ps.audioContext = this.audioContextFactory(stream);
      const analyser = ps.audioContext.createAnalyser();
      analyser.fftSize = this.config.fftSize;
      ps.analyser = analyser;
      const source = ps.audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      return;
    }

    if (typeof AudioContext === 'undefined') return;

    const ctx = new AudioContext();
    ps.audioContext = ctx as unknown as IAudioContext;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.config.fftSize;
    ps.analyser = analyser as unknown as IAudioAnalyserNode;

    // Bandpass filter: pass 85-3000 Hz speech band, reject ambient noise
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3000;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(analyser);
  }

  onFrame(cb: FrameCallback): void {
    this.frameCallbacks.push(cb);
  }

  onAudioChunk(cb: AudioCallback): void {
    this.audioCallbacks.push(cb);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Video sampling loop
    const videoIntervalMs = 1000 / this.config.videoFps;
    this.videoTimer = setInterval(() => {
      this.sampleVideoFrames();
    }, videoIntervalMs);

    // Audio sampling loop
    const audioIntervalMs = 1000 / this.config.audioSampleHz;
    this.audioTimer = setInterval(() => {
      this.sampleAudio();
    }, audioIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.videoTimer) {
      clearInterval(this.videoTimer);
      this.videoTimer = null;
    }
    if (this.audioTimer) {
      clearInterval(this.audioTimer);
      this.audioTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private sampleVideoFrames(): void {
    const now = Date.now();
    for (const participant of ['tutor', 'student'] as ParticipantRole[]) {
      const ps = this.streams[participant];
      const videoEl = ps.videoElement;
      if (!videoEl || videoEl.readyState < 2) continue; // HAVE_CURRENT_DATA

      const frameData: FrameData = {
        participant,
        imageData: videoEl,
        timestamp: now,
        width: videoEl.videoWidth || videoEl.width,
        height: videoEl.videoHeight || videoEl.height,
      };

      for (const cb of this.frameCallbacks) {
        cb(frameData);
      }
    }
  }

  private sampleAudio(): void {
    const now = Date.now();
    for (const participant of ['tutor', 'student'] as ParticipantRole[]) {
      const ps = this.streams[participant];
      if (!ps.analyser || !ps.audioContext) continue;

      // Time-domain: use full fftSize (2048) for pitch detection accuracy.
      // Frequency-domain: frequencyBinCount (fftSize/2) is correct for FFT output.
      const timeDomainData = new Float32Array(ps.analyser.fftSize);
      const frequencyData = new Float32Array(ps.analyser.frequencyBinCount);

      ps.analyser.getFloatTimeDomainData(timeDomainData);
      ps.analyser.getFloatFrequencyData(frequencyData);

      const chunk: AudioChunkData = {
        participant,
        timeDomainData,
        frequencyData,
        sampleRate: ps.audioContext.sampleRate,
        timestamp: now,
      };

      for (const cb of this.audioCallbacks) {
        cb(chunk);
      }
    }
  }
}
