import { describe, it, expect } from 'vitest';
import {
  extractBlendshapeFeatures,
  extractLandmarkFeatures,
  computeHeadMovement,
  computeExpressionEnergy,
} from './expressionAnalysis';
import type { BlendshapeEntry, FaceLandmark } from './FaceDetector';
import type { ExpressionFeatures } from './expressionAnalysis';

function makeBlendshapes(overrides: Record<string, number> = {}): BlendshapeEntry[] {
  const defaults: Record<string, number> = {
    jawOpen: 0,
    browInnerUp: 0,
    browOuterUpLeft: 0,
    browOuterUpRight: 0,
    mouthSmileLeft: 0,
    mouthSmileRight: 0,
  };
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([categoryName, score]) => ({ categoryName, score }));
}

function makeLandmarks(count: number): FaceLandmark[] {
  return Array.from({ length: count }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

describe('extractBlendshapeFeatures', () => {
  it('high jawOpen produces high mouthOpenness', () => {
    const bs = makeBlendshapes({ jawOpen: 0.9 });
    const f = extractBlendshapeFeatures(bs);
    expect(f.mouthOpenness).toBeGreaterThan(0.8);
  });

  it('all-zero blendshapes produce all-zero features', () => {
    const bs = makeBlendshapes();
    const f = extractBlendshapeFeatures(bs);
    expect(f.mouthOpenness).toBe(0);
    expect(f.browRaise).toBe(0);
    expect(f.smileIntensity).toBe(0);
  });
});

describe('extractLandmarkFeatures', () => {
  it('correct mouth distance from mock landmarks', () => {
    const lm = makeLandmarks(468);
    // Set upper lip (13) and lower lip (14) apart
    lm[13] = { x: 0.5, y: 0.45, z: 0 };
    lm[14] = { x: 0.5, y: 0.51, z: 0 }; // 0.06 apart = max
    const f = extractLandmarkFeatures(lm);
    expect(f.mouthOpenness).toBeGreaterThan(0.9);
  });
});

describe('computeHeadMovement', () => {
  it('identical frames produce headMovement 0', () => {
    const lm = makeLandmarks(478);
    expect(computeHeadMovement(lm, lm, 500)).toBe(0);
  });

  it('shifted nose tip produces positive headMovement', () => {
    const prev = makeLandmarks(478);
    prev[1] = { x: 0.5, y: 0.5, z: 0 };
    const curr = makeLandmarks(478);
    curr[1] = { x: 0.6, y: 0.55, z: 0 }; // significant shift
    const movement = computeHeadMovement(curr, prev, 500);
    expect(movement).toBeGreaterThan(0);
  });
});

describe('computeExpressionEnergy', () => {
  it('max features produce energy near 1.0', () => {
    const f: ExpressionFeatures = { mouthOpenness: 1, browRaise: 1, smileIntensity: 1, headMovement: 1 };
    expect(computeExpressionEnergy(f)).toBeGreaterThan(0.9);
  });

  it('zero features produce energy near 0.0', () => {
    const f: ExpressionFeatures = { mouthOpenness: 0, browRaise: 0, smileIntensity: 0, headMovement: 0 };
    expect(computeExpressionEnergy(f)).toBeCloseTo(0, 1);
  });

  it('repeated features (low variance) < varying features', () => {
    const static_f: ExpressionFeatures = { mouthOpenness: 0.5, browRaise: 0.5, smileIntensity: 0.5, headMovement: 0.5 };
    const staticHistory = Array(5).fill(static_f);

    const varyingHistory: ExpressionFeatures[] = [
      { mouthOpenness: 0.1, browRaise: 0.1, smileIntensity: 0.1, headMovement: 0.1 },
      { mouthOpenness: 0.9, browRaise: 0.9, smileIntensity: 0.9, headMovement: 0.9 },
      { mouthOpenness: 0.2, browRaise: 0.2, smileIntensity: 0.2, headMovement: 0.2 },
      { mouthOpenness: 0.8, browRaise: 0.8, smileIntensity: 0.8, headMovement: 0.8 },
      { mouthOpenness: 0.5, browRaise: 0.5, smileIntensity: 0.5, headMovement: 0.5 },
    ];

    const staticEnergy = computeExpressionEnergy(static_f, staticHistory);
    const varyingEnergy = computeExpressionEnergy(static_f, varyingHistory);
    expect(varyingEnergy).toBeGreaterThan(staticEnergy);
  });

  it('custom weights are respected', () => {
    const f: ExpressionFeatures = { mouthOpenness: 1, browRaise: 0, smileIntensity: 0, headMovement: 0 };
    const highMouth = computeExpressionEnergy(f, [], { mouthOpenness: 1.0, browRaise: 0, smileIntensity: 0, headMovement: 0 });
    const lowMouth = computeExpressionEnergy(f, [], { mouthOpenness: 0.1, browRaise: 0, smileIntensity: 0, headMovement: 0 });
    expect(highMouth).toBeGreaterThan(lowMouth);
  });
});
