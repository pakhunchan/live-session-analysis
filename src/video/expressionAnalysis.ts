import type { FaceLandmark, BlendshapeEntry } from './FaceDetector';

/**
 * Per-frame raw signals extracted from blendshapes or landmarks.
 * These capture instantaneous face state; temporal patterns (variance)
 * are computed in computeExpressionEnergy over the history window.
 */
export interface ExpressionFeatures {
  eyeOpenness: number;    // 0-1, how open the eyes are (inverted blink)
  browPosition: number;   // 0-1, combined brow state (raise + furrow)
  lipOpenness: number;    // 0-1, jaw/mouth opening (speech proxy)
  genuineSmile: number;   // 0-1, smile (mouthSmile + cheekSquint bonus)
  // New engagement signals (instantaneous)
  eyeWideness: number;    // 0-1, AU5 — surprise / "aha" moments
  confusionIndex: number; // 0-1, (browDown + eyeSquint) / 2 — AU4+AU7
  lipTension: number;     // 0-1, mouthPress + mouthRollLower — silent concentration
  frustration: number;    // 0-1, noseSneer + mouthStretch — negative affect
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
    return { eyeOpenness: 0.5, browPosition: 0, lipOpenness: 0, genuineSmile: 0, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };
  }

  // Eye openness (inverted from blink — 1.0 = fully open, 0.0 = closed)
  const blinkL = findBlendshape(blendshapes, 'eyeBlinkLeft');
  const blinkR = findBlendshape(blendshapes, 'eyeBlinkRight');
  const eyeOpenness = 1 - (blinkL + blinkR) / 2;

  // Brow position: combine raise (AU1+AU2) and furrow (AU4)
  // Both indicate engagement — raise = acknowledgment, furrow = concentration
  const browInnerUp = findBlendshape(blendshapes, 'browInnerUp');
  const browOuterUpL = findBlendshape(blendshapes, 'browOuterUpLeft');
  const browOuterUpR = findBlendshape(blendshapes, 'browOuterUpRight');
  const browDownL = findBlendshape(blendshapes, 'browDownLeft');
  const browDownR = findBlendshape(blendshapes, 'browDownRight');
  const browRaise = (browInnerUp + browOuterUpL + browOuterUpR) / 3;
  const browFurrow = (browDownL + browDownR) / 2;
  const browPosition = Math.min(1, browRaise + browFurrow);

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
  // Base score from mouth corners; cheekSquint adds up to 20% bonus
  const genuineSmile = Math.min(1, mouthSmile + cheekSquint * 0.2);

  // Eye widening (AU5) — surprise / "aha" moments
  // MediaPipe eyeWide has low dynamic range on webcams (typically 0-0.08).
  // Scale up to fill 0-1. No baseline subtraction — varies too much across faces.
  const eyeWideL = findBlendshape(blendshapes, 'eyeWideLeft');
  const eyeWideR = findBlendshape(blendshapes, 'eyeWideRight');
  const eyeWideness = Math.min(1, (eyeWideL + eyeWideR) / 2 * 15);

  // Confusion index (AU4+AU7) — browDown + eyeSquint
  const eyeSquintL = findBlendshape(blendshapes, 'eyeSquintLeft');
  const eyeSquintR = findBlendshape(blendshapes, 'eyeSquintRight');
  const confusionIndex = Math.min(1, (browFurrow + (eyeSquintL + eyeSquintR) / 2) / 2);

  // Silent concentration — mouthPress + mouthRollLower when jaw closed
  const mouthPressL = findBlendshape(blendshapes, 'mouthPressLeft');
  const mouthPressR = findBlendshape(blendshapes, 'mouthPressRight');
  const mouthRollLower = findBlendshape(blendshapes, 'mouthRollLower');
  const mouthPress = (mouthPressL + mouthPressR) / 2;
  const jawClosed = 1 - jawOpen; // gate: only counts when mouth is closed
  const lipTension = Math.min(1, (mouthPress + mouthRollLower) / 2 * jawClosed);

  // Frustration signal (AU9+AU20) — noseSneer + mouthStretch
  const noseSneerL = findBlendshape(blendshapes, 'noseSneerLeft');
  const noseSneerR = findBlendshape(blendshapes, 'noseSneerRight');
  const mouthStretchL = findBlendshape(blendshapes, 'mouthStretchLeft');
  const mouthStretchR = findBlendshape(blendshapes, 'mouthStretchRight');
  const noseSneer = (noseSneerL + noseSneerR) / 2;
  const mouthStretch = (mouthStretchL + mouthStretchR) / 2;
  const frustration = Math.min(1, (noseSneer + mouthStretch) / 2);

  return { eyeOpenness, browPosition, lipOpenness, genuineSmile, eyeWideness, confusionIndex, lipTension, frustration };
}

/**
 * Fallback: extract expression signals from landmarks when blendshapes unavailable.
 */
export function extractLandmarkFeatures(landmarks: FaceLandmark[]): ExpressionFeatures {
  if (landmarks.length < 468) {
    return { eyeOpenness: 0.5, browPosition: 0, lipOpenness: 0, genuineSmile: 0, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };
  }

  // Eye openness from eye aspect ratio (top 159 - bottom 145)
  const eyeTop = landmarks[159];
  const eyeBottom = landmarks[145];
  const eyeHeight = Math.abs(eyeBottom.y - eyeTop.y);
  const eyeOpenness = Math.min(1, eyeHeight / 0.04);

  // Brow position from brow-eye distance (105 to 159)
  const brow = landmarks[105];
  const browDist = Math.abs(eyeTop.y - brow.y);
  const browPosition = Math.min(1, browDist / 0.04);

  // Lip openness from lip distance (13 upper, 14 lower)
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  const mouthDist = Math.abs(lowerLip.y - upperLip.y);
  const lipOpenness = Math.min(1, mouthDist / 0.06);

  // Smile from mouth width (can't detect genuine vs posed without blendshapes)
  const mouthLeft = landmarks[61];
  const mouthRight = landmarks[291];
  const mouthWidth = Math.abs(mouthRight.x - mouthLeft.x);
  const genuineSmile = Math.min(1, mouthWidth / 0.15);

  // Landmark fallback: new engagement features not available without blendshapes
  return { eyeOpenness, browPosition, lipOpenness, genuineSmile, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };
}

/**
 * Compute variance of a number series.
 */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
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
  confusionIndex: number;
  lipTension: number;
  frustration: number;
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
  const confusionIndex = features.confusionIndex;
  const lipTension = features.lipTension;
  const frustration = features.frustration;

  // Head nod activity: variance of pitch over history window
  const headNodActivity = headPitchHistory.length >= 2
    ? Math.min(1, variance(headPitchHistory) * 300) // pitch in radians, small values → scale up aggressively
    : 0;

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
      confusionIndex,
      lipTension,
      frustration,
    };
  }

  // Compute variance-based activity scores, scaled to 0-1 range
  // Raw variance of [0,1] values is small, so we scale up
  const blinkActivity = Math.min(1, variance(recentHistory.map((f) => f.eyeOpenness)) * 40);
  const browActivity = Math.min(1, variance(recentHistory.map((f) => f.browPosition)) * 40);
  const lipActivity = Math.min(1, variance(recentHistory.map((f) => f.lipOpenness)) * 20);
  const genuineSmile = features.genuineSmile;

  // Energy score unchanged — new metrics are debug-only, not weighted in yet
  const energy = Math.min(1,
    blinkActivity * weights.blinkActivity +
    browActivity * weights.browActivity +
    lipActivity * weights.lipActivity +
    genuineSmile * weights.genuineSmile,
  );

  return { energy, blinkActivity, browActivity, lipActivity, genuineSmile, headNodActivity, eyeWideness, confusionIndex, lipTension, frustration };
}
