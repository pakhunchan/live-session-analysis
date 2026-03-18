/**
 * Shared engagement logic — single source of truth for eye-contact gating
 * and engagement score computation. Used by both frontend and backend.
 */

/** Eye contact score at or above this threshold = "looking at screen" */
export const EYE_CONTACT_THRESHOLD = 0.40;

/** Returns true if the participant is looking at the screen. */
export function isLookingAtScreen(eyeContactScore: number | null): boolean {
  if (eyeContactScore === null) return false;
  return eyeContactScore >= EYE_CONTACT_THRESHOLD;
}

/**
 * Composite engagement score (0-1).
 *
 * Speaking:     0.8 + voiceEnergy * 0.2  (range 0.80–1.00)
 * Not speaking: eyeGate * 0.8 + videoEnergy * 0.2
 *   where eyeGate = 1 if isLookingAtScreen, else 0
 *
 * Returns null when required metrics are unavailable.
 */
export function computeEngagementScore(opts: {
  isSpeaking: boolean | null;
  eyeContactScore: number | null;
  voiceEnergy: number;
  videoEnergy: number;
}): number | null {
  if (opts.isSpeaking === null) return null;

  if (opts.isSpeaking) {
    return 0.8 + opts.voiceEnergy * 0.2;
  }

  if (opts.eyeContactScore === null) return null;

  const eyeGate = isLookingAtScreen(opts.eyeContactScore) ? 1 : 0;
  return eyeGate * 0.8 + opts.videoEnergy * 0.2;
}
