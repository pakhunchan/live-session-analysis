import { describe, it, expect } from 'vitest';
import {
  extractBlendshapeFeatures,
  extractLandmarkFeatures,
  computeExpressionEnergy,
} from './expressionAnalysis';
import type { BlendshapeEntry, FaceLandmark } from './FaceDetector';
import type { ExpressionFeatures } from './expressionAnalysis';

function bs(name: string, score: number): BlendshapeEntry {
  return { categoryName: name, score };
}

describe('extractBlendshapeFeatures', () => {
  it('empty blendshapes returns defaults', () => {
    const f = extractBlendshapeFeatures([]);
    expect(f.eyeOpenness).toBe(0.5);
    expect(f.browPosition).toBe(0);
    expect(f.lipOpenness).toBe(0);
    expect(f.genuineSmile).toBe(0);
    expect(f.eyeWideness).toBe(0);
    expect(f.confusionIndex).toBe(0);
    expect(f.lipTension).toBe(0);
    expect(f.frustration).toBe(0);
  });

  it('closed eyes produce low eyeOpenness', () => {
    const f = extractBlendshapeFeatures([
      bs('eyeBlinkLeft', 0.9),
      bs('eyeBlinkRight', 0.9),
    ]);
    expect(f.eyeOpenness).toBeLessThan(0.2);
  });

  it('open eyes produce high eyeOpenness', () => {
    const f = extractBlendshapeFeatures([
      bs('eyeBlinkLeft', 0.0),
      bs('eyeBlinkRight', 0.0),
    ]);
    expect(f.eyeOpenness).toBe(1);
  });

  it('raised brows increase browPosition', () => {
    const f = extractBlendshapeFeatures([
      bs('browInnerUp', 0.6),
      bs('browOuterUpLeft', 0.5),
      bs('browOuterUpRight', 0.5),
    ]);
    expect(f.browPosition).toBeGreaterThan(0.4);
  });

  it('furrowed brows also increase browPosition', () => {
    const f = extractBlendshapeFeatures([
      bs('browDownLeft', 0.7),
      bs('browDownRight', 0.7),
    ]);
    expect(f.browPosition).toBeGreaterThan(0.5);
  });

  it('jawOpen drives lipOpenness', () => {
    const f = extractBlendshapeFeatures([bs('jawOpen', 0.8)]);
    expect(f.lipOpenness).toBe(0.8);
  });

  it('eyeWide drives eyeWideness with scaling for low dynamic range', () => {
    // Realistic webcam value (~0.05) should produce a high score
    const f = extractBlendshapeFeatures([
      bs('eyeWideLeft', 0.05),
      bs('eyeWideRight', 0.05),
    ]);
    expect(f.eyeWideness).toBeCloseTo(0.75, 1); // 0.05 * 15 = 0.75

    // Zero input produces zero
    const fZero = extractBlendshapeFeatures([
      bs('eyeWideLeft', 0.0),
      bs('eyeWideRight', 0.0),
    ]);
    expect(fZero.eyeWideness).toBe(0);

    // Caps at 1.0
    const fHigh = extractBlendshapeFeatures([
      bs('eyeWideLeft', 0.08),
      bs('eyeWideRight', 0.08),
    ]);
    expect(fHigh.eyeWideness).toBe(1); // 0.08 * 15 = 1.2 → clamped to 1
  });

  it('browDown + eyeSquint drives confusionIndex', () => {
    const f = extractBlendshapeFeatures([
      bs('browDownLeft', 0.6),
      bs('browDownRight', 0.6),
      bs('eyeSquintLeft', 0.8),
      bs('eyeSquintRight', 0.8),
    ]);
    expect(f.confusionIndex).toBeGreaterThan(0.3);
  });

  it('mouthPress + mouthRollLower drives lipTension when jaw closed', () => {
    const f = extractBlendshapeFeatures([
      bs('mouthPressLeft', 0.6),
      bs('mouthPressRight', 0.6),
      bs('mouthRollLower', 0.5),
      bs('jawOpen', 0.0), // jaw closed — lipTension should activate
    ]);
    expect(f.lipTension).toBeGreaterThan(0.2);

    // With jaw open, lipTension should be suppressed
    const fOpen = extractBlendshapeFeatures([
      bs('mouthPressLeft', 0.6),
      bs('mouthPressRight', 0.6),
      bs('mouthRollLower', 0.5),
      bs('jawOpen', 1.0), // jaw fully open
    ]);
    expect(fOpen.lipTension).toBe(0);
  });

  it('noseSneer + mouthStretch drives frustration', () => {
    const f = extractBlendshapeFeatures([
      bs('noseSneerLeft', 0.5),
      bs('noseSneerRight', 0.5),
      bs('mouthStretchLeft', 0.6),
      bs('mouthStretchRight', 0.6),
    ]);
    expect(f.frustration).toBeGreaterThan(0.25);
  });

  it('smile driven by mouthSmile, cheekSquint adds bonus', () => {
    // Smile without cheekSquint — still scores well
    const posed = extractBlendshapeFeatures([
      bs('mouthSmileLeft', 0.8),
      bs('mouthSmileRight', 0.8),
      bs('cheekSquintLeft', 0.0),
      bs('cheekSquintRight', 0.0),
    ]);
    expect(posed.genuineSmile).toBeCloseTo(0.8, 1);

    // With cheekSquint — scores slightly higher (bonus)
    const genuine = extractBlendshapeFeatures([
      bs('mouthSmileLeft', 0.8),
      bs('mouthSmileRight', 0.8),
      bs('cheekSquintLeft', 0.7),
      bs('cheekSquintRight', 0.7),
    ]);
    expect(genuine.genuineSmile).toBeGreaterThan(posed.genuineSmile);
  });
});

describe('extractLandmarkFeatures', () => {
  it('short array returns defaults', () => {
    const lm: FaceLandmark[] = Array.from({ length: 100 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const f = extractLandmarkFeatures(lm);
    expect(f.eyeOpenness).toBe(0.5);
    expect(f.eyeWideness).toBe(0);
    expect(f.confusionIndex).toBe(0);
    expect(f.lipTension).toBe(0);
    expect(f.frustration).toBe(0);
  });

  it('produces non-zero values for valid landmarks', () => {
    const lm: FaceLandmark[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    lm[159] = { x: 0.5, y: 0.45, z: 0 }; // eye top
    lm[145] = { x: 0.5, y: 0.48, z: 0 }; // eye bottom
    lm[105] = { x: 0.5, y: 0.42, z: 0 }; // brow
    lm[13] = { x: 0.5, y: 0.6, z: 0 };   // upper lip
    lm[14] = { x: 0.5, y: 0.64, z: 0 };  // lower lip
    lm[61] = { x: 0.4, y: 0.5, z: 0 };   // mouth left
    lm[291] = { x: 0.6, y: 0.5, z: 0 };  // mouth right

    const f = extractLandmarkFeatures(lm);
    expect(f.eyeOpenness).toBeGreaterThan(0);
    expect(f.lipOpenness).toBeGreaterThan(0);
  });
});

describe('computeExpressionEnergy', () => {
  const still: ExpressionFeatures = { eyeOpenness: 0.9, browPosition: 0.1, lipOpenness: 0.0, genuineSmile: 0.0, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };
  const talking: ExpressionFeatures = { eyeOpenness: 0.8, browPosition: 0.3, lipOpenness: 0.6, genuineSmile: 0.0, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };
  const blink: ExpressionFeatures = { eyeOpenness: 0.1, browPosition: 0.1, lipOpenness: 0.0, genuineSmile: 0.0, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };

  it('returns low energy with insufficient history', () => {
    const result = computeExpressionEnergy(still, [still]);
    expect(result.energy).toBeLessThan(0.1);
    expect(result.headNodActivity).toBe(0);
    expect(result.eyeWideness).toBe(0);
    expect(result.confusionIndex).toBe(0);
    expect(result.lipTension).toBe(0);
    expect(result.frustration).toBe(0);
  });

  it('static face (no variance) scores low', () => {
    const history = Array.from({ length: 10 }, () => still);
    const result = computeExpressionEnergy(still, history);
    expect(result.energy).toBeLessThan(0.15);
  });

  it('varying signals score higher than static', () => {
    const varying = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? still : blink));
    const resultVarying = computeExpressionEnergy(still, varying);

    const static_ = Array.from({ length: 10 }, () => still);
    const resultStatic = computeExpressionEnergy(still, static_);

    expect(resultVarying.energy).toBeGreaterThan(resultStatic.energy);
    expect(resultVarying.blinkActivity).toBeGreaterThan(0); // eyeOpenness variance
  });

  it('head nod pitch variance produces headNodActivity', () => {
    const history = Array.from({ length: 10 }, () => still);
    // Simulate nodding: alternating pitch values
    const pitchHistory = Array.from({ length: 10 }, (_, i) => i % 2 === 0 ? 0.1 : -0.1);
    const result = computeExpressionEnergy(still, history, undefined, pitchHistory);
    expect(result.headNodActivity).toBeGreaterThan(0.3);
  });

  it('static pitch produces low headNodActivity', () => {
    const history = Array.from({ length: 10 }, () => still);
    const pitchHistory = Array.from({ length: 10 }, () => 0.05); // constant
    const result = computeExpressionEnergy(still, history, undefined, pitchHistory);
    expect(result.headNodActivity).toBeLessThan(0.1);
  });

  it('instantaneous features pass through to result', () => {
    const confused: ExpressionFeatures = { ...still, confusionIndex: 0.7, eyeWideness: 0.5, lipTension: 0.3, frustration: 0.4 };
    const history = Array.from({ length: 10 }, () => still);
    const result = computeExpressionEnergy(confused, history);
    expect(result.confusionIndex).toBe(0.7);
    expect(result.eyeWideness).toBe(0.5);
    expect(result.lipTension).toBe(0.3);
    expect(result.frustration).toBe(0.4);
  });

  it('genuine smile adds to energy', () => {
    const smiling: ExpressionFeatures = { eyeOpenness: 0.9, browPosition: 0.1, lipOpenness: 0.0, genuineSmile: 0.8, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };
    const history = Array.from({ length: 10 }, () => still);
    const result = computeExpressionEnergy(smiling, history);
    expect(result.energy).toBeGreaterThan(0.15);
    expect(result.genuineSmile).toBe(0.8);
  });

  it('active conversation (lip + brow variance) scores well', () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? still : talking,
    );
    const result = computeExpressionEnergy(talking, history);
    expect(result.energy).toBeGreaterThan(0.3);
    expect(result.lipActivity).toBeGreaterThan(0);
    expect(result.browActivity).toBeGreaterThan(0);
  });

  it('energy capped at 1.0', () => {
    const extreme: ExpressionFeatures = { eyeOpenness: 1.0, browPosition: 1.0, lipOpenness: 1.0, genuineSmile: 1.0, eyeWideness: 1.0, confusionIndex: 1.0, lipTension: 1.0, frustration: 1.0 };
    const zero: ExpressionFeatures = { eyeOpenness: 0.0, browPosition: 0.0, lipOpenness: 0.0, genuineSmile: 0.0, eyeWideness: 0, confusionIndex: 0, lipTension: 0, frustration: 0 };
    const history = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? extreme : zero));
    const result = computeExpressionEnergy(extreme, history);
    expect(result.energy).toBeLessThanOrEqual(1.0);
  });
});
