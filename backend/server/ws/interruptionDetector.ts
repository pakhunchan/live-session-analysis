type ParticipantRole = 'tutor' | 'student';

interface AudioDataPoint {
  participant: ParticipantRole;
  isSpeaking: boolean;
  /** Client timestamp corrected to server time via clock offset */
  correctedTs: number;
}

export interface InterruptionEvent {
  timestamp: number;
  interrupter: ParticipantRole;
  interrupted: ParticipantRole;
  overlapDurationMs: number;
}

export interface InterruptionCounts {
  student: number;
  tutor: number;
  accident: number;
}

/**
 * Watermark-based interruption detector.
 *
 * Buffers incoming audio data points from both participants, processes them
 * in corrected-timestamp order once the watermark (min of latest timestamps
 * from each participant) advances.
 *
 * Rules:
 * - Original speaker must have been talking for >= 500ms before the other starts
 * - Both must overlap for >= 500ms to count
 * - Cooldown: 3s if the interrupted speaker kept talking nonstop, 1s if they paused
 */
export class InterruptionDetector {
  private buffer: AudioDataPoint[] = [];
  private latestTs: Record<ParticipantRole, number> = { tutor: -Infinity, student: -Infinity };
  private watermark = -Infinity;

  // Per-participant state
  private speakStartMs: Record<ParticipantRole, number | null> = { tutor: null, student: null };
  private wasSpeaking: Record<ParticipantRole, boolean> = { tutor: false, student: false };

  // Overlap tracking
  private overlapStartMs: number | null = null;
  private firstSpeakerAtOverlap: ParticipantRole | null = null;
  private firstSpeakerDurationAtOverlap = 0;

  // Cooldown tracking
  private interruptions: InterruptionEvent[] = [];
  private lastInterruptionMs = -Infinity;
  private lastInterruptedSpeaker: ParticipantRole | null = null;
  private interruptedSpeakerPausedSince = false;

  private readonly MIN_OVERLAP_MS = 750;
  private readonly ESTABLISHED_SPEAKER_MS = 1000;
  private readonly COOLDOWN_CONTINUOUS_MS = 3000;
  private readonly COOLDOWN_PAUSED_MS = 2000;

  /**
   * Ingest an audio data point. correctedTs = dp.timestamp + clockOffset.
   */
  push(dp: AudioDataPoint): void {
    this.buffer.push(dp);
    this.latestTs[dp.participant] = Math.max(this.latestTs[dp.participant], dp.correctedTs);
    this.drain();
  }

  /** Force-process all buffered data points (e.g., on disconnect). */
  flush(): void {
    this.processUpTo(Infinity);
  }

  getCounts(): InterruptionCounts {
    const counts: InterruptionCounts = { student: 0, tutor: 0, accident: 0 };
    for (const e of this.interruptions) {
      counts[e.interrupted]++;
    }
    return counts;
  }

  getInterruptions(): InterruptionEvent[] {
    return [...this.interruptions];
  }

  private drain(): void {
    const tT = this.latestTs.tutor;
    const tS = this.latestTs.student;

    let newWatermark: number;
    if (tT === -Infinity && tS === -Infinity) return;            // no data yet
    if (tT === -Infinity) newWatermark = tS;                     // only student so far
    else if (tS === -Infinity) newWatermark = tT;                // only tutor so far
    else newWatermark = Math.min(tT, tS);                        // both present

    if (newWatermark <= this.watermark) return;
    this.watermark = newWatermark;
    this.processUpTo(this.watermark);
  }

  private processUpTo(upTo: number): void {
    this.buffer.sort((a, b) => a.correctedTs - b.correctedTs);

    const remaining: AudioDataPoint[] = [];
    for (const dp of this.buffer) {
      if (dp.correctedTs <= upTo) {
        this.step(dp);
      } else {
        remaining.push(dp);
      }
    }
    this.buffer = remaining;
  }

  private other(role: ParticipantRole): ParticipantRole {
    return role === 'tutor' ? 'student' : 'tutor';
  }

  private step(dp: AudioDataPoint): void {
    const { participant: role, isSpeaking, correctedTs: ts } = dp;

    // Detect start/stop transitions
    const wasSpk = this.wasSpeaking[role];
    if (isSpeaking && !wasSpk) {
      this.speakStartMs[role] = ts;
    } else if (!isSpeaking && wasSpk) {
      this.speakStartMs[role] = null;
      // Track if the interrupted speaker from the last interruption paused
      if (role === this.lastInterruptedSpeaker) {
        this.interruptedSpeakerPausedSince = true;
      }
    }
    this.wasSpeaking[role] = isSpeaking;

    const bothSpeaking = this.wasSpeaking.tutor && this.wasSpeaking.student;

    // --- Overlap start ---
    if (bothSpeaking && this.overlapStartMs === null) {
      this.overlapStartMs = ts;

      // Who was already speaking? The one whose speakStartMs is earlier.
      const tutorStart = this.speakStartMs.tutor;
      const studentStart = this.speakStartMs.student;

      if (tutorStart !== null && studentStart !== null) {
        if (tutorStart < studentStart) {
          this.firstSpeakerAtOverlap = 'tutor';
          this.firstSpeakerDurationAtOverlap = ts - tutorStart;
        } else {
          this.firstSpeakerAtOverlap = 'student';
          this.firstSpeakerDurationAtOverlap = ts - studentStart;
        }
      } else {
        this.firstSpeakerAtOverlap = null;
        this.firstSpeakerDurationAtOverlap = 0;
      }
    }

    // --- Overlap end ---
    if (!bothSpeaking && this.overlapStartMs !== null) {
      const overlapDuration = ts - this.overlapStartMs;
      const overlapStart = this.overlapStartMs;
      this.overlapStartMs = null;

      // Must overlap for >= 500ms
      if (overlapDuration < this.MIN_OVERLAP_MS) return;

      // Original speaker must have been established for >= 500ms
      if (this.firstSpeakerAtOverlap === null) return;
      if (this.firstSpeakerDurationAtOverlap < this.ESTABLISHED_SPEAKER_MS) return;

      const interrupted = this.firstSpeakerAtOverlap;
      const interrupter = this.other(interrupted);

      // Apply cooldown
      const cooldown = this.interruptedSpeakerPausedSince
        ? this.COOLDOWN_PAUSED_MS
        : this.COOLDOWN_CONTINUOUS_MS;

      if (ts - this.lastInterruptionMs < cooldown) return;

      this.interruptions.push({
        timestamp: overlapStart,
        interrupter,
        interrupted,
        overlapDurationMs: overlapDuration,
      });

      this.lastInterruptionMs = ts;
      this.lastInterruptedSpeaker = interrupted;
      this.interruptedSpeakerPausedSince = false;
    }
  }
}
