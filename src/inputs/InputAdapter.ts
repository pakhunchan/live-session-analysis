export interface InputAdapter {
  initialize(): Promise<void>;
  getMediaStream(): MediaStream | null;
  getVideoElement(): HTMLVideoElement | null;
  dispose(): void;
  isReady(): boolean;
}
