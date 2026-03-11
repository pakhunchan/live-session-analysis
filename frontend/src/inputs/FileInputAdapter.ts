import type { InputAdapter } from './InputAdapter';

export interface FileInputAdapterConfig {
  playAudio?: boolean;
}

export class FileInputAdapter implements InputAdapter {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private objectUrl: string | null = null;
  private ready = false;
  private file: File | null = null;
  private config: FileInputAdapterConfig;

  constructor(file?: File, config?: FileInputAdapterConfig) {
    this.file = file ?? null;
    this.config = config ?? {};
  }

  setFile(file: File): void {
    this.file = file;
  }

  async initialize(): Promise<void> {
    if (!this.file) {
      throw new Error('No file provided');
    }

    this.objectUrl = URL.createObjectURL(this.file);

    this.videoElement = document.createElement('video');
    this.videoElement.src = this.objectUrl;
    this.videoElement.muted = !this.config.playAudio;
    this.videoElement.playsInline = true;
    this.videoElement.loop = true;

    await new Promise<void>((resolve, reject) => {
      const el = this.videoElement!;
      el.onloadeddata = () => resolve();
      el.onerror = () => reject(new Error('Failed to load video file'));
    });

    await this.videoElement.play();

    // captureStream gives us a MediaStream from the video element
    if (typeof (this.videoElement as any).captureStream === 'function') {
      this.stream = (this.videoElement as any).captureStream();
    }

    this.ready = true;
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
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.stream = null;
    this.ready = false;
  }
}
