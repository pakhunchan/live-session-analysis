import { describe, it, expect } from 'vitest';
import { defaultRules } from './defaultRules';
import type { MetricSnapshot, ParticipantMetrics, SessionMetrics } from '../types';

function makeParticipant(overrides: Partial<ParticipantMetrics> = {}): ParticipantMetrics {
  return {
    eyeContactScore: 0.5,
    talkTimePercent: 0.4,
    energyScore: 0.5,
    isSpeaking: false,
    faceDetected: true,
    faceConfidence: 0.9,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    interruptionCount: 0,
    currentSilenceDurationMs: 0,
    engagementTrend: 'stable',
    sessionElapsedMs: 300_000, // 5 min
    ...overrides,
  };
}

function makeSnapshot(overrides: {
  tutor?: Partial<ParticipantMetrics>;
  student?: Partial<ParticipantMetrics>;
  session?: Partial<SessionMetrics>;
} = {}): MetricSnapshot {
  return {
    timestamp: Date.now(),
    sessionId: 'test',
    tutor: makeParticipant(overrides.tutor),
    student: makeParticipant(overrides.student),
    session: makeSession(overrides.session),
  };
}

function findRule(type: string) {
  return defaultRules.find((r) => r.type === type)!;
}

describe('defaultRules', () => {
  it('has 5 rules', () => {
    expect(defaultRules).toHaveLength(5);
  });

  // student_silent
  it('student_silent triggers when silence > 3 min', () => {
    const rule = findRule('student_silent');
    const snap = makeSnapshot({ session: { currentSilenceDurationMs: 200_000 } });
    expect(rule.condition(snap)).toBe(true);
  });

  it('student_silent does NOT trigger when silence < 3 min', () => {
    const rule = findRule('student_silent');
    const snap = makeSnapshot({ session: { currentSilenceDurationMs: 120_000 } });
    expect(rule.condition(snap)).toBe(false);
  });

  // low_eye_contact
  it('low_eye_contact triggers when student eye contact < 0.3 and face detected', () => {
    const rule = findRule('low_eye_contact');
    const snap = makeSnapshot({
      student: { eyeContactScore: 0.2, faceDetected: true },
    });
    expect(rule.condition(snap)).toBe(true);
  });

  it('low_eye_contact does NOT trigger when face not detected', () => {
    const rule = findRule('low_eye_contact');
    const snap = makeSnapshot({
      student: { eyeContactScore: 0.1, faceDetected: false },
    });
    expect(rule.condition(snap)).toBe(false);
  });

  // tutor_talk_dominant
  it('tutor_talk_dominant triggers when tutor > 80% and session > 1 min', () => {
    const rule = findRule('tutor_talk_dominant');
    const snap = makeSnapshot({
      tutor: { talkTimePercent: 0.85 },
      session: { sessionElapsedMs: 120_000 },
    });
    expect(rule.condition(snap)).toBe(true);
  });

  it('tutor_talk_dominant does NOT trigger in first minute', () => {
    const rule = findRule('tutor_talk_dominant');
    const snap = makeSnapshot({
      tutor: { talkTimePercent: 0.9 },
      session: { sessionElapsedMs: 30_000 },
    });
    expect(rule.condition(snap)).toBe(false);
  });

  // energy_drop
  it('energy_drop triggers when declining trend and low energy scores', () => {
    const rule = findRule('energy_drop');
    const snap = makeSnapshot({
      student: { energyScore: 0.2 },
      tutor: { energyScore: 0.3 },
      session: { engagementTrend: 'declining' },
    });
    expect(rule.condition(snap)).toBe(true);
  });

  it('energy_drop does NOT trigger when trend is stable', () => {
    const rule = findRule('energy_drop');
    const snap = makeSnapshot({
      student: { energyScore: 0.2 },
      tutor: { energyScore: 0.3 },
      session: { engagementTrend: 'stable' },
    });
    expect(rule.condition(snap)).toBe(false);
  });

  // interruption_spike
  it('interruption_spike triggers when ≥ 3 interruptions', () => {
    const rule = findRule('interruption_spike');
    const snap = makeSnapshot({ session: { interruptionCount: 3 } });
    expect(rule.condition(snap)).toBe(true);
  });

  it('interruption_spike does NOT trigger when < 3 interruptions', () => {
    const rule = findRule('interruption_spike');
    const snap = makeSnapshot({ session: { interruptionCount: 2 } });
    expect(rule.condition(snap)).toBe(false);
  });
});
