import { describe, it, expect } from 'vitest';
import type { IFaceDetector, FaceDetectionResult, FaceLandmark } from './FaceDetector';
import { extractHeadPose } from './FaceDetector';

// Mock detector for testing downstream code
export class MockFaceDetector implements IFaceDetector {
  private result: FaceDetectionResult | null;

  constructor(result: FaceDetectionResult | null = null) {
    this.result = result;
  }

  setResult(result: FaceDetectionResult | null): void {
    this.result = result;
  }

  async detect(): Promise<FaceDetectionResult | null> {
    return this.result;
  }

  isReady(): boolean {
    return true;
  }
}

function makeLandmarks(count: number): FaceLandmark[] {
  return Array.from({ length: count }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

describe('extractHeadPose', () => {
  it('returns undefined for missing data', () => {
    expect(extractHeadPose(undefined)).toBeUndefined();
    expect(extractHeadPose([])).toBeUndefined();
  });

  it('extracts identity matrix as zero pose', () => {
    // Column-major identity 4x4
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const pose = extractHeadPose(identity);
    expect(pose).toBeDefined();
    expect(pose!.pitch).toBeCloseTo(0, 5);
    expect(pose!.yaw).toBeCloseTo(0, 5);
    expect(pose!.roll).toBeCloseTo(0, 5);
  });

  it('detects pitch rotation (nodding)', () => {
    // Rotation around X axis by ~0.2 rad (column-major)
    const c = Math.cos(0.2);
    const s = Math.sin(0.2);
    const matrix = [
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1,
    ];
    const pose = extractHeadPose(matrix);
    expect(pose).toBeDefined();
    expect(Math.abs(pose!.pitch)).toBeGreaterThan(0.1);
  });
});

describe('FaceDetector (mock)', () => {
  it('returns null when no face detected', async () => {
    const detector = new MockFaceDetector(null);
    const result = await detector.detect({} as HTMLVideoElement);
    expect(result).toBeNull();
  });

  it('returns correct landmark count', async () => {
    const detector = new MockFaceDetector({
      landmarks: makeLandmarks(478),
      blendshapes: null,
      confidence: 0.9,
    });
    const result = await detector.detect({} as HTMLVideoElement);
    expect(result!.landmarks).toHaveLength(478);
  });

  it('confidence is extracted correctly', async () => {
    const detector = new MockFaceDetector({
      landmarks: makeLandmarks(478),
      blendshapes: null,
      confidence: 0.85,
    });
    const result = await detector.detect({} as HTMLVideoElement);
    expect(result!.confidence).toBe(0.85);
  });
});
