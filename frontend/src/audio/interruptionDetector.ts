import type { InterruptionCategory, InterruptionCounts, ParticipantRole } from '../types';

export interface InterruptionEvent {
  timestamp: number;
  interrupter: ParticipantRole;
  category: InterruptionCategory;
  durationMs: number;
}

export interface InterruptionConfig {
  /** Minimum overlap duration to count as an interruption (filters backchannels too) */
  minOverlapDurationMs: number;
  cooldownMs: number;
  /** How long the original speaker must have been talking to count as a real interruption */
  establishedSpeakerMs: number;
}

const DEFAULT_CONFIG: InterruptionConfig = {
  minOverlapDurationMs: 500,
  cooldownMs: 2000,
  establishedSpeakerMs: 1000,
};

export class InterruptionDetector {
  private config: InterruptionConfig;
  private interruptions: InterruptionEvent[] = [];

  private overlapStartMs: number | null = null;
  private lastInterruptionMs = -Infinity;

  // Track who started speaking first during overlap
  private tutorSpeakingBefore = false;
  private studentSpeakingBefore = false;

  // Track when each participant's current speaking turn started
  private tutorSpeakStartMs: number | null = null;
  private studentSpeakStartMs: number | null = null;

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
      const overlapStart = this.overlapStartMs;
      const overlapDuration = timestampMs - overlapStart;
      this.overlapStartMs = null;

      // Skip short overlaps (backchannels, near-simultaneous starts)
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

      // Categorize: was the original speaker established (>1s) before overlap began?
      const category = this.categorize(interrupter, overlapStart);

      this.interruptions.push({
        timestamp: timestampMs,
        interrupter,
        category,
        durationMs: overlapDuration,
      });
      this.lastInterruptionMs = timestampMs;
    }

    // Only update previous state when NOT in overlap
    // so we preserve who was speaking before the overlap began
    if (!bothSpeaking) {
      this.tutorSpeakingBefore = tutorSpeaking;
      this.studentSpeakingBefore = studentSpeaking;

      // Track speak turn start times
      if (tutorSpeaking && this.tutorSpeakStartMs === null) {
        this.tutorSpeakStartMs = timestampMs;
      } else if (!tutorSpeaking) {
        this.tutorSpeakStartMs = null;
      }

      if (studentSpeaking && this.studentSpeakStartMs === null) {
        this.studentSpeakStartMs = timestampMs;
      } else if (!studentSpeaking) {
        this.studentSpeakStartMs = null;
      }
    }
  }

  private categorize(interrupter: ParticipantRole, overlapStartMs: number): InterruptionCategory {
    // The original speaker is whoever was NOT the interrupter
    const originalSpeakerStartMs = interrupter === 'student'
      ? this.tutorSpeakStartMs
      : this.studentSpeakStartMs;

    if (originalSpeakerStartMs === null) {
      return 'accident';
    }

    const speakingDuration = overlapStartMs - originalSpeakerStartMs;
    if (speakingDuration >= this.config.establishedSpeakerMs) {
      // Original speaker was established — this is a real interruption
      return interrupter === 'student' ? 'student_interrupted' : 'tutor_interrupted';
    }

    return 'accident';
  }

  getInterruptions(): InterruptionEvent[] {
    return [...this.interruptions];
  }

  getCount(): number {
    return this.interruptions.length;
  }

  getCounts(): InterruptionCounts {
    const counts: InterruptionCounts = { student: 0, tutor: 0, accident: 0 };
    for (const e of this.interruptions) {
      switch (e.category) {
        case 'student_interrupted': counts.student++; break;
        case 'tutor_interrupted': counts.tutor++; break;
        case 'accident': counts.accident++; break;
      }
    }
    return counts;
  }

  reset(): void {
    this.interruptions = [];
    this.overlapStartMs = null;
    this.lastInterruptionMs = -Infinity;
    this.tutorSpeakingBefore = false;
    this.studentSpeakingBefore = false;
    this.tutorSpeakStartMs = null;
    this.studentSpeakStartMs = null;
  }
}
