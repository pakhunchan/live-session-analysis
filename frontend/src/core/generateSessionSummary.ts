import { engagementScore } from './engagement';
import type { MetricSnapshot, ParticipantMetrics } from '../types/metrics';
import type { Nudge } from '../types/coaching';
import type { SessionSummary, KeyMoment } from '../types/session';

/**
 * Compute post-session summary from the full metric history.
 * Returns everything except `recommendations` (filled by OpenAI or fallback).
 */
export function generateSessionSummary(
  history: MetricSnapshot[],
  nudges: Nudge[],
): Omit<SessionSummary, 'recommendations'> {
  if (history.length === 0) {
    return emptySummary(nudges);
  }

  const first = history[0];
  const last = history[history.length - 1];
  const durationMs = last.timestamp - first.timestamp;

  // Average participant metrics
  const avgTutor = averageParticipantMetrics(history.map(s => s.tutor));
  const avgStudent = averageParticipantMetrics(history.map(s => s.student));

  // Interruptions: cumulative counter, take the max total
  const totalInterruptions = Math.max(...history.map(s => {
    const { student, tutor, accident } = s.session.interruptions;
    return student + tutor + accident;
  }));

  // Talk time ratio: mean across snapshots (filter nulls)
  const tutorTalk = mean(history.map(s => s.tutor.talkTimePercent).filter((v): v is number => v !== null));
  const studentTalk = mean(history.map(s => s.student.talkTimePercent).filter((v): v is number => v !== null));

  // Engagement score: mean of student engagement, scaled 0-100
  const engScores = history.map(s => engagementScore(s.student)).filter((v): v is number => v !== null);
  const avgEngagement = Math.round(mean(engScores) * 100);

  // Detect key moments
  const keyMoments = detectKeyMoments(history);

  return {
    sessionId: first.sessionId,
    durationMs,
    avgMetrics: { tutor: avgTutor, student: avgStudent },
    totalInterruptions,
    talkTimeRatio: { tutor: tutorTalk, student: studentTalk },
    engagementScore: avgEngagement,
    keyMoments,
    nudgesTriggered: nudges,
  };
}

function emptySummary(nudges: Nudge[]): Omit<SessionSummary, 'recommendations'> {
  return {
    sessionId: '',
    durationMs: 0,
    avgMetrics: { tutor: {}, student: {} },
    totalInterruptions: 0,
    talkTimeRatio: { tutor: 0.5, student: 0.5 },
    engagementScore: 0,
    keyMoments: [],
    nudgesTriggered: nudges,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function averageParticipantMetrics(snapshots: ParticipantMetrics[]): Partial<ParticipantMetrics> {
  if (snapshots.length === 0) return {};
  return {
    eyeContactScore: mean(snapshots.map(s => s.eyeContactScore).filter((v): v is number => v !== null)),
    talkTimePercent: mean(snapshots.map(s => s.talkTimePercent).filter((v): v is number => v !== null)),
    energyScore: mean(snapshots.map(s => s.energyScore).filter((v): v is number => v !== null)),
  };
}

// --- Key moment detection ---

function detectKeyMoments(history: MetricSnapshot[]): KeyMoment[] {
  const moments: KeyMoment[] = [];

  // 1. Attention drop: student eyeContact < 0.3 for 10+ consecutive snapshots (5s at 2Hz)
  let lowEyeRun = 0;
  for (let i = 0; i < history.length; i++) {
    const eyeScore = history[i].student.eyeContactScore;
    if (eyeScore !== null && eyeScore < 0.3) {
      lowEyeRun++;
      if (lowEyeRun === 10) {
        moments.push({
          timestamp: history[i - 9].timestamp,
          type: 'attention_drop',
          description: 'Student attention dropped significantly',
          metrics: { student: history[i].student },
        });
      }
    } else {
      lowEyeRun = 0;
    }
  }

  // 2. Engagement spike: student engagement jumps >0.3 within 10 snapshots
  for (let i = 10; i < history.length; i++) {
    const prev = engagementScore(history[i - 10].student);
    const curr = engagementScore(history[i].student);
    if (curr !== null && prev !== null && curr - prev > 0.3) {
      moments.push({
        timestamp: history[i].timestamp,
        type: 'engagement_spike',
        description: 'Student engagement spiked',
        metrics: { student: history[i].student },
      });
    }
  }

  // 3. Long silence: currentSilenceDurationMs > 60s
  let silenceReported = false;
  for (let i = 0; i < history.length; i++) {
    const silence = history[i].session.currentSilenceDurationMs;
    if (silence >= 60_000 && !silenceReported) {
      moments.push({
        timestamp: history[i].timestamp,
        type: 'long_silence',
        description: 'Extended silence (>1 minute)',
        metrics: { session: history[i].session },
      });
      silenceReported = true;
    } else if (silence < 60_000) {
      silenceReported = false;
    }
  }

  // 4. Interruption burst: interruptionCount jumps by 3+ within a 30s window (60 snapshots at 2Hz)
  const windowSize = 60;
  for (let i = windowSize; i < history.length; i++) {
    const iNow = history[i].session.interruptions;
    const countNow = iNow.student + iNow.tutor + iNow.accident;
    const iBefore = history[i - windowSize].session.interruptions;
    const countBefore = iBefore.student + iBefore.tutor + iBefore.accident;
    if (countNow - countBefore >= 3) {
      moments.push({
        timestamp: history[i].timestamp,
        type: 'interruption_burst',
        description: 'Burst of interruptions detected',
        metrics: { session: history[i].session },
      });
    }
  }

  // 5. Energy shift: student energyScore drops >0.3 sustained for 20 snapshots (10s)
  for (let i = 20; i < history.length; i++) {
    const baseline = history[i - 20].student.energyScore;
    if (baseline === null) continue;
    const allLow = history.slice(i - 19, i + 1)
      .every(s => s.student.energyScore !== null && baseline - s.student.energyScore > 0.3);
    if (allLow) {
      moments.push({
        timestamp: history[i - 19].timestamp,
        type: 'energy_shift',
        description: 'Student energy dropped significantly',
        metrics: { student: history[i].student },
      });
    }
  }

  // Deduplicate within 30s windows (keep earliest per type)
  return deduplicateMoments(moments);
}

function deduplicateMoments(moments: KeyMoment[]): KeyMoment[] {
  const sorted = [...moments].sort((a, b) => a.timestamp - b.timestamp);
  const result: KeyMoment[] = [];

  for (const m of sorted) {
    const isDuplicate = result.some(
      existing => existing.type === m.type && Math.abs(existing.timestamp - m.timestamp) < 30_000,
    );
    if (!isDuplicate) {
      result.push(m);
    }
  }

  return result;
}
