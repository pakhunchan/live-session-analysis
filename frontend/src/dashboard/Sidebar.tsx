import React, { useState } from 'react';
import { engagementScore } from '../core/engagement';
import SvgDonut from './SvgDonut';
import SessionStatusBar from './SessionStatusBar';
import TimelineChart from './TimelineChart';
import LatencyPanel from './LatencyPanel';
import NudgeChips from './NudgeChips';
import { colors, font, card as cardStyle, metricColor, layout } from './designTokens';
import type { LatencyBreakdown } from '../core/LatencyTracker';
import type { MetricSnapshot, ParticipantMetrics, EnergyBreakdown } from '../types';
import type { EventBus } from '../core/EventBus';

interface SidebarProps {
  snapshot: MetricSnapshot | null;
  history: MetricSnapshot[];
  latencyBreakdown: LatencyBreakdown | null;
  eventBus: EventBus;
  tutorName: string;
  studentName: string;
}

function pct(v: number | null): string {
  if (v === null) return '–';
  return `${Math.round(v * 100)}%`;
}

// ── Participant Expandable Row ──

function ParticipantRow({ label, metrics, avatarStyle }: {
  label: string;
  metrics: ParticipantMetrics | null;
  avatarStyle: React.CSSProperties;
}) {
  const [open, setOpen] = useState(label === 'Student');
  const eng = metrics ? engagementScore(metrics) : null;
  const engColor = metricColor(eng);

  const metricCells = metrics ? [
    { label: 'Eye Contact', value: metrics.eyeContactScore },
    { label: 'Talk Time', value: metrics.talkTimePercent },
    { label: 'Energy', value: metrics.energyScore },
    { label: 'Face Conf', value: metrics.faceConfidence },
  ] : [];

  return (
    <div>
      <button style={s.participantHeader} onClick={() => setOpen(!open)}>
        <div style={{ ...s.avatar, ...avatarStyle }}>
          {label[0]}
        </div>
        <span style={s.participantName}>{label}</span>
        <span style={{ ...s.quickStat, color: engColor }}>{pct(eng)}</span>
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
            flexShrink: 0,
          }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <div style={{
        maxHeight: open ? 400 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {metrics && (
          <div style={s.metricGrid}>
            {metricCells.map((mc) => {
              const c = metricColor(mc.value);
              const w = mc.value !== null ? `${Math.round(mc.value * 100)}%` : '0%';
              return (
                <div key={mc.label} style={s.metricCell}>
                  <div style={s.mcLabel}>{mc.label}</div>
                  <div style={{ ...s.mcValue, color: c }}>{pct(mc.value)}</div>
                  <div style={s.mcBar}>
                    <div style={{ ...s.mcBarFill, width: w, background: c }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Sidebar ──

export default function Sidebar({ snapshot, history, latencyBreakdown, eventBus, tutorName, studentName }: SidebarProps) {
  const studentEng = snapshot?.student ? engagementScore(snapshot.student) : null;
  const tutorEng = snapshot?.tutor ? engagementScore(snapshot.tutor) : null;

  return (
    <aside style={s.sidebar}>
      <div style={s.inner}>
        {/* 1. Hero Donuts */}
        <div style={cardStyle}>
          <div style={s.cardTitle}>Engagement</div>
          <div style={s.heroDonutRow}>
            <div style={s.heroDonut}>
              <SvgDonut value={studentEng} size={110} strokeWidth={8} />
              <span style={s.donutLabel}>{studentName}</span>
            </div>
            <div style={s.heroDonut}>
              <SvgDonut value={tutorEng} size={110} strokeWidth={8} />
              <span style={s.donutLabel}>{tutorName}</span>
            </div>
          </div>
        </div>

        {/* 2. Participants */}
        <div style={cardStyle}>
          <div style={s.cardTitle}>Participants</div>
          <ParticipantRow
            label={studentName}
            metrics={snapshot?.student ?? null}
            avatarStyle={{ background: `linear-gradient(135deg, ${colors.blue}, ${colors.lavender})` }}
          />
          <ParticipantRow
            label={tutorName}
            metrics={snapshot?.tutor ?? null}
            avatarStyle={{ background: `linear-gradient(135deg, ${colors.mint}, #3bb8d8)` }}
          />
        </div>

        {/* 3. Session Stats */}
        <div style={cardStyle}>
          <div style={s.cardTitle}>Session</div>
          <SessionStatusBar session={snapshot?.session ?? null} />
        </div>

        {/* 4. Timeline */}
        <div style={cardStyle}>
          <div style={s.cardTitle}>Engagement Timeline</div>
          <TimelineChart history={history} height={100} />
          <div style={s.legendRow}>
            <div style={s.legendItem}>
              <span style={{ ...s.legendDot, background: colors.blue }} /> Student
            </div>
            <div style={s.legendItem}>
              <span style={{ ...s.legendDot, background: colors.mint }} /> Tutor
            </div>
          </div>
        </div>

        {/* 5. Latency */}
        <LatencyPanel breakdown={latencyBreakdown} />

        {/* 6. Nudges */}
        <NudgeChips bus={eventBus} />
      </div>
    </aside>
  );
}

export const SIDEBAR_WIDTH = layout.sidebarW;

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    width: layout.sidebarW,
    flexShrink: 0,
    background: 'transparent',
    overflowY: 'auto',
    scrollbarGutter: 'stable',
    height: '100%',
    fontFamily: font,
  },
  inner: {
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardTitle: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 14,
  },

  // Hero donuts
  heroDonutRow: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDonut: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  donutLabel: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: colors.textSecondary,
  },

  // Participant rows
  participantHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 0',
    background: 'none',
    border: 'none',
    borderBottom: `1px solid ${colors.borderLight}`,
    cursor: 'pointer',
    fontFamily: font,
    textAlign: 'left' as const,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#fff',
    flexShrink: 0,
  },
  participantName: {
    flex: 1,
    fontWeight: 600,
    fontSize: '0.85rem',
    color: colors.textPrimary,
  },
  quickStat: {
    fontSize: '0.82rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },

  // Metric grid
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    padding: '12px 0 8px',
  },
  metricCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    background: colors.surfaceHover,
    borderRadius: 8,
  },
  mcLabel: {
    fontSize: '0.68rem',
    color: colors.textTertiary,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  mcValue: {
    fontSize: '1.05rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  mcBar: {
    height: 3,
    borderRadius: 2,
    background: colors.borderLight,
    marginTop: 2,
  },
  mcBarFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.6s ease',
  },

  // Timeline legend
  legendRow: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    marginTop: 10,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: '0.72rem',
    color: colors.textTertiary,
  },
  legendDot: {
    width: 10,
    height: 3,
    borderRadius: 2,
    display: 'inline-block',
  },
};
