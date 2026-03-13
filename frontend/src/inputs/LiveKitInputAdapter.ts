import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  LocalAudioTrack,
  createLocalTracks,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type RoomOptions,
} from 'livekit-client';
import type { InputAdapter } from './InputAdapter';

export type LiveKitInputSource = 'webcam' | 'file';

export interface LiveKitInputAdapterConfig {
  url: string;
  token: string;
  inputSource: LiveKitInputSource;
  file?: File;
  earlyStream?: MediaStream;
}

type RemoteTrackCallback = (stream: MediaStream, videoElement: HTMLVideoElement) => void;

export class LiveKitInputAdapter implements InputAdapter {
  private config: LiveKitInputAdapterConfig;
  private room: Room | null = null;
  private localStream: MediaStream | null = null;
  private localVideoElement: HTMLVideoElement | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteVideoElement: HTMLVideoElement | null = null;
  private fileVideoElement: HTMLVideoElement | null = null;
  private fileObjectUrl: string | null = null;
  private ready = false;
  private onRemoteTrackCallback: RemoteTrackCallback | null = null;

  constructor(config: LiveKitInputAdapterConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const roomOptions: RoomOptions = {
      adaptiveStream: false,
      dynacast: false,
    };

    this.room = new Room(roomOptions);

    // Handle remote tracks
    this.room.on(
      RoomEvent.TrackSubscribed,
      (track, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
        this.handleRemoteTrack(track);
      },
    );

    this.room.on(
      RoomEvent.ParticipantDisconnected,
      () => {
        // Clean up remote stream when participant leaves
        this.remoteStream = null;
        if (this.remoteVideoElement) {
          this.remoteVideoElement.srcObject = null;
        }
      },
    );

    // Connect to room
    await this.room.connect(this.config.url, this.config.token);

    // Publish local tracks
    if (this.config.inputSource === 'webcam') {
      await this.publishWebcamTracks();
    } else {
      await this.publishFileTracks();
    }

    this.ready = true;
  }

  private async publishWebcamTracks(): Promise<void> {
    let tracks;
    if (this.config.earlyStream) {
      // Use pre-acquired stream (needed for Safari user gesture requirement)
      tracks = this.config.earlyStream.getTracks().map((t) =>
        t.kind === 'video' ? new LocalVideoTrack(t) : new LocalAudioTrack(t),
      );
    } else {
      tracks = await createLocalTracks({
        video: { resolution: { width: 1920, height: 1080, frameRate: 30 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }

    this.localStream = new MediaStream();
    for (const track of tracks) {
      await this.room!.localParticipant.publishTrack(track, {
        simulcast: false,
        videoCodec: track instanceof LocalVideoTrack ? 'h264' : undefined,
        videoEncoding: track instanceof LocalVideoTrack
          ? { maxBitrate: 8_000_000, maxFramerate: 30 }
          : undefined,
      });
      this.localStream.addTrack(track.mediaStreamTrack);
    }

    // Create local video element for StreamManager
    this.localVideoElement = document.createElement('video');
    this.localVideoElement.srcObject = this.localStream;
    this.localVideoElement.muted = true;
    this.localVideoElement.playsInline = true;
    await this.localVideoElement.play();
  }

  private async publishFileTracks(): Promise<void> {
    if (!this.config.file) {
      throw new Error('File required for file input source');
    }

    this.fileObjectUrl = URL.createObjectURL(this.config.file);

    // Create video element for the file
    // Use muted=false + volume=0 so captureStream() includes the audio track
    this.fileVideoElement = document.createElement('video');
    this.fileVideoElement.src = this.fileObjectUrl;
    this.fileVideoElement.muted = false;
    this.fileVideoElement.volume = 0;
    this.fileVideoElement.playsInline = true;
    this.fileVideoElement.loop = true;

    await new Promise<void>((resolve, reject) => {
      const el = this.fileVideoElement!;
      el.onloadeddata = () => resolve();
      el.onerror = () => reject(new Error('Failed to load video file'));
    });

    await this.fileVideoElement.play();

    // captureStream() to get MediaStream from the file
    const capturedStream: MediaStream | null =
      typeof (this.fileVideoElement as any).captureStream === 'function'
        ? (this.fileVideoElement as any).captureStream()
        : typeof (this.fileVideoElement as any).mozCaptureStream === 'function'
          ? (this.fileVideoElement as any).mozCaptureStream()
          : null;

    if (!capturedStream) {
      throw new Error('captureStream() not supported in this browser');
    }

    // Publish each track to LiveKit
    for (const mediaTrack of capturedStream.getTracks()) {
      let localTrack: LocalVideoTrack | LocalAudioTrack;
      if (mediaTrack.kind === 'video') {
        localTrack = new LocalVideoTrack(mediaTrack);
      } else {
        localTrack = new LocalAudioTrack(mediaTrack);
      }
      await this.room!.localParticipant.publishTrack(localTrack);
    }

    // Use the captured stream and the file video element for local analysis
    this.localStream = capturedStream;
    this.localVideoElement = this.fileVideoElement;
  }

  private handleRemoteTrack(track: Track): void {
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;

    if (!this.remoteStream) {
      this.remoteStream = new MediaStream();
    }
    this.remoteStream.addTrack(mediaTrack);

    // Create or update the remote video element (used for face detection only;
    // audio playback is handled by LiveKit, display by VideoPreview component).
    // Must be muted so autoplay works reliably per browser autoplay policies.
    if (!this.remoteVideoElement) {
      this.remoteVideoElement = document.createElement('video');
      this.remoteVideoElement.playsInline = true;
      this.remoteVideoElement.autoplay = true;
      this.remoteVideoElement.muted = true;
    }
    this.remoteVideoElement.srcObject = this.remoteStream;
    this.remoteVideoElement.play().catch(() => {});

    // Fire callback so orchestrator can wire up StreamManager
    if (this.onRemoteTrackCallback && this.remoteStream && this.remoteVideoElement) {
      this.onRemoteTrackCallback(this.remoteStream, this.remoteVideoElement);
    }
  }

  setOnRemoteTrackSubscribed(cb: RemoteTrackCallback): void {
    this.onRemoteTrackCallback = cb;
  }

  // InputAdapter interface
  getMediaStream(): MediaStream | null {
    return this.localStream;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.localVideoElement;
  }

  // Remote accessors
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getRemoteVideoElement(): HTMLVideoElement | null {
    return this.remoteVideoElement;
  }

  isReady(): boolean {
    return this.ready;
  }

  dispose(): void {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }

    if (this.localVideoElement) {
      this.localVideoElement.pause();
      this.localVideoElement.srcObject = null;
      this.localVideoElement.src = '';
      this.localVideoElement = null;
    }

    if (this.fileObjectUrl) {
      URL.revokeObjectURL(this.fileObjectUrl);
      this.fileObjectUrl = null;
    }

    if (this.remoteVideoElement) {
      this.remoteVideoElement.srcObject = null;
      this.remoteVideoElement = null;
    }

    this.localStream = null;
    this.remoteStream = null;
    this.fileVideoElement = null;
    this.ready = false;
  }
}
