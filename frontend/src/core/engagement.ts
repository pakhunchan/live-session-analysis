import type { ParticipantMetrics } from '../types';

/** Composite engagement score. Returns 0-1.
 *  When not speaking: 80% * (1 if eye contact >= 40%, else 0) + 20% video expression energy.
 *  When speaking: 80% free + 20% audio energy. */
export function engagementScore(m: ParticipantMetrics): number {
  if (m.isSpeaking) {
    const audioEnergy = m.energyBreakdown?.voiceEnergy ?? 0;
    return 0.8 + audioEnergy * 0.2;
  }
  const eyeGate = m.eyeContactScore >= 0.4 ? 1 : 0;
  const exprEnergy = m.energyBreakdown?.expressionEnergy ?? 0;
  return eyeGate * 0.8 + exprEnergy * 0.2;
}
