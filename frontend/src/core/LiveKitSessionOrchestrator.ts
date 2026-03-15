import type { StreamManager } from './StreamManager';
import type { ParticipantRole } from '../types/metrics';
import type { LiveKitSetupConfig } from '../types/session';
import { LiveKitInputAdapter } from '../inputs/LiveKitInputAdapter';

export interface RemoteReadyResult {
  stream: MediaStream | null;
  displayName: string | null;
}

export class LiveKitSessionOrchestrator {
  private adapter: LiveKitInputAdapter | null = null;
  private remoteReadyResolve: ((result: RemoteReadyResult) => void) | null = null;

  async initialize(
    config: LiveKitSetupConfig & { url: string; token: string; earlyStream?: MediaStream },
    streamManager: StreamManager,
  ): Promise<{
    localStream: MediaStream | null;
    onRemoteReady: Promise<RemoteReadyResult>;
  }> {
    const myRole: ParticipantRole = config.role;

    const onRemoteReady = new Promise<RemoteReadyResult>((resolve) => {
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
    this.adapter.setOnRemoteTrackSubscribed((stream, _remoteVideoElement, participant) => {
      // Don't register remote stream on StreamManager — each device processes only
      // its own camera/mic. Remote streams are used for playback only (via
      // VideoPreview's stream prop + LiveKit's audio element).

      if (!remoteResolved) {
        remoteResolved = true;
        let displayName: string | null = null;
        try {
          const meta = participant.metadata ? JSON.parse(participant.metadata) : {};
          displayName = meta.displayName ?? null;
        } catch { /* ignore parse errors */ }
        this.remoteReadyResolve?.({ stream, displayName });
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
    this.remoteReadyResolve?.({ stream: null, displayName: null });
    this.remoteReadyResolve = null;
  }
}
