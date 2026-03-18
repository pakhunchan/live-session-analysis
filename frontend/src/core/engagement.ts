import type { ParticipantMetrics } from '../types';
import { computeEngagementScore } from '../../../shared/engagement';

/** Thin wrapper around shared computeEngagementScore for ParticipantMetrics. */
export function engagementScore(m: ParticipantMetrics): number | null {
  return computeEngagementScore({
    isSpeaking: m.isSpeaking,
    eyeContactScore: m.eyeContactScore,
    voiceEnergy: m.energyBreakdown?.voiceEnergy ?? 0,
    videoEnergy: m.expressionEnergy ?? 0,
  });
}
