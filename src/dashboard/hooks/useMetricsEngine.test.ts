import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../core/EventBus';
import { EventType } from '../../types';
import type { MetricSnapshot, ParticipantMetrics, SessionMetrics } from '../../types';

function makeSnapshot(overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  const defaultParticipant: ParticipantMetrics = {
    eyeContactScore: 0.5,
    talkTimePercent: 0.5,
    energyScore: 0.5,
    isSpeaking: false,
    faceDetected: true,
    faceConfidence: 0.9,
    distractionDurationMs: 0,
  };
  const defaultSession: SessionMetrics = {
    interruptionCount: 0,
    currentSilenceDurationMs: 0,
    engagementTrend: 'stable',
    sessionElapsedMs: 5000,
  };
  return {
    timestamp: Date.now(),
    sessionId: 'test',
    tutor: defaultParticipant,
    student: defaultParticipant,
    session: defaultSession,
    ...overrides,
  };
}

describe('useMetricsEngine (EventBus integration)', () => {
  it('EventBus delivers METRIC_SNAPSHOT to subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on(EventType.METRIC_SNAPSHOT, handler);

    const snap = makeSnapshot();
    bus.emit(EventType.METRIC_SNAPSHOT, snap);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].payload.sessionId).toBe('test');
  });

  it('multiple snapshots accumulate for history', () => {
    const bus = new EventBus();
    const snapshots: MetricSnapshot[] = [];
    bus.on<MetricSnapshot>(EventType.METRIC_SNAPSHOT, (e) => snapshots.push(e.payload));

    bus.emit(EventType.METRIC_SNAPSHOT, makeSnapshot());
    bus.emit(EventType.METRIC_SNAPSHOT, makeSnapshot());
    bus.emit(EventType.METRIC_SNAPSHOT, makeSnapshot());

    expect(snapshots).toHaveLength(3);
  });

  it('snapshot contains valid tutor and student metrics', () => {
    const bus = new EventBus();
    let received: MetricSnapshot | null = null;
    bus.on<MetricSnapshot>(EventType.METRIC_SNAPSHOT, (e) => { received = e.payload; });

    bus.emit(EventType.METRIC_SNAPSHOT, makeSnapshot({
      tutor: {
        eyeContactScore: 0.85,
        talkTimePercent: 0.6,
        energyScore: 0.7,
        isSpeaking: true,
        faceDetected: true,
        faceConfidence: 0.95,
        distractionDurationMs: 0,
      },
    }));

    expect(received!.tutor.eyeContactScore).toBe(0.85);
    expect(received!.tutor.isSpeaking).toBe(true);
  });
});
