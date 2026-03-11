/** The payload sent from the frontend to POST /api/recommendations */
export interface SummaryInput {
  sessionId: string;
  durationMs: number;
  avgMetrics: {
    tutor: { eyeContactScore?: number; energyScore?: number };
    student: { eyeContactScore?: number; energyScore?: number };
  };
  totalInterruptions: number;
  talkTimeRatio: { tutor: number; student: number };
  engagementScore: number;
  keyMoments: Array<{
    timestamp: number;
    type: string;
    description: string;
    metrics: Record<string, unknown>;
  }>;
  nudgesTriggered: Array<{ type: string; [key: string]: unknown }>;
}
