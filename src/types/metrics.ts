export type ParticipantRole = 'tutor' | 'student';

export interface ParticipantMetrics {
  eyeContactScore: number;    // 0-1
  talkTimePercent: number;    // 0-1
  energyScore: number;        // 0-1
  isSpeaking: boolean;
  faceDetected: boolean;
  faceConfidence: number;     // 0-1
}

export interface SessionMetrics {
  interruptionCount: number;
  currentSilenceDurationMs: number;
  engagementTrend: EngagementTrend;
  sessionElapsedMs: number;
}

export type EngagementTrend = 'rising' | 'stable' | 'declining';

export interface MetricSnapshot {
  timestamp: number;
  sessionId: string;
  tutor: ParticipantMetrics;
  student: ParticipantMetrics;
  session: SessionMetrics;
}

export interface MetricDataPoint {
  source: 'video' | 'audio';
  participant: ParticipantRole;
  timestamp: number;
  eyeContact?: number;
  expressionEnergy?: number;
  faceDetected?: boolean;
  faceConfidence?: number;
  isSpeaking?: boolean;
  voiceEnergy?: number;
  amplitude?: number;
}
