import React from 'react';
import MetricGauge from './MetricGauge';
import type { ParticipantMetrics } from '../types';

interface ParticipantCardProps {
  role: 'Tutor' | 'Student';
  metrics: ParticipantMetrics | null;
  color: string;
}

export default function ParticipantCard({ role, metrics, color }: ParticipantCardProps) {
  const m = metrics ?? {
    eyeContactScore: 0,
    talkTimePercent: 0,
    energyScore: 0,
    isSpeaking: false,
    faceDetected: false,
    faceConfidence: 0,
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ ...styles.dot, background: color }} />
        <span style={styles.role}>{role}</span>
        {m.isSpeaking && <span style={styles.speakingBadge}>Speaking</span>}
        {!m.faceDetected && <span style={styles.noFaceBadge}>No Face</span>}
      </div>

      <div style={styles.gauges}>
        <MetricGauge label="Eye Contact" value={m.eyeContactScore} size={100} />
        <MetricGauge label="Talk Time" value={m.talkTimePercent} size={100} />
        <MetricGauge label="Energy" value={m.energyScore} size={100} />
      </div>

      <div style={styles.details}>
        <span>Face Confidence: {Math.round(m.faceConfidence * 100)}%</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    flex: 1,
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    background: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  role: {
    fontWeight: 700,
    fontSize: '1rem',
  },
  speakingBadge: {
    padding: '2px 8px',
    borderRadius: '12px',
    background: '#d1e7dd',
    color: '#0f5132',
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  noFaceBadge: {
    padding: '2px 8px',
    borderRadius: '12px',
    background: '#f8d7da',
    color: '#842029',
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  gauges: {
    display: 'flex',
    justifyContent: 'space-around',
    marginBottom: '0.5rem',
  },
  details: {
    fontSize: '0.75rem',
    color: '#6c757d',
    textAlign: 'center',
  },
};
