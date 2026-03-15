import React, { useState } from 'react';
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

function HoverCell({ value, label, tooltip }: { value: React.ReactNode; label: string; tooltip: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={styles.cell}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.value}>{value}</div>
      <div style={styles.label}>{label}</div>
      {hovered && (
        <div style={styles.tooltip}>{tooltip}</div>
      )}
    </div>
  );
}

export default function SessionStatusBar({ session }: SessionStatusBarProps) {
  const s = session ?? {
    interruptions: { student: 0, tutor: 0, accident: 0 },
    currentSilenceDurationMs: 0,
    engagementTrend: 'stable' as const,
    sessionElapsedMs: 0,
  };

  return (
    <div style={styles.grid}>
      <div style={styles.cell}>
        <div style={styles.value}>{formatDuration(s.sessionElapsedMs)}</div>
        <div style={styles.label}>Elapsed</div>
      </div>
      <div style={styles.cell}>
        <div style={styles.value}>{formatDuration(s.currentSilenceDurationMs)}</div>
        <div style={styles.label}>Silence</div>
      </div>
      <HoverCell
        value={s.interruptions.tutor}
        label="Student Int."
        tooltip="Number of times the student interrupted the tutor"
      />
      <HoverCell
        value={s.interruptions.student}
        label="Tutor Int."
        tooltip="Number of times the tutor interrupted the student"
      />
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
    position: 'relative',
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
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: 6,
    padding: '6px 10px',
    background: colors.textPrimary,
    color: '#fff',
    fontSize: '0.68rem',
    fontWeight: 500,
    borderRadius: 6,
    whiteSpace: 'normal',
    width: 180,
    textAlign: 'center',
    lineHeight: 1.4,
    zIndex: 10,
    pointerEvents: 'none',
  },
};
