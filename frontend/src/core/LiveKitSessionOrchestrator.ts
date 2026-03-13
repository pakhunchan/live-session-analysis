import type { StreamManager } from './StreamManager';
import type { ParticipantRole } from '../types/metrics';
import type { LiveKitSetupConfig } from '../types/session';
import { LiveKitInputAdapter } from '../inputs/LiveKitInputAdapter';

export class LiveKitSessionOrchestrator {
  private adapter: LiveKitInputAdapter | null = null;
  private remoteReadyResolve: (() => void) | null = null;

  async initialize(
    config: LiveKitSetupConfig & { url: string; token: string; earlyStream?: MediaStream },
    streamManager: StreamManager,
  ): Promise<{
    localStream: MediaStream | null;
    onRemoteReady: Promise<void>;
  }> {
    const myRole: ParticipantRole = config.role;
    const otherRole: ParticipantRole = myRole === 'tutor' ? 'student' : 'tutor';

    const onRemoteReady = new Promise<void>((resolve) => {
      this.remoteReadyResolve = resolve;
    });

    this.adapter = new LiveKitInputAdapter({
      url: config.url,
      token: config.token,
      inputSource: config.inputSource,
      file: config.file,
      earlyStream: config.earlyStream,
    });

    // Wire remote track callback before connecting
    let remoteResolved = false;
    this.adapter.setOnRemoteTrackSubscribed((remoteStream, _remoteVideoElement) => {
      streamManager.setStream(otherRole, remoteStream);
      // Don't set video element here — Dashboard's VideoPreview provides the DOM
      // element, which is reliable for MediaPipe. This callback fires for every
      // remote track (video + audio), so it would race with Dashboard and overwrite
      // the DOM element with the off-DOM one.

      if (!remoteResolved) {
        remoteResolved = true;
        this.remoteReadyResolve?.();
      }
    });

    // Connect to room and publish local tracks
    await this.adapter.initialize();

    // Wire local streams to StreamManager
    const localStream = this.adapter.getMediaStream();

    if (localStream) streamManager.setStream(myRole, localStream);
    // Video element is set by Dashboard's VideoPreview (DOM element), not here.

    return { localStream, onRemoteReady };
  }

  dispose(): void {
    this.adapter?.dispose();
    this.adapter = null;
    // Resolve the promise if remote never connected to avoid dangling
    this.remoteReadyResolve?.();
    this.remoteReadyResolve = null;
  }
}
