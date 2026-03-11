import React, { useState, useEffect, useCallback } from 'react';
import type { Nudge } from '../types';
import { EventBus } from '../core/EventBus';
import { EventType } from '../types';

interface AmbientBarProps {
  bus: EventBus;
}

type BarLevel = 'green' | 'yellow' | 'red';

function levelForNudge(nudge: Nudge): BarLevel {
  switch (nudge.priority) {
    case 'high': return 'red';
    case 'medium': return 'yellow';
    default: return 'green';
  }
}

const LEVEL_COLORS: Record<BarLevel, string> = {
  green: '#198754',
  yellow: '#ffc107',
  red: '#dc3545',
};

const DISPLAY_DURATION_MS = 8_000;

export default function AmbientBar({ bus }: AmbientBarProps) {
  const [currentNudge, setCurrentNudge] = useState<Nudge | null>(null);
  const [level, setLevel] = useState<BarLevel>('green');

  const handleNudge = useCallback((event: { payload: Nudge }) => {
    const nudge = event.payload;
    setCurrentNudge(nudge);
    setLevel(levelForNudge(nudge));
  }, []);

  useEffect(() => {
    const unsub = bus.on<Nudge>(EventType.NUDGE, handleNudge);
    return unsub;
  }, [bus, handleNudge]);

  // Auto-dismiss after display duration
  useEffect(() => {
    if (!currentNudge) return;
    const timer = setTimeout(() => {
      setCurrentNudge(null);
      setLevel('green');
    }, DISPLAY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [currentNudge]);

  return (
    <div
      style={{
        ...styles.bar,
        background: LEVEL_COLORS[level],
        opacity: currentNudge ? 1 : 0.4,
      }}
      role="status"
      aria-live="polite"
    >
      {currentNudge ? (
        <span style={styles.message}>{currentNudge.message}</span>
      ) : (
        <span style={styles.message}>Session going well</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    transition: 'background 0.3s, opacity 0.3s',
    marginBottom: '0.75rem',
    textAlign: 'center',
  },
  message: {
    color: '#fff',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
};
