import { describe, it, expect } from 'vitest';
import { estimateGaze } from './gazeEstimation';
import type { FaceLandmark } from './FaceDetector';

function makeLandmarks(count: number, overrides: Record<number, Partial<FaceLandmark>> = {}): FaceLandmark[] {
  const landmarks: FaceLandmark[] = Array.from({ length: count }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [idx, vals] of Object.entries(overrides)) {
    landmarks[Number(idx)] = { ...landmarks[Number(idx)], ...vals };
  }
  return landmarks;
}

// Helper: set up a realistic eye arrangement
function makeEyeLandmarks(irisHRatio = 0.5, irisVRatio = 0.5): Record<number, Partial<FaceLandmark>> {
  const leftOuterX = 0.3;
  const leftInnerX = 0.45;
  const rightOuterX = 0.55;
  const rightInnerX = 0.7;
  const eyeTopY = 0.45;
  const eyeBottomY = 0.55;

  const leftIrisX = leftOuterX + irisHRatio * (leftInnerX - leftOuterX);
  const rightIrisX = rightOuterX + irisHRatio * (rightInnerX - rightOuterX);
  const irisY = eyeTopY + irisVRatio * (eyeBottomY - eyeTopY);

  return {
    33: { x: leftOuterX, y: 0.5 },    // left eye outer
    133: { x: leftInnerX, y: 0.5 },   // left eye inner
    362: { x: rightOuterX, y: 0.5 },  // right eye outer
    263: { x: rightInnerX, y: 0.5 },  // right eye inner
    159: { x: 0.375, y: eyeTopY },    // left eye top
    145: { x: 0.375, y: eyeBottomY }, // left eye bottom
    386: { x: 0.625, y: eyeTopY },    // right eye top
    374: { x: 0.625, y: eyeBottomY }, // right eye bottom
    468: { x: leftIrisX, y: irisY },  // left iris center
    473: { x: rightIrisX, y: irisY }, // right iris center
    1: { x: 0.5, y: 0.45, z: 0 },    // nose tip
    152: { x: 0.5, y: 0.7, z: 0 },   // chin
    234: { x: 0.2, y: 0.5 },          // left ear
    454: { x: 0.8, y: 0.5 },          // right ear
  };
}

describe('estimateGaze', () => {
  it('centered gaze returns ~0.5 horizontal ratio', () => {
    const lm = makeLandmarks(478, makeEyeLandmarks(0.5, 0.5));
    const gaze = estimateGaze(lm);
    expect(gaze.horizontalRatio).toBeCloseTo(0.5, 1);
  });

  it('left gaze returns low horizontal ratio', () => {
    const lm = makeLandmarks(478, makeEyeLandmarks(0.1, 0.5));
    const gaze = estimateGaze(lm);
    expect(gaze.horizontalRatio).toBeLessThan(0.3);
  });

  it('right gaze returns high horizontal ratio', () => {
    const lm = makeLandmarks(478, makeEyeLandmarks(0.9, 0.5));
    const gaze = estimateGaze(lm);
    expect(gaze.horizontalRatio).toBeGreaterThan(0.7);
  });

  it('downward gaze returns high vertical ratio', () => {
    const lm = makeLandmarks(478, makeEyeLandmarks(0.5, 0.9));
    const gaze = estimateGaze(lm);
    expect(gaze.verticalRatio).toBeGreaterThan(0.7);
  });

  it('head turned right produces positive yaw', () => {
    const overrides = makeEyeLandmarks(0.5, 0.5);
    // Shift nose to the right of ear midpoint
    overrides[1] = { x: 0.6, y: 0.45, z: 0 };
    const lm = makeLandmarks(478, overrides);
    const gaze = estimateGaze(lm);
    expect(gaze.headYawDeg).toBeGreaterThan(0);
  });

  it('short landmark array returns safe defaults', () => {
    const lm = makeLandmarks(100); // too few for iris landmarks
    const gaze = estimateGaze(lm);
    expect(gaze.horizontalRatio).toBe(0.5);
    expect(gaze.verticalRatio).toBe(0.5);
    expect(gaze.headYawDeg).toBe(0);
  });
});
