import type { MetricSnapshot, ParticipantMetrics, ParticipantRole } from './metrics';
import type { Nudge } from './coaching';

export type InputSourceType = 'file' | 'webcam';

export interface ParticipantInputConfig {
  source: InputSourceType;
  file?: File;                    // required when source === 'file'
  playAudio?: boolean;            // for file: unmute speaker output so student can hear
}

export interface SessionSetupConfig {
  tutor: ParticipantInputConfig;
  student: ParticipantInputConfig;
}

export interface LiveKitSetupConfig {
  role: ParticipantRole;
  inputSource: InputSourceType;
  file?: File;
  roomName: string;
  displayName?: string;
}

export interface SessionConfig {
  sessionId: string;
  subject?: string;
  studentLevel?: string;
  startTime: number;
}

export interface KeyMoment {
  timestamp: number;
  type: 'attention_drop' | 'engagement_spike' | 'long_silence' | 'interruption_burst' | 'energy_shift';
  description: string;
  metrics: Partial<MetricSnapshot>;
}

export interface SessionSummary {
  sessionId: string;
  durationMs: number;
  avgMetrics: {
    tutor: Partial<ParticipantMetrics>;
    student: Partial<ParticipantMetrics>;
  };
  totalInterruptions: number;
  talkTimeRatio: { tutor: number; student: number };
  engagementScore: number;  // 0-100
  keyMoments: KeyMoment[];
  nudgesTriggered: Nudge[];
  recommendations: string[];
}
