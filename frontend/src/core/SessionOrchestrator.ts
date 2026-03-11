import type { SessionSetupConfig } from '../types/session';
import type { InputAdapter } from '../inputs/InputAdapter';
import type { StreamManager } from './StreamManager';
import { FileInputAdapter } from '../inputs/FileInputAdapter';
import { LiveInputAdapter } from '../inputs/LiveInputAdapter';
import type { ParticipantRole } from '../types/metrics';

export class SessionOrchestrator {
  private adapters: Record<ParticipantRole, InputAdapter | null> = {
    tutor: null,
    student: null,
  };

  private createAdapter(config: SessionSetupConfig['tutor']): InputAdapter {
    if (config.source === 'file') {
      if (!config.file) throw new Error('File required for file input source');
      return new FileInputAdapter(config.file, { playAudio: config.playAudio });
    }
    return new LiveInputAdapter();
  }

  async initialize(
    config: SessionSetupConfig,
    streamManager: StreamManager,
  ): Promise<{
    streams: Record<ParticipantRole, MediaStream | null>;
    videoElements: Record<ParticipantRole, HTMLVideoElement | null>;
  }> {
    const tutorAdapter = this.createAdapter(config.tutor);
    const studentAdapter = this.createAdapter(config.student);

    this.adapters.tutor = tutorAdapter;
    this.adapters.student = studentAdapter;

    await Promise.all([
      tutorAdapter.initialize(),
      studentAdapter.initialize(),
    ]);

    const roles: ParticipantRole[] = ['tutor', 'student'];
    const streams: Record<ParticipantRole, MediaStream | null> = { tutor: null, student: null };
    const videoElements: Record<ParticipantRole, HTMLVideoElement | null> = { tutor: null, student: null };

    for (const role of roles) {
      const adapter = this.adapters[role]!;
      const videoEl = adapter.getVideoElement();
      const stream = adapter.getMediaStream();

      if (videoEl) streamManager.setVideoElement(role, videoEl);
      if (stream) streamManager.setStream(role, stream);

      streams[role] = stream;
      videoElements[role] = videoEl;
    }

    return { streams, videoElements };
  }

  dispose(): void {
    for (const role of ['tutor', 'student'] as ParticipantRole[]) {
      this.adapters[role]?.dispose();
      this.adapters[role] = null;
    }
  }
}
