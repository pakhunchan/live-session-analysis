import React, { useState } from 'react';
import type { LatencyBreakdown } from '../core/LatencyTracker';

interface LatencyPanelProps {
  breakdown: LatencyBreakdown | null;
}

function ms(v: number): string {
  return `${Math.round(v)}ms`;
}

function getLatencyColor(total: number): string {
  if (total < 150) return '#198754';  // green
  if (total < 400) return '#ffc107';  // yellow
  return '#dc3545';                    // red
}

function LegRow({ label, value, maxMs }: { label: string; value: number; maxMs: number }) {
  const pct = maxMs > 0 ? Math.min(100, (value / maxMs) * 100) : 0;
  return (
    <div style={s.legRow}>
      <span style={s.legLabel}>{label}</span>
      <div style={s.legBarBg}>
        <div style={{ ...s.legBarFill, width: `${pct}%` }} />
      </div>
      <span style={s.legValue}>{ms(value)}</span>
    </div>
  );
}

export default function LatencyPanel({ breakdown }: LatencyPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const b = breakdown;
  const total = b?.totalE2E ?? 0;
  const color = getLatencyColor(total);
  const hasSamples = b != null && b.sampleCount > 0;

  return (
    <div style={s.tile}>
      <button style={s.tileHeader} onClick={() => setExpanded(!expanded)}>
        <div style={s.headerInner}>
          <span style={s.label}>Latency</span>
          <span style={{ ...s.totalBadge, background: color }}>
            {hasSamples ? ms(total) : '—'}
          </span>
          <span style={s.chevron}>{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && hasSamples && b && (
        <div style={s.body}>
          <LegRow label="Client Processing" value={b.clientProcessing} maxMs={total || 1} />
          <LegRow label="→ Server" value={b.studentToServer} maxMs={total || 1} />
          <LegRow label="Server Processing" value={b.serverProcessing} maxMs={total || 1} />
          <LegRow label="→ Tutor" value={b.serverToTutor} maxMs={total || 1} />
          <LegRow label="Ingestion" value={b.clientIngestion} maxMs={total || 1} />
        </div>
      )}

      {expanded && !hasSamples && (
        <div style={s.body}>
          <span style={s.noData}>Requires remote student connection</span>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  tile: {
    background: '#fff',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  tileHeader: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  label: {
    fontWeight: 700,
    color: '#212529',
    fontSize: '0.9rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  totalBadge: {
    marginLeft: 'auto',
    padding: '2px 10px',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '0.88rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  chevron: {
    color: '#adb5bd',
    fontSize: '0.9rem',
    flexShrink: 0,
  },
  body: {
    padding: '0.25rem 0.75rem 0.6rem',
    borderTop: '1px solid #f0f0f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  noData: {
    fontSize: '0.82rem',
    color: '#adb5bd',
    textAlign: 'center' as const,
    padding: '0.3rem 0',
  },
  legRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
  },
  legLabel: {
    fontSize: '0.82rem',
    color: '#495057',
    width: 110,
    flexShrink: 0,
  },
  legBarBg: {
    flex: 1,
    height: 7,
    background: '#e9ecef',
    borderRadius: 3,
    overflow: 'hidden',
  },
  legBarFill: {
    height: '100%',
    background: '#4dabf7',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  legValue: {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: '#495057',
    width: 44,
    textAlign: 'right' as const,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
};
