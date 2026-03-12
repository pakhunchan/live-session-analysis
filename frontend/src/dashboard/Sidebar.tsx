import React, { useState } from 'react';
import { engagementScore } from '../core/engagement';
import SessionStatusBar from './SessionStatusBar';
import TimelineChart from './TimelineChart';
import type { MetricSnapshot, ParticipantMetrics, EnergyBreakdown } from '../types';

interface SidebarProps {
  snapshot: MetricSnapshot | null;
  history: MetricSnapshot[];
  isOpen: boolean;
  onToggle: () => void;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function getEngColor(eng: number): string {
  if (eng >= 0.6) return '#198754';
  if (eng >= 0.4) return '#ffc107';
  return '#dc3545';
}

function getValueColor(v: number): string {
  if (v >= 0.6) return '#198754';
  if (v >= 0.35) return '#e67e22';
  return '#dc3545';
}

function MetricBar({ label, value, color }: { label: string; value: number; color?: string }) {
  const c = color ?? getValueColor(value);
  return (
    <div style={s.metricBar}>
      <span style={s.metricBarLabel}>{label}</span>
      <div style={s.metricBarTrack}>
        <div style={{ ...s.metricBarFill, width: `${Math.round(value * 100)}%`, background: c }} />
      </div>
      <span style={{ ...s.metricBarValue, color: c }}>{pct(value)}</span>
    </div>
  );
}

function ParticipantTile({ label, metrics, color }: { label: string; metrics: ParticipantMetrics | null; color: string }) {
  const [expanded, setExpanded] = useState(true);
  const [energyExpanded, setEnergyExpanded] = useState(false);

  const m = metrics;
  const eng = m ? engagementScore(m) : 0;
  const engColor = getEngColor(eng);

  return (
    <div style={s.tile}>
      {/* Header — always visible */}
      <button style={s.tileHeader} onClick={() => setExpanded(!expanded)}>
        <div style={{ ...s.dot, background: color }} />
        <span style={s.tileLabel}>{label}</span>
        {m?.isSpeaking && <span style={s.speakingBadge}>Speaking</span>}
        {m && !m.faceDetected && <span style={s.noFaceBadge}>No Face</span>}
        <span style={{ ...s.engBadge, background: engColor }}>Eng {pct(eng)}</span>
        <span style={s.chevron}>{expanded ? '▾' : '▸'}</span>
      </button>

      {/* Expanded body */}
      {expanded && m && (
        <div style={s.tileBody}>
          <MetricBar label="Eye Contact" value={m.eyeContactScore} />
          <MetricBar label="Talk Time" value={m.talkTimePercent} />

          {/* Energy — clickable to expand breakdown */}
          <button
            style={s.energyBtn}
            onClick={() => setEnergyExpanded(!energyExpanded)}
          >
            <MetricBar label="Energy" value={m.energyScore} />
            <span style={s.expandHint}>{energyExpanded ? '▾' : '▸'}</span>
          </button>

          {energyExpanded && m.energyBreakdown && (
            <BreakdownPanel breakdown={m.energyBreakdown} />
          )}

          <div style={s.faceConf}>
            Face Confidence: {pct(m.faceConfidence)}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownPanel({ breakdown: b }: { breakdown: EnergyBreakdown }) {
  return (
    <div style={s.breakdownPanel}>
      <div style={s.breakdownCols}>
        <div style={s.breakdownCol}>
          <div style={s.breakdownColTitle}>Video</div>
          <BreakdownRow label="Blink" value={b.blinkActivity} />
          <BreakdownRow label="Brows" value={b.browActivity} />
          <BreakdownRow label="Mouth" value={b.lipActivity} />
          <BreakdownRow label="Smile" value={b.genuineSmile} />
          <div style={s.breakdownSub}>Expr: {pct(b.expressionEnergy)}</div>
          <div style={s.breakdownDivider} />
          <div style={s.breakdownColTitle}>Signals</div>
          <BreakdownRow label="Nod" value={b.headNodActivity} />
          <BreakdownRow label="EyeWide" value={b.eyeWideness} />
          <BreakdownRow label="LipTens" value={b.lipTension} />
          <BreakdownRow label="GazeX" value={b.gazeVariationX} />
        </div>
        <div style={s.breakdownCol}>
          <div style={s.breakdownColTitle}>Audio</div>
          <BreakdownRow label="VolVar" value={b.volumeVariance} />
          <BreakdownRow label="Bright" value={b.spectralBrightness} />
          <BreakdownRow label="Speech" value={b.speechRate} />
          <BreakdownRow label="Pitch" value={Math.min(1, b.pitch / 500)} />
          <BreakdownRow label="PitchVar" value={b.pitchVariance} />
          <div style={s.breakdownSub}>Voice: {pct(b.voiceEnergy)}</div>
        </div>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.bRow}>
      <span style={s.bLabel}>{label}</span>
      <div style={s.bBarBg}>
        <div style={{ ...s.bBarFill, width: `${Math.round(value * 100)}%` }} />
      </div>
      <span style={s.bValue}>{pct(value)}</span>
    </div>
  );
}

export default function Sidebar({ snapshot, history, isOpen, onToggle }: SidebarProps) {
  return (
    <>
      <button
        onClick={onToggle}
        style={s.toggleBtn}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <svg width="24" height="42" viewBox="0 0 24 42" fill="none" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          <path d="M18 6L6 21L18 36" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <aside style={s.sidebar}>
          <div style={s.inner}>
            <SessionStatusBar session={snapshot?.session ?? null} />
            <ParticipantTile label="Student" metrics={snapshot?.student ?? null} color="#6610f2" />
            <ParticipantTile label="Tutor" metrics={snapshot?.tutor ?? null} color="#0d6efd" />
            <div style={s.timelineSection}>
              <div style={s.timelineTitle}>Engagement Timeline</div>
              <TimelineChart history={history} height={140} />
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

const SIDEBAR_WIDTH = 320;

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    background: '#f8f9fa',
    borderLeft: '1px solid #dee2e6',
    overflowY: 'auto',
    height: '100%',
  },
  inner: {
    padding: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  toggleBtn: {
    width: 33,
    flexShrink: 0,
    alignSelf: 'stretch',
    background: '#adb5bd',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },

  // Tile
  tile: {
    background: '#fff',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  tileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    width: '100%',
    padding: '0.55rem 0.75rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    textAlign: 'left',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  tileLabel: {
    fontWeight: 700,
    color: '#212529',
  },
  engBadge: {
    marginLeft: 'auto',
    padding: '2px 8px',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '0.68rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  chevron: {
    color: '#adb5bd',
    fontSize: '0.7rem',
    flexShrink: 0,
  },
  speakingBadge: {
    padding: '1px 6px',
    borderRadius: '8px',
    background: '#d1e7dd',
    color: '#0f5132',
    fontSize: '0.6rem',
    fontWeight: 600,
  },
  noFaceBadge: {
    padding: '1px 6px',
    borderRadius: '8px',
    background: '#f8d7da',
    color: '#842029',
    fontSize: '0.6rem',
    fontWeight: 600,
  },

  // Tile body
  tileBody: {
    padding: '0.25rem 0.75rem 0.6rem',
    borderTop: '1px solid #f0f0f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },

  // Metric bar
  metricBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flex: 1,
  },
  metricBarLabel: {
    fontSize: '0.75rem',
    color: '#495057',
    width: 80,
    flexShrink: 0,
  },
  metricBarTrack: {
    flex: 1,
    height: 7,
    background: '#e9ecef',
    borderRadius: 4,
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.4s ease',
  },
  metricBarValue: {
    fontSize: '0.75rem',
    fontWeight: 700,
    width: 34,
    textAlign: 'right' as const,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },

  // Energy expand button
  energyBtn: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    gap: '0.2rem',
  },
  expandHint: {
    fontSize: '0.6rem',
    color: '#adb5bd',
    flexShrink: 0,
  },
  faceConf: {
    fontSize: '0.68rem',
    color: '#adb5bd',
    textAlign: 'center' as const,
    marginTop: '0.15rem',
  },

  // Breakdown
  breakdownPanel: {
    padding: '0.4rem 0.5rem',
    background: '#fafafa',
    borderRadius: '6px',
    border: '1px solid #f0f0f0',
  },
  breakdownCols: {
    display: 'flex',
    gap: '0.5rem',
  },
  breakdownCol: {
    flex: 1,
  },
  breakdownColTitle: {
    fontSize: '0.58rem',
    fontWeight: 700,
    color: '#868e96',
    marginBottom: '0.15rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  bRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.15rem',
    marginBottom: 2,
  },
  bLabel: {
    fontSize: '0.56rem',
    color: '#495057',
    width: 42,
    flexShrink: 0,
  },
  bBarBg: {
    flex: 1,
    height: 4,
    background: '#e9ecef',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bBarFill: {
    height: '100%',
    background: '#4dabf7',
    borderRadius: 2,
    transition: 'width 0.3s',
  },
  bValue: {
    fontSize: '0.56rem',
    color: '#495057',
    width: 24,
    textAlign: 'right' as const,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  breakdownSub: {
    fontSize: '0.58rem',
    fontWeight: 600,
    color: '#495057',
    marginTop: 2,
    textAlign: 'right' as const,
  },
  breakdownDivider: {
    height: 1,
    background: '#e9ecef',
    margin: '3px 0',
  },

  // Timeline
  timelineSection: {
    background: '#fff',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    padding: '0.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  timelineTitle: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#495057',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.3rem',
  },
};

export { SIDEBAR_WIDTH };
