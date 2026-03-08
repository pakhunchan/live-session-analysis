import type { ParticipantRole } from '../types';

export interface InterruptionEvent {
  timestamp: number;
  interrupter: ParticipantRole;
  durationMs: number;
}

export interface InterruptionConfig {
  minOverlapDurationMs: number;
  cooldownMs: number;
  backchannelThresholdMs: number;
}

const DEFAULT_CONFIG: InterruptionConfig = {
  minOverlapDurationMs: 500,
  cooldownMs: 2000,
  backchannelThresholdMs: 400,
};

export class InterruptionDetector {
  private config: InterruptionConfig;
  private interruptions: InterruptionEvent[] = [];

  private overlapStartMs: number | null = null;
  private lastInterruptionMs = -Infinity;

  // Track who started speaking first during overlap
  private tutorSpeakingBefore = false;
  private studentSpeakingBefore = false;

  constructor(config: Partial<InterruptionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  update(
    tutorSpeaking: boolean,
    studentSpeaking: boolean,
    timestampMs: number,
  ): void {
    const bothSpeaking = tutorSpeaking && studentSpeaking;

    if (bothSpeaking && this.overlapStartMs === null) {
      // Overlap just started — snapshot who was speaking BEFORE overlap
      // (don't overwrite these during the overlap)
      this.overlapStartMs = timestampMs;
    }

    if (!bothSpeaking && this.overlapStartMs !== null) {
      // Overlap just ended
      const overlapDuration = timestampMs - this.overlapStartMs;
      this.overlapStartMs = null;

      // Skip backchannels (very short overlaps)
      if (overlapDuration < this.config.backchannelThresholdMs) {
        return;
      }

      // Skip if below min overlap duration
      if (overlapDuration < this.config.minOverlapDurationMs) {
        return;
      }

      // Skip if within cooldown
      if (timestampMs - this.lastInterruptionMs < this.config.cooldownMs) {
        return;
      }

      // Determine interrupter: whoever was NOT speaking before overlap
      let interrupter: ParticipantRole;
      if (this.tutorSpeakingBefore && !this.studentSpeakingBefore) {
        interrupter = 'student'; // student started speaking second
      } else if (this.studentSpeakingBefore && !this.tutorSpeakingBefore) {
        interrupter = 'tutor'; // tutor started speaking second
      } else {
        interrupter = 'student'; // default fallback
      }

      this.interruptions.push({
        timestamp: timestampMs,
        interrupter,
        durationMs: overlapDuration,
      });
      this.lastInterruptionMs = timestampMs;
    }

    // Only update previous state when NOT in overlap
    // so we preserve who was speaking before the overlap began
    if (!bothSpeaking) {
      this.tutorSpeakingBefore = tutorSpeaking;
      this.studentSpeakingBefore = studentSpeaking;
    }
  }

  getInterruptions(): InterruptionEvent[] {
    return [...this.interruptions];
  }

  getCount(): number {
    return this.interruptions.length;
  }

  reset(): void {
    this.interruptions = [];
    this.overlapStartMs = null;
    this.lastInterruptionMs = -Infinity;
    this.tutorSpeakingBefore = false;
    this.studentSpeakingBefore = false;
  }
}
