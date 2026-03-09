import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NudgeEngine } from './NudgeEngine';
import { EventBus } from '../core/EventBus';
import { EventType } from '../types';
import type { MetricSnapshot, ParticipantMetrics, SessionMetrics, Nudge } from '../types';

function makeParticipant(overrides: Partial<ParticipantMetrics> = {}): ParticipantMetrics {
  return {
    eyeContactScore: 0.5,
    talkTimePercent: 0.4,
    energyScore: 0.5,
    isSpeaking: false,
    faceDetected: true,
    faceConfidence: 0.9,
    distractionDurationMs: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    interruptionCount: 0,
    currentSilenceDurationMs: 0,
    engagementTrend: 'stable',
    sessionElapsedMs: 300_000,
    ...overrides,
  };
}

function makeSnapshot(
  timestamp: number,
  overrides: {
    tutor?: Partial<ParticipantMetrics>;
    student?: Partial<ParticipantMetrics>;
    session?: Partial<SessionMetrics>;
  } = {},
): MetricSnapshot {
  return {
    timestamp,
    sessionId: 'test',
    tutor: makeParticipant(overrides.tutor),
    student: makeParticipant(overrides.student),
    session: makeSession(overrides.session),
  };
}

describe('NudgeEngine', () => {
  let bus: EventBus;
  let engine: NudgeEngine;

  beforeEach(() => {
    bus = new EventBus();
    engine = new NudgeEngine(bus);
    engine.reset();
  });

  it('fires a nudge when rule condition is met', () => {
    const snap = makeSnapshot(100_000, {
      session: { currentSilenceDurationMs: 200_000 },
    });
    const nudges = engine.evaluate(snap);

    expect(nudges.length).toBeGreaterThanOrEqual(1);
    expect(nudges.some((n) => n.type === 'student_silent')).toBe(true);
  });

  it('emits NUDGE events on the EventBus', () => {
    const handler = vi.fn();
    bus.on(EventType.NUDGE, handler);

    engine.evaluate(
      makeSnapshot(100_000, {
        session: { currentSilenceDurationMs: 200_000 },
      }),
    );

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].payload.type).toBe('student_silent');
  });

  it('respects per-rule cooldown', () => {
    const t1 = 100_000;
    const snap1 = makeSnapshot(t1, {
      session: { interruptionCount: 5 },
    });
    const first = engine.evaluate(snap1);
    expect(first.some((n) => n.type === 'interruption_spike')).toBe(true);

    // Within cooldown (180s)
    const t2 = t1 + 60_000;
    const snap2 = makeSnapshot(t2, {
      session: { interruptionCount: 5 },
    });
    const second = engine.evaluate(snap2);
    expect(second.some((n) => n.type === 'interruption_spike')).toBe(false);

    // After cooldown
    const t3 = t1 + 200_000;
    const snap3 = makeSnapshot(t3, {
      session: { interruptionCount: 5 },
    });
    const third = engine.evaluate(snap3);
    expect(third.some((n) => n.type === 'interruption_spike')).toBe(true);
  });

  it('suppresses nudges during tutor speech', () => {
    const snap = makeSnapshot(100_000, {
      tutor: { isSpeaking: true },
      session: { currentSilenceDurationMs: 200_000 },
    });
    const nudges = engine.evaluate(snap);
    expect(nudges).toHaveLength(0);
  });

  it('does not suppress when suppressDuringTutorSpeech is false', () => {
    engine = new NudgeEngine(bus, { suppressDuringTutorSpeech: false });
    engine.reset();

    const snap = makeSnapshot(100_000, {
      tutor: { isSpeaking: true },
      session: { currentSilenceDurationMs: 200_000 },
    });
    const nudges = engine.evaluate(snap);
    expect(nudges.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces maxNudgesPerMinute rate limit', () => {
    engine = new NudgeEngine(bus, { maxNudgesPerMinute: 1 });
    engine.reset();

    // This snapshot triggers multiple rules simultaneously
    const snap = makeSnapshot(100_000, {
      student: { eyeContactScore: 0.1, energyScore: 0.1, faceDetected: true },
      tutor: { talkTimePercent: 0.9, energyScore: 0.2 },
      session: {
        currentSilenceDurationMs: 200_000,
        interruptionCount: 5,
        engagementTrend: 'declining',
        sessionElapsedMs: 300_000,
      },
    });

    const nudges = engine.evaluate(snap);
    expect(nudges).toHaveLength(1); // Only 1 allowed per minute
  });

  it('returns no nudges when disabled', () => {
    engine = new NudgeEngine(bus, { enabled: false });

    const snap = makeSnapshot(100_000, {
      session: { interruptionCount: 10 },
    });
    const nudges = engine.evaluate(snap);
    expect(nudges).toHaveLength(0);
  });

  it('subscribes to EventBus on start() and processes snapshots', () => {
    const handler = vi.fn();
    bus.on(EventType.NUDGE, handler);

    engine.start();
    bus.emit(EventType.METRIC_SNAPSHOT, makeSnapshot(100_000, {
      session: { interruptionCount: 5 },
    }));

    expect(handler).toHaveBeenCalled();
  });

  it('stop() unsubscribes from EventBus', () => {
    const handler = vi.fn();
    bus.on(EventType.NUDGE, handler);

    engine.start();
    engine.stop();

    bus.emit(EventType.METRIC_SNAPSHOT, makeSnapshot(100_000, {
      session: { interruptionCount: 5 },
    }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('getNudgeHistory returns all fired nudges', () => {
    engine.evaluate(
      makeSnapshot(100_000, { session: { interruptionCount: 5 } }),
    );

    const history = engine.getNudgeHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].id).toMatch(/^nudge-/);
  });

  it('reset clears cooldowns and history', () => {
    engine.evaluate(
      makeSnapshot(100_000, { session: { interruptionCount: 5 } }),
    );
    expect(engine.getNudgeHistory().length).toBeGreaterThanOrEqual(1);

    engine.reset();
    expect(engine.getNudgeHistory()).toHaveLength(0);

    // Same timestamp should now fire again (cooldown cleared)
    const nudges = engine.evaluate(
      makeSnapshot(100_000, { session: { interruptionCount: 5 } }),
    );
    expect(nudges.some((n) => n.type === 'interruption_spike')).toBe(true);
  });

  it('nudge contains correct triggerMetrics', () => {
    const snap = makeSnapshot(100_000, {
      session: { interruptionCount: 4 },
    });
    const nudges = engine.evaluate(snap);
    const spike = nudges.find((n) => n.type === 'interruption_spike');

    expect(spike).toBeDefined();
    expect(spike!.triggerMetrics.interruptionCount).toBe(4);
  });
});
