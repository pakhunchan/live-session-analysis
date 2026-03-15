import React from 'react';
import { colors, radius, glassmorphism, font } from './designTokens';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

interface BottomControlsProps {
  onEndSession: () => void;
  elapsed: number;
  totalLatency: number | null;
  role: 'tutor' | 'student';
}

export default function BottomControls({
  onEndSession,
  elapsed,
  totalLatency,
  role,
}: BottomControlsProps) {
  return (
    <div style={styles.bar}>
      {/* Left group: timer + latency (tutor only) */}
      {role === 'tutor' && (
        <div style={styles.leftGroup}>
          <div style={styles.timerRow}>
            <span style={styles.liveDot} />
            <span style={styles.timerText}>{formatDuration(elapsed)}</span>
          </div>
          <span style={styles.latencyText}>
            Total latency: {totalLatency !== null ? `${Math.round(totalLatency)}ms` : '—'}
          </span>
        </div>
      )}

      {/* End Session — pinned right */}
      <button
        onClick={onEndSession}
        style={{ ...styles.btn, ...styles.btnEnd }}
        title="End Session"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2.5" />
        </svg>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'relative' as const,
    height: 64,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 20px',
    ...glassmorphism(0.72),
    borderTop: `1px solid ${colors.borderLight}`,
    fontFamily: font,
  },
  leftGroup: {
    position: 'absolute' as const,
    left: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  timerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: colors.green,
    animation: 'pulse-live 2s ease-in-out infinite',
  },
  timerText: {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  latencyText: {
    fontSize: '0.72rem',
    color: colors.textTertiary,
    fontVariantNumeric: 'tabular-nums',
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    background: colors.surface,
    color: colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  btnEnd: {
    position: 'absolute' as const,
    right: 20,
    background: colors.coral,
    borderColor: colors.coral,
    color: '#fff',
    width: 'auto',
    padding: '0 20px',
    gap: 6,
    fontWeight: 600,
    fontSize: '0.82rem',
  },
};
