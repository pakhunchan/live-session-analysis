import React from 'react';
import { engagementScore } from '../core/engagement';
import Tooltip from './Tooltip';
import type { ParticipantMetrics } from '../types';

interface PersistentMetricsProps {
  student: ParticipantMetrics | null;
}

export default function PersistentMetrics({ student }: PersistentMetricsProps) {
  const engagement = student ? Math.round(engagementScore(student) * 100) : 0;
  const talk = student ? Math.round(student.talkTimePercent * 100) : 0;

  return (
    <div style={styles.bar}>
      <Tooltip text="Engagement — Blend of eye contact and energy signals" position="below" align="right">
        <div style={styles.metric}>
          <span style={styles.label}>Engagement</span>
          <span style={styles.value}>{engagement}%</span>
        </div>
      </Tooltip>
      <div style={styles.divider} />
      <Tooltip text="Student Talk — Percentage of session time the student has spoken" position="below" align="right">
        <div style={styles.metric}>
          <span style={styles.label}>Student Talk</span>
          <span style={styles.value}>{talk}%</span>
        </div>
      </Tooltip>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'absolute',
    top: 12,
    right: 12,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)',
    padding: '6px 14px',
    borderRadius: '8px',
    zIndex: 3,
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  label: {
    fontSize: '0.6rem',
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    lineHeight: 1,
  },
  value: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.3,
  },
  divider: {
    width: 1,
    height: 24,
    background: 'rgba(255, 255, 255, 0.25)',
  },
};
