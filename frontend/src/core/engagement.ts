import type { ParticipantMetrics } from '../types';

/** Composite engagement score. Returns 0-1, or null when required metrics are unavailable.
 *  When speaking: 80% free + 20% audio energy.
 *  When not speaking: (1 if eye contact >= 50%, else 0) * 0.8 + video energy * 0.2.
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

  const eyeGate = m.eyeContactScore >= 0.5 ? 1 : 0;
  const videoEnergy = m.expressionEnergy ?? 0;
  return eyeGate * 0.8 + videoEnergy * 0.2;
}
