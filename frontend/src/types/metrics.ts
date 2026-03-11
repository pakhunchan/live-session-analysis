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
  lipTension: number;       // mouthPress + mouthRollLower — silent concentration
  gazeVariationX: number;   // rolling std dev of horizontal gaze — eye wandering
  // Audio sub-scores — all 0-1
  volumeVariance: number;
  spectralBrightness: number;
  speechRate: number;
  voiceEnergy: number;
  // Pitch tracking
  pitch: number;             // fundamental frequency in Hz (0 when unvoiced)
  pitchVariance: number;     // vocal expressiveness 0-1 (CV of pitch history)
}

export interface ParticipantMetrics {
  eyeContactScore: number;    // 0-1
  talkTimePercent: number;    // 0-1
  energyScore: number;        // 0-1
  isSpeaking: boolean;
  faceDetected: boolean;
  faceConfidence: number;     // 0-1
  distractionDurationMs: number;  // continuous low eye-contact duration
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
  lipTension?: number;
  gazeVariationX?: number;
  // Audio sub-scores
  volumeVariance?: number;
  spectralBrightness?: number;
  speechRate?: number;
  // Pitch tracking
  pitch?: number;             // Hz (null → omitted when unvoiced)
  pitchVariance?: number;     // 0-1
}
