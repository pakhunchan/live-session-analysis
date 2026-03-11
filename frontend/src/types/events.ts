export enum EventType {
  VIDEO_METRICS = 'VIDEO_METRICS',
  AUDIO_METRICS = 'AUDIO_METRICS',
  METRIC_SNAPSHOT = 'METRIC_SNAPSHOT',
  NUDGE = 'NUDGE',
  SESSION_START = 'SESSION_START',
  SESSION_END = 'SESSION_END',
  STREAM_READY = 'STREAM_READY',
  STREAM_ERROR = 'STREAM_ERROR',
  DEGRADED_VIDEO = 'DEGRADED_VIDEO',
  FACE_MESH = 'FACE_MESH',
}

export interface FaceMeshPayload {
  participant: 'tutor' | 'student';
  landmarks: Array<{ x: number; y: number; z: number }>;
}

export interface MetricEvent<T = unknown> {
  type: EventType;
  payload: T;
  timestamp: number;
}
