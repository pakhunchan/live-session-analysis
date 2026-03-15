import React, { useState, useEffect, useCallback } from 'react';
import { colors, font, card as cardStyle } from './designTokens';
import type { Nudge } from '../types';
import { EventBus } from '../core/EventBus';
import { EventType } from '../types';

interface NudgeChipsProps {
  bus: EventBus;
}

const MAX_NUDGES = 20;

const PRIORITY_STYLES: Record<string, { bg: string; iconBg: string; icon: string }> = {
  high:   { bg: colors.coralSoft, iconBg: colors.coral, icon: '!' },
  medium: { bg: colors.amberSoft, iconBg: colors.amber, icon: '!' },
  low:    { bg: colors.mintSoft,  iconBg: colors.mint,  icon: '\u2713' },
};

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `${min}m ago`;
}

export default function NudgeChips({ bus }: NudgeChipsProps) {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [open, setOpen] = useState(true);
  const [, setTick] = useState(0);
  const [lastNudgeAt, setLastNudgeAt] = useState(0);

  const handleNudge = useCallback((event: { payload: Nudge }) => {
    setLastNudgeAt(Date.now());
    setNudges((prev) => {
      const next = [event.payload, ...prev];
      return next.slice(0, MAX_NUDGES);
    });
  }, []);

  useEffect(() => {
    const unsub = bus.on<Nudge>(EventType.NUDGE, handleNudge);
    return unsub;
  }, [bus, handleNudge]);

  // Clear "recent" highlight after 10s
  const [isRecent, setIsRecent] = useState(false);
  useEffect(() => {
    if (lastNudgeAt === 0) return;
    setIsRecent(true);
    const timer = setTimeout(() => setIsRecent(false), 10_000);
    return () => clearTimeout(timer);
  }, [lastNudgeAt]);

  // Update "time ago" labels every 10s
  useEffect(() => {
    if (nudges.length === 0) return;
    const timer = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(timer);
  }, [nudges.length]);

  return (
    <>
    <style>{`@keyframes nudge-blink{0%,100%{border-color:${colors.coral}}50%{border-color:transparent}}`}</style>
    <div style={{
      ...cardStyle,
      padding: 0,
      ...(isRecent ? {
        border: `2px solid ${colors.coral}`,
        animation: 'nudge-blink 0.5s ease-in-out 3',
      } : {}),
    }}>
      <button style={s.header} onClick={() => setOpen(!open)}>
        <span style={s.title}>Coaching Nudges</span>
        {nudges.length > 0 && <span style={s.badge}>{nudges.length}</span>}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textTertiary}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.25s ease',
          }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <div style={{
        maxHeight: open ? 600 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={s.body}>
          {nudges.length === 0 ? (
            <div style={s.empty}>No nudges yet</div>
          ) : (
            nudges.map((nudge) => {
              const ps = PRIORITY_STYLES[nudge.priority] ?? PRIORITY_STYLES.low;
              return (
                <div key={nudge.id} style={{ ...s.item, background: ps.bg }}>
                  <div style={{ ...s.icon, background: ps.iconBg }}>{ps.icon}</div>
                  <div style={s.text}>{nudge.message}</div>
                  <div style={s.time}>{timeAgo(nudge.timestamp)}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: font,
  },
  title: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    flex: 1,
    textAlign: 'left' as const,
  },
  badge: {
    background: colors.coral,
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 10,
    lineHeight: '1.2',
  },
  body: {
    padding: '0 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 250,
    overflowY: 'auto' as const,
  },
  empty: {
    fontSize: '0.82rem',
    color: colors.textTertiary,
    textAlign: 'center' as const,
    padding: '4px 0',
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 10,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: '0.78rem',
    color: colors.textPrimary,
    lineHeight: 1.4,
  },
  time: {
    fontSize: '0.65rem',
    color: colors.textTertiary,
    whiteSpace: 'nowrap' as const,
    marginTop: 2,
  },
};
