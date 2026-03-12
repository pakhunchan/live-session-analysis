import { EventBus } from '../core/EventBus';
import { EventType } from '../types';
import type { MetricSnapshot, Nudge, NudgeRule, CoachingConfig } from '../types';
import { defaultRules } from './defaultRules';

let nudgeCounter = 0;

function generateNudgeId(): string {
  return `nudge-${++nudgeCounter}`;
}

export class NudgeEngine {
  private bus: EventBus;
  private config: CoachingConfig;
  private lastFiredMs: Map<string, number> = new Map();
  private unsubscribe: (() => void) | null = null;
  private nudgeHistory: Nudge[] = [];

  constructor(bus: EventBus, config?: Partial<CoachingConfig>) {
    this.bus = bus;
    this.config = {
      enabled: true,
      suppressDuringTutorSpeech: true,
      maxNudgesPerMinute: 3,
      rules: defaultRules,
      ...config,
    };
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.bus.on<MetricSnapshot>(
      EventType.METRIC_SNAPSHOT,
      (event) => this.evaluate(event.payload),
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  evaluate(snapshot: MetricSnapshot): Nudge[] {
    if (!this.config.enabled) return [];

    // Suppress all nudges while the tutor is speaking
    if (this.config.suppressDuringTutorSpeech && snapshot.tutor.isSpeaking) {
      return [];
    }

    // Rate limit: max N nudges per minute
    const oneMinuteAgo = snapshot.timestamp - 60_000;
    const recentNudges = this.nudgeHistory.filter(
      (n) => n.timestamp > oneMinuteAgo,
    );
    if (recentNudges.length >= this.config.maxNudgesPerMinute) {
      return [];
    }

    const firedNudges: Nudge[] = [];

    for (const rule of this.config.rules) {
      // Per-rule cooldown
      const lastFired = this.lastFiredMs.get(rule.type) ?? -Infinity;
      if (snapshot.timestamp - lastFired < rule.cooldownMs) continue;

      // Check if we'd exceed rate limit with this additional nudge
      if (recentNudges.length + firedNudges.length >= this.config.maxNudgesPerMinute) {
        break;
      }

      if (rule.condition(snapshot)) {
        const nudge: Nudge = {
          id: generateNudgeId(),
          type: rule.type,
          message: rule.message,
          priority: rule.priority,
          timestamp: snapshot.timestamp,
          triggerMetrics: this.extractTriggerMetrics(snapshot, rule),
        };

        firedNudges.push(nudge);
        this.lastFiredMs.set(rule.type, snapshot.timestamp);
        this.nudgeHistory.push(nudge);
        this.bus.emit(EventType.NUDGE, nudge);
      }
    }

    return firedNudges;
  }

  getNudgeHistory(): Nudge[] {
    return [...this.nudgeHistory];
  }

  reset(): void {
    this.lastFiredMs.clear();
    this.nudgeHistory = [];
    nudgeCounter = 0;
  }

  private extractTriggerMetrics(
    snapshot: MetricSnapshot,
    rule: NudgeRule,
  ): Record<string, number> {
    switch (rule.type) {
      case 'student_silent':
        return { silenceDurationMs: snapshot.session.currentSilenceDurationMs };
      case 'low_eye_contact':
        return { eyeContactScore: snapshot.student.eyeContactScore };
      case 'tutor_talk_dominant':
        return { tutorTalkTime: snapshot.tutor.talkTimePercent };
      case 'energy_drop':
        return {
          studentEnergy: snapshot.student.energyScore,
          tutorEnergy: snapshot.tutor.energyScore,
        };
      case 'interruption_spike': {
        const { student, tutor, accident } = snapshot.session.interruptions;
        return { interruptionCount: student + tutor + accident };
      }
      default:
        return {};
    }
  }
}
