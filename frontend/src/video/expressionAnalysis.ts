import type { FaceLandmark, BlendshapeEntry } from './FaceDetector';

/**
 * Per-frame raw signals extracted from blendshapes or landmarks.
 * These capture instantaneous face state; temporal patterns (variance)
 * are computed in computeExpressionEnergy over the history window.
 */
export interface ExpressionFeatures {
  eyeOpenness: number;    // 0-1, how open the eyes are (inverted blink)
  browPosition: number;   // 0-1, combined brow state (raise + furrow)
  browPositionL: number;  // 0-1, left brow (for ipsilateral variance)
  browPositionR: number;  // 0-1, right brow (for ipsilateral variance)
  lipOpenness: number;    // 0-1, jaw/mouth opening (speech proxy)
  genuineSmile: number;   // 0-1, smile (mouthSmile + cheekSquint bonus)
  // New engagement signals (instantaneous)
  eyeWideness: number;    // 0-1, AU5 — surprise / "aha" moments
  lipTension: number;     // 0-1, mouthPress + mouthRollLower — silent concentration
}

export interface ExpressionWeights {
  blinkActivity: number;
  browActivity: number;
  lipActivity: number;
  genuineSmile: number;
}

const DEFAULT_WEIGHTS: ExpressionWeights = {
  blinkActivity: 0.25,
  browActivity: 0.25,
  lipActivity: 0.25,
  genuineSmile: 0.25,
};

function findBlendshape(blendshapes: BlendshapeEntry[], name: string): number {
  const entry = blendshapes.find((b) => b.categoryName === name);
  return entry?.score ?? 0;
}

/**
 * Extract per-frame expression signals from MediaPipe blendshapes.
 *
 * Research basis:
 * - eyeOpenness: blink rate/variability is a top engagement signal
 * - browPosition: AU1+AU2 (raise) and AU4 (furrow) correlate with
 *   attention, acknowledgment, and concentration
 * - lipOpenness: jawOpen fluctuates with every syllable, captures speech
 * - genuineSmile: Duchenne smile requires both mouthSmile AND cheekSquint
 */
export function extractBlendshapeFeatures(blendshapes: BlendshapeEntry[]): ExpressionFeatures {
  if (!blendshapes || blendshapes.length === 0) {
    return { eyeOpenness: 0.5, browPosition: 0, browPositionL: 0, browPositionR: 0, lipOpenness: 0, genuineSmile: 0, eyeWideness: 0, lipTension: 0 };
  }

  // Eye openness (inverted from blink — 1.0 = fully open, 0.0 = closed)
  const blinkL = findBlendshape(blendshapes, 'eyeBlinkLeft');
  const blinkR = findBlendshape(blendshapes, 'eyeBlinkRight');
  const eyeOpenness = 1 - (blinkL + blinkR) / 2;

  // Brow position: combine raise (AU1+AU2) and furrow (AU4)
  // Both indicate engagement — raise = acknowledgment, furrow = concentration
  // Per-side tracking captures unilateral brow raises (e.g. skeptical eyebrow)
  const browInnerUp = findBlendshape(blendshapes, 'browInnerUp');
  const browOuterUpL = findBlendshape(blendshapes, 'browOuterUpLeft');
  const browOuterUpR = findBlendshape(blendshapes, 'browOuterUpRight');
  const browDownL = findBlendshape(blendshapes, 'browDownLeft');
  const browDownR = findBlendshape(blendshapes, 'browDownRight');
  const browPositionL = Math.min(1, (browInnerUp + browOuterUpL) / 2 + browDownL);
  const browPositionR = Math.min(1, (browInnerUp + browOuterUpR) / 2 + browDownR);
  const browPosition = Math.min(1, (browPositionL + browPositionR) / 2);

  // Lip/jaw openness (speech proxy)
  const jawOpen = findBlendshape(blendshapes, 'jawOpen');
  const lipOpenness = Math.min(1, jawOpen);

  // Smile detection: use mouthSmile directly.
  // cheekSquint (Duchenne marker) is unreliable in MediaPipe webcam output
  // (consistently 0.000), so we fall back to mouth corner activation alone.
  // If cheekSquint becomes available, boost the score as a genuineness bonus.
  const smileL = findBlendshape(blendshapes, 'mouthSmileLeft');
  const smileR = findBlendshape(blendshapes, 'mouthSmileRight');
  const cheekL = findBlendshape(blendshapes, 'cheekSquintLeft');
  const cheekR = findBlendshape(blendshapes, 'cheekSquintRight');
  const mouthSmile = (smileL + smileR) / 2;
  const cheekSquint = (cheekL + cheekR) / 2;
  // Base score from mouth corners; cheekSquint adds up to 20% bonus.
  // sqrt curve: for engagement, a subtle smile matters almost as much as a
  // big grin. sqrt(0.25)=0.50, sqrt(0.50)=0.71 — boosts low values.
  const rawSmile = Math.min(1, mouthSmile + cheekSquint * 0.2);
  const genuineSmile = Math.sqrt(rawSmile);

  // Eye widening (AU5) — surprise / "aha" moments
  // MediaPipe eyeWide has low dynamic range on webcams (typically 0-0.08).
  // Scale up to fill 0-1. No baseline subtraction — varies too much across faces.
  const eyeWideL = findBlendshape(blendshapes, 'eyeWideLeft');
  const eyeWideR = findBlendshape(blendshapes, 'eyeWideRight');
  const eyeWideness = Math.min(1, (eyeWideL + eyeWideR) / 2 * 15);

  // Silent concentration — mouthPress + mouthRollLower when jaw closed
  const mouthPressL = findBlendshape(blendshapes, 'mouthPressLeft');
  const mouthPressR = findBlendshape(blendshapes, 'mouthPressRight');
  const mouthRollLower = findBlendshape(blendshapes, 'mouthRollLower');
  const mouthPress = (mouthPressL + mouthPressR) / 2;
  const jawClosed = 1 - jawOpen; // gate: only counts when mouth is closed
  // Use max(press, roll) — mouthRollLower carries most of the signal,
  // averaging with the weak mouthPress dilutes it
  const lipTension = Math.min(1, Math.max(mouthPress, mouthRollLower) * 2 * jawClosed);

  return { eyeOpenness, browPosition, browPositionL, browPositionR, lipOpenness, genuineSmile, eyeWideness, lipTension };
}

/**
 * Fallback: extract expression signals from landmarks when blendshapes unavailable.
 *
 * Uses bilateral measurements (both eyes, both brows), outer lip contour,
 * and cheek-to-eye distance for landmark-based Duchenne smile detection.
 */
export function extractLandmarkFeatures(landmarks: FaceLandmark[]): ExpressionFeatures {
  if (landmarks.length < 468) {
    return { eyeOpenness: 0.5, browPosition: 0, browPositionL: 0, browPositionR: 0, lipOpenness: 0, genuineSmile: 0, eyeWideness: 0, lipTension: 0 };
  }

  // Eye openness — bilateral average (both eyes)
  const leftEyeH = Math.abs(landmarks[145].y - landmarks[159].y);
  const rightEyeH = Math.abs(landmarks[374].y - landmarks[386].y);
  const eyeOpenness = Math.min(1, (leftEyeH + rightEyeH) / 2 / 0.04);

  // Brow position — bilateral (105 = right brow, 334 = left brow)
  const browDistL = Math.abs(landmarks[159].y - landmarks[105].y);
  const browDistR = Math.abs(landmarks[386].y - landmarks[334].y);
  const browPositionL = Math.min(1, browDistL / 0.04);
  const browPositionR = Math.min(1, browDistR / 0.04);
  const browPosition = (browPositionL + browPositionR) / 2;

  // Lip openness — inner (13/14) and outer (0/17) lip distance, take max
  const innerMouthH = Math.abs(landmarks[14].y - landmarks[13].y);
  const outerMouthH = Math.abs(landmarks[17].y - landmarks[0].y);
  const lipOpenness = Math.min(1, Math.max(innerMouthH / 0.06, outerMouthH / 0.08));

  // Smile — mouth width + cheek raise bonus (landmark-based Duchenne detection)
  const mouthWidth = Math.abs(landmarks[291].x - landmarks[61].x);
  const mouthSmile = Math.min(1, mouthWidth / 0.15);

  // Cheek raise: upper cheek (50/280) to eye bottom (145/374) distance,
  // normalized by nose-to-chin height. Genuine smiles push cheeks up, shrinking this ratio.
  const noseChinH = Math.abs(landmarks[152].y - landmarks[1].y) || 0.1;
  const cheekEyeL = Math.abs(landmarks[50].y - landmarks[145].y) / noseChinH;
  const cheekEyeR = Math.abs(landmarks[280].y - landmarks[374].y) / noseChinH;
  const avgCheekEyeRatio = (cheekEyeL + cheekEyeR) / 2;
  // At rest ~0.30-0.40; when genuinely smiling drops to ~0.15-0.25
  const cheekRaise = Math.min(1, Math.max(0, (0.35 - avgCheekEyeRatio) / 0.15));
  const genuineSmile = Math.min(1, mouthSmile + cheekRaise * 0.2);

  return { eyeOpenness, browPosition, browPositionL, browPositionR, lipOpenness, genuineSmile, eyeWideness: 0, lipTension: 0 };
}

/**
 * Compute activity as exponentially-weighted average of frame-to-frame deltas.
 *
 * Unlike flat-window variance (which lingers for the full window duration),
 * EMA gives recent frames more weight and decays smoothly.  With decay=0.2
 * at 2 FPS, after 2 frames (1s) only 4% of the peak remains — effectively zero.
 *
 * @param values  Time-ordered signal values (oldest first)
 * @param scale   Multiplier to fill 0-1 range (signal-dependent)
 * @param decay   Weight carried from previous frame (0-1). Lower = faster decay.
 */
function emaActivity(values: number[], scale: number, decay: number = 0.2): number {
  if (values.length < 2) return 0;
  let activity = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = Math.abs(values[i] - values[i - 1]);
    activity = decay * activity + (1 - decay) * delta;
  }
  return Math.min(1, activity * scale);
}

export interface ExpressionEnergyResult {
  energy: number;
  blinkActivity: number;
  browActivity: number;
  lipActivity: number;
  genuineSmile: number;
  // New engagement metrics (debug only — not in energy score)
  headNodActivity: number;
  eyeWideness: number;
  lipTension: number;
}

/**
 * Compute expression energy from per-frame features + temporal history.
 *
 * Key insight from research: engagement is a TIME-SERIES pattern.
 * We measure variability of signals over a window, not instantaneous values.
 * - blinkActivity: variance of eyeOpenness (active blinking = engaged)
 * - browActivity: variance of browPosition (micro-expressions = listening)
 * - lipActivity: variance of lipOpenness (talking/reacting)
 * - genuineSmile: instantaneous value (Duchenne smile doesn't need variance)
 */
export function computeExpressionEnergy(
  features: ExpressionFeatures,
  recentHistory: ExpressionFeatures[] = [],
  weights: ExpressionWeights = DEFAULT_WEIGHTS,
  headPitchHistory: number[] = [],
): ExpressionEnergyResult {
  // New instantaneous metrics (always available)
  const eyeWideness = features.eyeWideness;
  const lipTension = features.lipTension;

  // Head nod activity: EMA of pitch deltas (pitch in radians, small values → scale up)
  const headNodActivity = emaActivity(headPitchHistory, 15);

  if (recentHistory.length < 2) {
    // Not enough history for variance — use genuine smile as sole signal
    return {
      energy: Math.min(1, features.genuineSmile * weights.genuineSmile * 4),
      blinkActivity: 0,
      browActivity: 0,
      lipActivity: 0,
      genuineSmile: features.genuineSmile,
      headNodActivity,
      eyeWideness,
      lipTension,
    };
  }

  const blinkActivity = emaActivity(recentHistory.map((f) => f.eyeOpenness), 3);
  // Brow/lip: use instantaneous position directly (0 at neutral, scales up when active).
  // Scale ×2 so a typical raise (~0.5) reads as ~100%.
  const browActivity = Math.min(1, Math.max(features.browPositionL, features.browPositionR) * 2);
  const lipActivity = Math.min(1, features.lipOpenness);
  const genuineSmile = features.genuineSmile;

  // Energy score unchanged — new metrics are debug-only, not weighted in yet
  const energy = Math.min(1,
    blinkActivity * weights.blinkActivity +
    browActivity * weights.browActivity +
    lipActivity * weights.lipActivity +
    genuineSmile * weights.genuineSmile,
  );

  return { energy, blinkActivity, browActivity, lipActivity, genuineSmile, headNodActivity, eyeWideness, lipTension };
}
