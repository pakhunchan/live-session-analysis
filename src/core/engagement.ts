import type { ParticipantMetrics } from '../types';

/** Composite engagement score: eye contact (67%) + energy (33%). Returns 0-1. */
export function engagementScore(m: ParticipantMetrics): number {
  return m.eyeContactScore * 0.67 + m.energyScore * 0.33;
}
