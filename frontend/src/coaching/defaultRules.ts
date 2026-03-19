import type { NudgeRule } from '../types';

/**
 * Five default coaching rules from the PRD:
 * 1. Student silent > 3 minutes
 * 2. Low eye contact sustained
 * 3. Tutor talk-time dominant (> 80%)
 * 4. Energy drop (declining trend + low scores)
 * 5. Interruption spike (≥ 3 interruptions)
 */
export const defaultRules: NudgeRule[] = [
  {
    type: 'student_silent',
    message: 'The student hasn\'t spoken in over 10 minutes — try asking an open-ended question to re-engage.',
    priority: 'high',
    cooldownMs: Infinity, // fire once per session
    condition: (snap) =>
      snap.student.isSpeaking === false &&
      snap.session.currentSilenceDurationMs > 600_000,
  },
  {
    type: 'low_eye_contact',
    message: 'Eye contact is low — the student may be distracted or disengaged.',
    priority: 'medium',
    cooldownMs: 90_000,
    condition: (snap) =>
      snap.student.faceDetected && snap.student.distractionDurationMs > 4000,
  },
  {
    type: 'tutor_talk_dominant',
    message: 'You\'ve been talking most of the time — consider pausing to let the student respond.',
    priority: 'medium',
    cooldownMs: 120_000,
    condition: (snap) =>
      snap.tutor.talkTimePercent !== null && snap.tutor.talkTimePercent > 0.8 && snap.session.sessionElapsedMs > 60_000,
  },
  {
    type: 'energy_drop',
    message: 'Energy levels are dropping — try changing the activity or asking a question.',
    priority: 'low',
    cooldownMs: 180_000,
    condition: (snap) =>
      snap.session.engagementTrend === 'declining' &&
      snap.student.energyScore !== null && snap.student.energyScore < 0.3 &&
      snap.tutor.energyScore !== null && snap.tutor.energyScore < 0.4,
  },
  {
    type: 'interruption_spike',
    message: 'Several interruptions detected — consider establishing turn-taking norms.',
    priority: 'high',
    cooldownMs: 180_000,
    condition: (snap) => {
      const { student, tutor, accident } = snap.session.interruptions;
      return student + tutor + accident >= 3;
    },
  },
];
