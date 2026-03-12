import React from 'react';
import type { SessionMetrics } from '../types';

interface SessionStatusBarProps {
  session: SessionMetrics | null;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function getTrendIcon(trend: string): string {
  switch (trend) {
    case 'rising': return '↑';
    case 'declining': return '↓';
    default: return '→';
  }
}

function getTrendColor(trend: string): string {
  switch (trend) {
    case 'rising': return '#198754';
    case 'declining': return '#dc3545';
    default: return '#6c757d';
  }
}

export default function SessionStatusBar({ session }: SessionStatusBarProps) {
  const s = session ?? {
    interruptions: { student: 0, tutor: 0, accident: 0 },
    currentSilenceDurationMs: 0,
    engagementTrend: 'stable' as const,
    sessionElapsedMs: 0,
  };

  const { student, tutor, accident } = s.interruptions;

  return (
    <div style={styles.bar}>
      <div style={styles.item}>
        <span style={styles.label}>Elapsed</span>
        <span style={styles.value}>{formatDuration(s.sessionElapsedMs)}</span>
      </div>
      <div style={styles.item}>
        <span style={styles.label}>Student</span>
        <span style={styles.value}>{student}</span>
      </div>
      <div style={styles.item}>
        <span style={styles.label}>Tutor</span>
        <span style={styles.value}>{tutor}</span>
      </div>
      <div style={styles.item}>
        <span style={styles.label}>Other</span>
        <span style={styles.value}>{accident}</span>
      </div>
      <div style={styles.item}>
        <span style={styles.label}>Silence</span>
        <span style={styles.value}>{formatDuration(s.currentSilenceDurationMs)}</span>
      </div>
      <div style={styles.item}>
        <span style={styles.label}>Trend</span>
        <span style={{ ...styles.value, color: getTrendColor(s.engagementTrend) }}>
          {getTrendIcon(s.engagementTrend)} {s.engagementTrend}
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: '1.5rem',
    padding: '0.75rem 1rem',
    background: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    flexWrap: 'wrap',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  label: {
    fontSize: '0.65rem',
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  value: {
    fontSize: '1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
};
