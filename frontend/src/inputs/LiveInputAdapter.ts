import type { InputAdapter } from './InputAdapter';

export interface LiveInputConfig {
  video: boolean | MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
}

const DEFAULT_CONFIG: LiveInputConfig = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

export class LiveInputAdapter implements InputAdapter {
  private config: LiveInputConfig;
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private remoteStream: MediaStream | null = null;
  private ready = false;

  // Injectable for testing
  private getMediaFn: typeof navigator.mediaDevices.getUserMedia;

  constructor(
    config: Partial<LiveInputConfig> = {},
    getUserMedia?: typeof navigator.mediaDevices.getUserMedia,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.getMediaFn = getUserMedia ?? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  }

  async initialize(): Promise<void> {
    this.stream = await this.getMediaFn({
      video: this.config.video,
      audio: this.config.audio,
    });

    this.videoElement = document.createElement('video');
    this.videoElement.srcObject = this.stream;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    await this.videoElement.play();
    this.ready = true;
  }

  setRemoteStream(stream: MediaStream): void {
    this.remoteStream = stream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getMediaStream(): MediaStream | null {
    return this.stream;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  isReady(): boolean {
    return this.ready;
  }

  dispose(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    this.ready = false;
  }
}
