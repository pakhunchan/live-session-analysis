import React from 'react';
import { colors, font } from './designTokens';
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

function getTrendLabel(trend: string): { icon: string; text: string; color: string } {
  switch (trend) {
    case 'rising': return { icon: '↑', text: 'Rising', color: colors.green };
    case 'declining': return { icon: '↓', text: 'Declining', color: colors.red };
    default: return { icon: '→', text: 'Stable', color: colors.textSecondary };
  }
}

export default function SessionStatusBar({ session }: SessionStatusBarProps) {
  const s = session ?? {
    interruptions: { student: 0, tutor: 0, accident: 0 },
    currentSilenceDurationMs: 0,
    engagementTrend: 'stable' as const,
    sessionElapsedMs: 0,
  };

  const totalInterruptions = s.interruptions.student + s.interruptions.tutor + s.interruptions.accident;
  const trend = getTrendLabel(s.engagementTrend);

  return (
    <div style={styles.grid}>
      <div style={styles.cell}>
        <div style={styles.value}>{formatDuration(s.sessionElapsedMs)}</div>
        <div style={styles.label}>Elapsed</div>
      </div>
      <div style={styles.cell}>
        <div style={styles.value}>{totalInterruptions}</div>
        <div style={styles.label}>Interruptions</div>
      </div>
      <div style={styles.cell}>
        <div style={styles.value}>{formatDuration(s.currentSilenceDurationMs)}</div>
        <div style={styles.label}>Silence</div>
      </div>
      <div style={styles.cell}>
        <div style={{ ...styles.value, color: trend.color }}>
          {trend.icon} {trend.text}
        </div>
        <div style={styles.label}>Trend</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    fontFamily: font,
  },
  cell: {
    background: colors.surfaceHover,
    borderRadius: 10,
    padding: '8px 12px',
    textAlign: 'center',
  },
  value: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.3,
  },
  label: {
    fontSize: '0.65rem',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: 2,
  },
};
