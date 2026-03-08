import { describe, it, expect } from 'vitest';
import { classifyEyeContact } from './eyeContactClassifier';
import type { GazeEstimate } from './gazeEstimation';

describe('classifyEyeContact', () => {
  it('centered gaze returns score near 1.0', () => {
    const gaze: GazeEstimate = {
      horizontalRatio: 0.5,
      verticalRatio: 0.5,
      headYawDeg: 0,
      headPitchDeg: 0,
    };
    const score = classifyEyeContact(gaze);
    expect(score).toBeGreaterThan(0.9);
  });

  it('extreme horizontal deviation returns near 0.0', () => {
    const gaze: GazeEstimate = {
      horizontalRatio: 0.0,  // looking far left
      verticalRatio: 0.5,
      headYawDeg: 0,
      headPitchDeg: 0,
    };
    const score = classifyEyeContact(gaze);
    expect(score).toBeLessThan(0.1);
  });

  it('head beyond yaw threshold returns 0', () => {
    const gaze: GazeEstimate = {
      horizontalRatio: 0.5,
      verticalRatio: 0.5,
      headYawDeg: 35,  // beyond 30 default threshold
      headPitchDeg: 0,
    };
    expect(classifyEyeContact(gaze)).toBe(0);
  });

  it('moderate deviation returns intermediate score', () => {
    const gaze: GazeEstimate = {
      horizontalRatio: 0.35,  // slightly off center
      verticalRatio: 0.5,
      headYawDeg: 10,
      headPitchDeg: 5,
    };
    const score = classifyEyeContact(gaze);
    expect(score).toBeGreaterThan(0.1);
    expect(score).toBeLessThan(0.9);
  });

  it('custom config changes thresholds', () => {
    const gaze: GazeEstimate = {
      horizontalRatio: 0.3,
      verticalRatio: 0.5,
      headYawDeg: 0,
      headPitchDeg: 0,
    };
    // With a tight threshold, this should score low
    const tight = classifyEyeContact(gaze, {
      horizontalThreshold: 0.15,
      verticalThreshold: 0.15,
      maxHeadYawDeg: 30,
      maxHeadPitchDeg: 25,
    });
    // With a loose threshold, same gaze scores higher
    const loose = classifyEyeContact(gaze, {
      horizontalThreshold: 0.5,
      verticalThreshold: 0.5,
      maxHeadYawDeg: 30,
      maxHeadPitchDeg: 25,
    });
    expect(loose).toBeGreaterThan(tight);
  });
});
