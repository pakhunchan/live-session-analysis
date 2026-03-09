export type ParticipantRole = 'tutor' | 'student';

export interface EnergyBreakdown {
  // Video activity scores (variance-based over history window) — all 0-1
  blinkActivity: number;   // eye openness variability
  browActivity: number;    // brow movement variability
  lipActivity: number;     // lip/jaw movement variability
  genuineSmile: number;    // Duchenne smile (instantaneous)
  expressionEnergy: number;
  // New video engagement metrics (debug/experimentation — not in energy score yet)
  headNodActivity: number;  // pitch variance — active listening signal
  eyeWideness: number;      // AU5 — surprise / "aha" moments
  confusionIndex: number;   // (browDown + eyeSquint) / 2 — AU4+AU7
  lipTension: number;       // mouthPress + mouthRollLower — silent concentration
  frustration: number;      // noseSneer + mouthStretch — negative affect
  // Audio sub-scores — all 0-1
  volume: number;
  volumeVariance: number;
  spectralBrightness: number;
  speechRate: number;
  voiceEnergy: number;
}

export interface ParticipantMetrics {
  eyeContactScore: number;    // 0-1
  talkTimePercent: number;    // 0-1
  energyScore: number;        // 0-1
  isSpeaking: boolean;
  faceDetected: boolean;
  faceConfidence: number;     // 0-1
  energyBreakdown?: EnergyBreakdown;
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
  // Expression activity scores (variance-based, computed over window)
  blinkActivity?: number;
  browActivity?: number;
  lipActivity?: number;
  genuineSmile?: number;
  // New video engagement metrics (debug/experimentation)
  headNodActivity?: number;
  eyeWideness?: number;
  confusionIndex?: number;
  lipTension?: number;
  frustration?: number;
  // Audio sub-scores
  volume?: number;
  volumeVariance?: number;
  spectralBrightness?: number;
  speechRate?: number;
}
