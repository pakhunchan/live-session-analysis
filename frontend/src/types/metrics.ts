export interface LatencyTrace {
  t0_capture: number;
  t1_processed: number;
  t2_sent: number;
  t3_serverRecv?: number;
  t4_serverFwd?: number;
  t5_clientRecv?: number;
  t6_ingested?: number;
  clockOffset?: number;  // sender's estimated offset to server
}

export type ParticipantRole = 'tutor' | 'student';

export type InterruptionCategory = 'student_interrupted' | 'tutor_interrupted' | 'accident';

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

export interface DataStatus {
  videoStale: boolean;
  audioStale: boolean;
  lowConfidence: boolean;
}

export interface ParticipantMetrics {
  eyeContactScore: number | null;    // 0-1, null when video unavailable
  talkTimePercent: number | null;    // 0-1, null when audio stale
  energyScore: number | null;        // 0-1, voice energy when talking, expression energy when silent
  expressionEnergy?: number | null;  // 0-1, raw expression energy for display
  isSpeaking: boolean | null;        // null when audio stale
  faceDetected: boolean;
  faceConfidence: number;     // 0-1
  distractionDurationMs: number;  // continuous low eye-contact duration
  energyBreakdown?: EnergyBreakdown | null;
  dataStatus?: DataStatus;
}

export interface InterruptionCounts {
  student: number;
  tutor: number;
  accident: number;
}

export interface SessionMetrics {
  interruptions: InterruptionCounts;
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
  // Set by backend relay — server-receipt timestamp for consistent ordering
  serverTimestamp?: number;
  // Latency trace — sampled at ~1Hz for pipeline diagnostics
  _trace?: LatencyTrace;
}
