import type { GazeEstimate } from './gazeEstimation';

export interface EyeContactConfig {
  horizontalThreshold: number;  // max deviation from 0.5 center
  verticalThreshold: number;
  maxHeadYawDeg: number;
  maxHeadPitchDeg: number;
}

const DEFAULT_CONFIG: EyeContactConfig = {
  horizontalThreshold: 0.35,
  verticalThreshold: 0.4,
  maxHeadYawDeg: 30,
  maxHeadPitchDeg: 25,
};

/**
 * Pure function: GazeEstimate → smooth 0-1 eye contact score.
 * Returns 1.0 when looking straight at camera, 0.0 when looking away.
 * Smooth gradient based on distance from center — not a binary threshold.
 */
export function classifyEyeContact(
  gaze: GazeEstimate,
  config: EyeContactConfig = DEFAULT_CONFIG,
): number {
  // Head pose penalty — hard cutoff if head turned too far
  if (Math.abs(gaze.headYawDeg) > config.maxHeadYawDeg) return 0;
  if (Math.abs(gaze.headPitchDeg) > config.maxHeadPitchDeg) return 0;

  // Gaze deviation from center (0.5)
  const hDev = Math.abs(gaze.horizontalRatio - 0.5);
  const vDev = Math.abs(gaze.verticalRatio - 0.5);

  // Normalize to 0-1 where 0 = at threshold, 1 = at center
  const hScore = Math.max(0, 1 - hDev / config.horizontalThreshold);
  const vScore = Math.max(0, 1 - vDev / config.verticalThreshold);

  // Head pose attenuation (smooth reduction as head turns)
  const yawAtten = 1 - Math.abs(gaze.headYawDeg) / config.maxHeadYawDeg;
  const pitchAtten = 1 - Math.abs(gaze.headPitchDeg) / config.maxHeadPitchDeg;

  // Combined: geometric mean for balanced weighting
  return hScore * vScore * yawAtten * pitchAtten;
}
