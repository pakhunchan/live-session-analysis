import type { ParticipantMetrics } from '../types';

/** Composite engagement score. Returns 0-1, or null when required metrics are unavailable.
 *  When speaking: 80% free + 20% audio energy.
 *  When not speaking: 80% * (1 if eye contact >= 40%, else 0) + 20% video expression energy.
 *  Returns null when the active branch's metrics are unavailable. */
export function engagementScore(m: ParticipantMetrics): number | null {
  // Cannot determine which branch to use
  if (m.isSpeaking === null) return null;

  if (m.isSpeaking) {
    const audioEnergy = m.energyBreakdown?.voiceEnergy ?? 0;
    return 0.8 + audioEnergy * 0.2;
  }

  // Not speaking — requires video metrics
  if (m.eyeContactScore === null) return null;

  const eyeGate = m.eyeContactScore >= 0.4 ? 1 : 0;
  const exprEnergy = m.energyBreakdown?.expressionEnergy ?? 0;
  return eyeGate * 0.8 + exprEnergy * 0.2;
}
