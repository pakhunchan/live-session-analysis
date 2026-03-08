import type { FaceLandmark, BlendshapeEntry } from './FaceDetector';

export interface ExpressionFeatures {
  mouthOpenness: number;   // 0-1
  browRaise: number;       // 0-1
  smileIntensity: number;  // 0-1
  headMovement: number;    // 0-1
}

export interface ExpressionWeights {
  mouthOpenness: number;
  browRaise: number;
  smileIntensity: number;
  headMovement: number;
}

const DEFAULT_WEIGHTS: ExpressionWeights = {
  mouthOpenness: 0.25,
  browRaise: 0.15,
  smileIntensity: 0.20,
  headMovement: 0.40,
};

const NOSE_TIP = 1;

function findBlendshape(blendshapes: BlendshapeEntry[], name: string): number {
  const entry = blendshapes.find((b) => b.categoryName === name);
  return entry?.score ?? 0;
}

/**
 * Extract expression features from MediaPipe blendshapes.
 */
export function extractBlendshapeFeatures(blendshapes: BlendshapeEntry[]): ExpressionFeatures {
  if (!blendshapes || blendshapes.length === 0) {
    return { mouthOpenness: 0, browRaise: 0, smileIntensity: 0, headMovement: 0 };
  }

  const jawOpen = findBlendshape(blendshapes, 'jawOpen');
  const mouthOpenness = Math.min(1, jawOpen);

  const browInnerUp = findBlendshape(blendshapes, 'browInnerUp');
  const browOuterUpL = findBlendshape(blendshapes, 'browOuterUpLeft');
  const browOuterUpR = findBlendshape(blendshapes, 'browOuterUpRight');
  const browRaise = Math.min(1, (browInnerUp + browOuterUpL + browOuterUpR) / 3);

  const smileL = findBlendshape(blendshapes, 'mouthSmileLeft');
  const smileR = findBlendshape(blendshapes, 'mouthSmileRight');
  const smileIntensity = Math.min(1, (smileL + smileR) / 2);

  return { mouthOpenness, browRaise, smileIntensity, headMovement: 0 };
}

/**
 * Fallback: extract expression features from landmarks when blendshapes unavailable.
 */
export function extractLandmarkFeatures(landmarks: FaceLandmark[]): ExpressionFeatures {
  if (landmarks.length < 468) {
    return { mouthOpenness: 0, browRaise: 0, smileIntensity: 0, headMovement: 0 };
  }

  // Mouth openness: distance between upper lip (13) and lower lip (14)
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  const mouthDist = Math.abs(lowerLip.y - upperLip.y);
  const mouthOpenness = Math.min(1, mouthDist / 0.06); // normalize

  // Brow raise: distance between brow (105) and eye top (159)
  const brow = landmarks[105];
  const eyeTop = landmarks[159];
  const browDist = Math.abs(eyeTop.y - brow.y);
  const browRaise = Math.min(1, browDist / 0.04);

  // Smile: distance between mouth corners (61, 291)
  const mouthLeft = landmarks[61];
  const mouthRight = landmarks[291];
  const mouthWidth = Math.abs(mouthRight.x - mouthLeft.x);
  const smileIntensity = Math.min(1, mouthWidth / 0.15);

  return { mouthOpenness, browRaise, smileIntensity, headMovement: 0 };
}

/**
 * Compute head movement magnitude from nose tip displacement between frames.
 */
export function computeHeadMovement(
  current: FaceLandmark[],
  previous: FaceLandmark[] | null,
  deltaTimeMs: number,
): number {
  if (!previous || current.length <= NOSE_TIP || previous.length <= NOSE_TIP) {
    return 0;
  }
  if (deltaTimeMs <= 0) return 0;

  const curNose = current[NOSE_TIP];
  const prevNose = previous[NOSE_TIP];

  const dx = curNose.x - prevNose.x;
  const dy = curNose.y - prevNose.y;
  const displacement = Math.sqrt(dx * dx + dy * dy);

  // Normalize: displacement per second, capped at 1
  const displacementPerSec = displacement / (deltaTimeMs / 1000);
  return Math.min(1, displacementPerSec / 0.5); // 0.5 units/sec = max
}

/**
 * Compute expression energy score from features + temporal variance.
 * Higher variance in recent history → higher energy (dynamic > static).
 */
export function computeExpressionEnergy(
  features: ExpressionFeatures,
  recentHistory: ExpressionFeatures[] = [],
  weights: ExpressionWeights = DEFAULT_WEIGHTS,
): number {
  // Base weighted average
  const base =
    features.mouthOpenness * weights.mouthOpenness +
    features.browRaise * weights.browRaise +
    features.smileIntensity * weights.smileIntensity +
    features.headMovement * weights.headMovement;

  // Temporal variance boost
  if (recentHistory.length < 2) return Math.min(1, base);

  const keys: (keyof ExpressionFeatures)[] = ['mouthOpenness', 'browRaise', 'smileIntensity', 'headMovement'];
  let totalVariance = 0;

  for (const key of keys) {
    const values = recentHistory.map((f) => f[key]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    totalVariance += variance;
  }

  // Average variance across features, scaled up as a boost
  const varianceBoost = Math.min(0.3, (totalVariance / keys.length) * 5);

  return Math.min(1, base + varianceBoost);
}
