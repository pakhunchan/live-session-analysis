export class TalkTimeAccumulator {
  private tutorSpeakingMs = 0;
  private studentSpeakingMs = 0;
  private silenceDurationMs = 0;
  private lastUpdateTime: number | null = null;

  update(tutorSpeaking: boolean, studentSpeaking: boolean, timestampMs?: number): void {
    const now = timestampMs ?? Date.now();

    if (this.lastUpdateTime !== null) {
      const deltaMs = now - this.lastUpdateTime;

      if (tutorSpeaking) this.tutorSpeakingMs += deltaMs;
      if (studentSpeaking) this.studentSpeakingMs += deltaMs;

      if (!tutorSpeaking && !studentSpeaking) {
        this.silenceDurationMs += deltaMs;
      } else {
        this.silenceDurationMs = 0;
      }
    }

    this.lastUpdateTime = now;
  }

  getTalkTimePercent(): { tutor: number; student: number } {
    const total = this.tutorSpeakingMs + this.studentSpeakingMs;
    if (total === 0) return { tutor: 0, student: 0 };

    return {
      tutor: this.tutorSpeakingMs / total,
      student: this.studentSpeakingMs / total,
    };
  }

  getTotalSpeakingMs(): { tutor: number; student: number } {
    return { tutor: this.tutorSpeakingMs, student: this.studentSpeakingMs };
  }

  getCurrentSilenceDurationMs(): number {
    return this.silenceDurationMs;
  }

  reset(): void {
    this.tutorSpeakingMs = 0;
    this.studentSpeakingMs = 0;
    this.silenceDurationMs = 0;
    this.lastUpdateTime = null;
  }
}
