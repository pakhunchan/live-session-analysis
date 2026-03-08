import { describe, it, expect, vi } from 'vitest';
import { VideoPipeline } from './VideoPipeline';
import { EventBus } from '../core/EventBus';
import { EventType } from '../types';
import type { MetricDataPoint, FrameData } from '../types';
import { MockFaceDetector } from './FaceDetector.test';
import type { FaceLandmark, FaceDetectionResult } from './FaceDetector';

function makeLandmarks(count: number, overrides: Record<number, Partial<FaceLandmark>> = {}): FaceLandmark[] {
  const lm: FaceLandmark[] = Array.from({ length: count }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [idx, vals] of Object.entries(overrides)) {
    lm[Number(idx)] = { ...lm[Number(idx)], ...vals };
  }
  return lm;
}

function makeFrame(participant: 'tutor' | 'student' = 'tutor', timestamp = 1000): FrameData {
  return {
    participant,
    imageData: {} as HTMLVideoElement,
    timestamp,
    width: 640,
    height: 480,
  };
}

function makeGoodResult(): FaceDetectionResult {
  return {
    landmarks: makeLandmarks(478, {
      33: { x: 0.3 }, 133: { x: 0.45 },
      362: { x: 0.55 }, 263: { x: 0.7 },
      159: { y: 0.45 }, 145: { y: 0.55 },
      386: { y: 0.45 }, 374: { y: 0.55 },
      468: { x: 0.375 }, 473: { x: 0.625 }, // centered iris
      1: { x: 0.5, y: 0.45, z: 0 },
      152: { x: 0.5, y: 0.7, z: 0 },
      234: { x: 0.2 }, 454: { x: 0.8 },
    }),
    blendshapes: [
      { categoryName: 'jawOpen', score: 0.3 },
      { categoryName: 'mouthSmileLeft', score: 0.5 },
      { categoryName: 'mouthSmileRight', score: 0.5 },
    ],
    confidence: 0.95,
  };
}

describe('VideoPipeline', () => {
  it('emits VIDEO_METRICS event on good frame', async () => {
    const detector = new MockFaceDetector(makeGoodResult());
    const bus = new EventBus();
    const pipeline = new VideoPipeline(detector, bus);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.VIDEO_METRICS, (e) => events.push(e.payload));

    await pipeline.processFrame(makeFrame());

    expect(events).toHaveLength(1);
    expect(events[0].faceDetected).toBe(true);
    expect(events[0].eyeContact).toBeGreaterThan(0);
    expect(events[0].source).toBe('video');
  });

  it('skips visual metrics when confidence < threshold', async () => {
    const detector = new MockFaceDetector({
      landmarks: makeLandmarks(478),
      blendshapes: null,
      confidence: 0.5, // below 0.7 threshold
    });
    const bus = new EventBus();
    const pipeline = new VideoPipeline(detector, bus);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.VIDEO_METRICS, (e) => events.push(e.payload));

    await pipeline.processFrame(makeFrame());

    expect(events).toHaveLength(1);
    expect(events[0].faceDetected).toBe(false);
    expect(events[0].eyeContact).toBe(0);
  });

  it('processes frame when confidence >= threshold', async () => {
    const detector = new MockFaceDetector(makeGoodResult());
    const bus = new EventBus();
    const pipeline = new VideoPipeline(detector, bus);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.VIDEO_METRICS, (e) => events.push(e.payload));

    await pipeline.processFrame(makeFrame());

    expect(events[0].faceDetected).toBe(true);
    expect(events[0].faceConfidence).toBe(0.95);
  });

  it('tracks degradation rate correctly', async () => {
    const detector = new MockFaceDetector(null); // no face
    const bus = new EventBus();
    const pipeline = new VideoPipeline(detector, bus);

    // 2 degraded frames
    await pipeline.processFrame(makeFrame('tutor', 1000));
    await pipeline.processFrame(makeFrame('tutor', 1500));

    // 1 good frame
    detector.setResult(makeGoodResult());
    await pipeline.processFrame(makeFrame('tutor', 2000));

    expect(pipeline.getTotalFrames()).toBe(3);
    expect(pipeline.getDegradedFrames()).toBe(2);
    expect(pipeline.getDegradationRate()).toBeCloseTo(2 / 3, 2);
  });
});
