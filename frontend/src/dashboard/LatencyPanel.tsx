import React, { useState } from 'react';
import { colors, font, card as cardStyle } from './designTokens';
import type { LatencyBreakdown } from '../core/LatencyTracker';

interface LatencyPanelProps {
  breakdown: LatencyBreakdown | null;
}

function ms(v: number): string {
  return `${Math.round(v)}ms`;
}

const LEG_COLORS = [colors.mint, colors.blue, colors.lavender, colors.amber, colors.coral];
const LEG_LABELS = ['Client Processing', '→ Server', 'Server Processing', '→ Tutor', 'Ingestion'];

function LegRow({ label, value, maxMs, color }: { label: string; value: number; maxMs: number; color: string }) {
  const pct = maxMs > 0 ? Math.min(100, (value / maxMs) * 100) : 0;
  return (
    <div style={s.legRow}>
      <span style={s.legLabel}>{label}</span>
      <div style={s.legBarBg}>
        <div style={{ ...s.legBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={s.legValue}>{ms(value)}</span>
    </div>
  );
}

export default function LatencyPanel({ breakdown }: LatencyPanelProps) {
  const [open, setOpen] = useState(false);

  const b = breakdown;
  const total = b?.totalE2E ?? 0;
  const hasSamples = b != null && b.sampleCount > 0;

  const legs = b ? [
    b.clientProcessing,
    b.studentToServer,
    b.serverProcessing,
    b.serverToTutor,
    b.clientIngestion,
  ] : [];

  return (
    <div style={{ ...cardStyle, padding: 0 }}>
      <button style={s.header} onClick={() => setOpen(!open)}>
        <span style={s.title}>Latency Breakdown</span>
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
          {hasSamples && b ? (
            <>
              {legs.map((v, i) => (
                <LegRow key={i} label={LEG_LABELS[i]} value={v} maxMs={total || 1} color={LEG_COLORS[i]} />
              ))}
              {/* Total row with gradient */}
              <div style={{ ...s.legRow, borderTop: `1px solid ${colors.borderLight}`, paddingTop: 8, marginTop: 4 }}>
                <span style={{ ...s.legLabel, fontWeight: 600 }}>Total</span>
                <div style={s.legBarBg}>
                  <div style={{
                    ...s.legBarFill,
                    width: '100%',
                    background: `linear-gradient(90deg, ${colors.mint}, ${colors.blue}, ${colors.lavender})`,
                  }} />
                </div>
                <span style={{ ...s.legValue, fontWeight: 700 }}>{ms(total)}</span>
              </div>
            </>
          ) : (
            <span style={s.noData}>Requires remote student connection</span>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  body: {
    padding: '0 16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  noData: {
    fontSize: '0.82rem',
    color: colors.textTertiary,
    textAlign: 'center' as const,
    padding: '4px 0',
  },
  legRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  legLabel: {
    fontSize: '0.78rem',
    color: colors.textSecondary,
    width: 110,
    flexShrink: 0,
  },
  legBarBg: {
    flex: 1,
    height: 6,
    background: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  legBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  legValue: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: colors.textPrimary,
    width: 44,
    textAlign: 'right' as const,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
};
