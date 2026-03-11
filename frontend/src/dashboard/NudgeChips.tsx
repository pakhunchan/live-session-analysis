import React, { useState, useEffect, useCallback } from 'react';
import type { Nudge } from '../types';
import { EventBus } from '../core/EventBus';
import { EventType } from '../types';

interface NudgeChipsProps {
  bus: EventBus;
}

const MAX_VISIBLE = 3;
const DISMISS_MS = 8_000;

const PRIORITY_COLORS: Record<string, { bg: string; border: string }> = {
  high:   { bg: 'rgba(220, 53, 69, 0.9)',  border: '#dc3545' },
  medium: { bg: 'rgba(255, 193, 7, 0.9)',  border: '#ffc107' },
  low:    { bg: 'rgba(25, 135, 84, 0.9)',   border: '#198754' },
};

export default function NudgeChips({ bus }: NudgeChipsProps) {
  const [nudges, setNudges] = useState<Nudge[]>([]);

  const handleNudge = useCallback((event: { payload: Nudge }) => {
    setNudges((prev) => {
      const next = [event.payload, ...prev];
      return next.slice(0, MAX_VISIBLE);
    });
  }, []);

  useEffect(() => {
    const unsub = bus.on<Nudge>(EventType.NUDGE, handleNudge);
    return unsub;
  }, [bus, handleNudge]);

  // Auto-dismiss each nudge after DISMISS_MS
  useEffect(() => {
    if (nudges.length === 0) return;
    const oldest = nudges[nudges.length - 1];
    const age = Date.now() - oldest.timestamp;
    const remaining = Math.max(0, DISMISS_MS - age);
    const timer = setTimeout(() => {
      setNudges((prev) => prev.slice(0, -1));
    }, remaining);
    return () => clearTimeout(timer);
  }, [nudges]);

  const dismiss = (id: string) => {
    setNudges((prev) => prev.filter((n) => n.id !== id));
  };

  if (nudges.length === 0) return null;

  return (
    <div style={styles.container}>
      {nudges.map((nudge) => {
        const colors = PRIORITY_COLORS[nudge.priority] ?? PRIORITY_COLORS.low;
        return (
          <div
            key={nudge.id}
            style={{
              ...styles.chip,
              background: colors.bg,
              borderLeft: `3px solid ${colors.border}`,
            }}
            role="status"
            aria-live="polite"
          >
            <span style={styles.message}>{nudge.message}</span>
            <button
              onClick={() => dismiss(nudge.id)}
              style={styles.dismissBtn}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 50,
    left: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: 5,
    maxWidth: '340px',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  message: {
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 600,
    flex: 1,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
  },
};
