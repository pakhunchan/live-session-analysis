import type { MetricSnapshot } from './metrics';

export type NudgeType =
  | 'student_silent'
  | 'low_eye_contact'
  | 'tutor_talk_dominant'
  | 'energy_drop'
  | 'interruption_spike';

export type NudgePriority = 'low' | 'medium' | 'high';

export interface Nudge {
  id: string;
  type: NudgeType;
  message: string;
  priority: NudgePriority;
  timestamp: number;
  triggerMetrics: Record<string, number>;
}

export interface NudgeRule {
  type: NudgeType;
  message: string;
  priority: NudgePriority;
  cooldownMs: number;
  condition: (snapshot: MetricSnapshot) => boolean;
}

export interface CoachingConfig {
  enabled: boolean;
  suppressDuringTutorSpeech: boolean;
  maxNudgesPerMinute: number;
  rules: NudgeRule[];
}
