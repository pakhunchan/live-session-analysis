import type { MicVAD } from '@ricky0123/vad-web';
import type { ParticipantRole } from '../types';

export interface VadManagerConfig {
  positiveSpeechThreshold: number;
  redemptionMs: number;
}

const DEFAULT_CONFIG: VadManagerConfig = {
  positiveSpeechThreshold: 0.5,
  redemptionMs: 400,  // ms grace period before ending speech
};

export class VadManager {
  private config: VadManagerConfig;
  private vads: Partial<Record<ParticipantRole, MicVAD>> = {};
  private speakingState: Record<ParticipantRole, boolean> = {
    tutor: false,
    student: false,
  };

  constructor(config: Partial<VadManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async startForParticipant(role: ParticipantRole, stream: MediaStream): Promise<void> {
    // Dynamic import — vad-web is a browser-only module
    const { MicVAD } = await import('@ricky0123/vad-web');

    const vad = await MicVAD.new({
      getStream: async () => stream,
      positiveSpeechThreshold: this.config.positiveSpeechThreshold,
      redemptionMs: this.config.redemptionMs,
      onSpeechStart: () => {
        this.speakingState[role] = true;
      },
      onSpeechEnd: (_audio: Float32Array) => {
        this.speakingState[role] = false;
      },
    });

    vad.start();
    this.vads[role] = vad;
  }

  /** Returns speaking state, or undefined if VAD not yet initialized for this role */
  isSpeaking(role: ParticipantRole): boolean | undefined {
    if (!this.vads[role]) return undefined;
    return this.speakingState[role];
  }

  async destroy(): Promise<void> {
    for (const role of ['tutor', 'student'] as ParticipantRole[]) {
      const vad = this.vads[role];
      if (vad) {
        await vad.destroy();
        delete this.vads[role];
      }
    }
    this.speakingState = { tutor: false, student: false };
  }
}
