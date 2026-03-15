import { describe, it, expect } from 'vitest';
import { computeSnapshot, computeTrend } from './MetricsEngine';
import type { MetricDataPoint, MetricSnapshot } from '../types';

function makeAccumulator(
  video: Partial<MetricDataPoint> | null,
  audio: Partial<MetricDataPoint> | null,
  speakingMs = 0,
) {
  return {
    latestVideo: video
      ? { source: 'video' as const, participant: 'tutor' as const, timestamp: 1000, ...video }
      : null,
    latestAudio: audio
      ? { source: 'audio' as const, participant: 'tutor' as const, timestamp: 1000, ...audio }
      : null,
    lastVideoReceivedAt: video ? Date.now() : null,
    lastAudioReceivedAt: audio ? Date.now() : null,
    speakingMs,
    lastAudioTimestamp: audio ? 1000 : null,
  };
}

function makeSnapshot(overrides: Partial<{
  tutorEye: number;
  tutorEnergy: number;
  studentEye: number;
  studentEnergy: number;
}>): MetricSnapshot {
  return {
    timestamp: Date.now(),
    sessionId: 'test',
    tutor: {
      eyeContactScore: overrides.tutorEye ?? 0.5,
      talkTimePercent: 0.5,
      energyScore: overrides.tutorEnergy ?? 0.5,
      isSpeaking: false,
      faceDetected: true,
      faceConfidence: 0.9,
      distractionDurationMs: 0,
    },
    student: {
      eyeContactScore: overrides.studentEye ?? 0.5,
      talkTimePercent: 0.5,
      energyScore: overrides.studentEnergy ?? 0.5,
      isSpeaking: false,
      faceDetected: true,
      faceConfidence: 0.9,
      distractionDurationMs: 0,
    },
    session: {
      interruptions: { student: 0, tutor: 0, accident: 0 },
      currentSilenceDurationMs: 0,
      engagementTrend: 'stable',
      sessionElapsedMs: 10000,
    },
  };
}

describe('computeSnapshot', () => {
  it('produces valid MetricSnapshot from known data points', () => {
    const tutor = makeAccumulator(
      { faceDetected: true, faceConfidence: 0.95, eyeContact: 0.8, expressionEnergy: 0.6 },
      { isSpeaking: true, voiceEnergy: 0.7 },
      5000,
    );
    const student = makeAccumulator(
      { faceDetected: true, faceConfidence: 0.88, eyeContact: 0.6, expressionEnergy: 0.4 },
      { isSpeaking: false, voiceEnergy: 0.3 },
      3000,
    );

    const snap = computeSnapshot('sess1', 1000, tutor, student, { student: 1, tutor: 1, accident: 0 }, 0, 10000, [], 10);

    expect(snap.sessionId).toBe('sess1');
    expect(snap.timestamp).toBe(1000);
    expect(snap.tutor.eyeContactScore).toBe(0.8);
    expect(snap.tutor.faceDetected).toBe(true);
    expect(snap.tutor.isSpeaking).toBe(true);
    expect(snap.tutor.talkTimePercent).toBe(0.5); // 5000/10000
    expect(snap.student.eyeContactScore).toBe(0.6);
    expect(snap.session.interruptions).toEqual({ student: 1, tutor: 1, accident: 0 });
  });

  it('handles null video (face not detected)', () => {
    const tutor = makeAccumulator(null, { isSpeaking: false, voiceEnergy: 0.1 });
    const student = makeAccumulator(null, { isSpeaking: false, voiceEnergy: 0.05 });

    const snap = computeSnapshot('sess1', 1000, tutor, student, { student: 0, tutor: 0, accident: 0 }, 0, 5000, [], 10);

    expect(snap.tutor.faceDetected).toBe(false);
    expect(snap.tutor.eyeContactScore).toBe(0);
    expect(snap.tutor.faceConfidence).toBe(0);
    expect(snap.student.faceDetected).toBe(false);
    expect(snap.student.eyeContactScore).toBe(0);
  });

  it('handles null audio', () => {
    const tutor = makeAccumulator(
      { faceDetected: true, faceConfidence: 0.9, eyeContact: 0.7 },
      null,
    );
    const student = makeAccumulator(null, null);

    const snap = computeSnapshot('sess1', 1000, tutor, student, { student: 0, tutor: 0, accident: 0 }, 0, 5000, [], 10);

    expect(snap.tutor.isSpeaking).toBe(false);
    expect(snap.student.isSpeaking).toBe(false);
  });
});

describe('computeTrend', () => {
  it('returns rising with increasing engagement', () => {
    const snapshots = Array.from({ length: 10 }, (_, i) => {
      const v = 0.2 + i * 0.07; // rising from 0.2 to 0.83
      return makeSnapshot({ tutorEye: v, tutorEnergy: v, studentEye: v, studentEnergy: v });
    });
    expect(computeTrend(snapshots, 10)).toBe('rising');
  });

  it('returns declining with decreasing engagement', () => {
    const snapshots = Array.from({ length: 10 }, (_, i) => {
      const v = 0.9 - i * 0.07;
      return makeSnapshot({ tutorEye: v, tutorEnergy: v, studentEye: v, studentEnergy: v });
    });
    expect(computeTrend(snapshots, 10)).toBe('declining');
  });

  it('returns stable with flat engagement', () => {
    const snapshots = Array.from({ length: 10 }, () =>
      makeSnapshot({ tutorEye: 0.5, tutorEnergy: 0.5, studentEye: 0.5, studentEnergy: 0.5 }),
    );
    expect(computeTrend(snapshots, 10)).toBe('stable');
  });

  it('handles empty history', () => {
    expect(computeTrend([], 10)).toBe('stable');
  });
});

describe('MetricsEngine integration', () => {
  it('talk time % equals speaking accumulator / session elapsed', () => {
    const tutor = makeAccumulator(null, { isSpeaking: true }, 7000);
    const student = makeAccumulator(null, { isSpeaking: false }, 3000);

    const snap = computeSnapshot('sess1', 1000, tutor, student, { student: 0, tutor: 0, accident: 0 }, 0, 10000, [], 10);

    expect(snap.tutor.talkTimePercent).toBe(0.7);
    expect(snap.student.talkTimePercent).toBe(0.3);
  });

  it('interruption count passes through correctly', () => {
    const tutor = makeAccumulator(null, null);
    const student = makeAccumulator(null, null);

    const snap = computeSnapshot('sess1', 1000, tutor, student, { student: 3, tutor: 1, accident: 1 }, 0, 10000, [], 10);

    expect(snap.session.interruptions).toEqual({ student: 3, tutor: 1, accident: 1 });
  });
});
