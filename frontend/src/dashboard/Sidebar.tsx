import React, { useState } from 'react';
import { engagementScore } from '../core/engagement';
import { isLookingAtScreen } from '../../../shared/engagement';
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

// ── Main Sidebar ──

export default function Sidebar({ snapshot, history, latencyBreakdown, eventBus, tutorName, studentName }: SidebarProps) {
  const studentEng = snapshot?.student ? engagementScore(snapshot.student) : null;
  const tutorEng = snapshot?.tutor ? engagementScore(snapshot.tutor) : null;
  const [engExpanded, setEngExpanded] = useState(false);
  const [tutorEngExpanded, setTutorEngExpanded] = useState(false);

  const eyeContactBool = (score: number | null) => score === null ? null : isLookingAtScreen(score) ? 1 : 0;

  const studentMetricCells = snapshot?.student ? [
    { label: 'Eye Contact', value: eyeContactBool(snapshot.student.eyeContactScore), isBool: true },
    { label: 'Energy', value: snapshot.student.expressionEnergy ?? null },
    { label: 'Talking', value: snapshot.student.isSpeaking === true ? 1 : snapshot.student.isSpeaking === false ? 0 : null, isBool: true },
    { label: 'Face Conf', value: snapshot.student.faceConfidence },
  ] as Array<{ label: string; value: number | null; isBool?: boolean }> : [];

  const tutorMetricCells = snapshot?.tutor ? [
    { label: 'Eye Contact', value: eyeContactBool(snapshot.tutor.eyeContactScore), isBool: true },
    { label: 'Energy', value: snapshot.tutor.expressionEnergy ?? null },
    { label: 'Talking', value: snapshot.tutor.isSpeaking === true ? 1 : snapshot.tutor.isSpeaking === false ? 0 : null, isBool: true },
    { label: 'Face Conf', value: snapshot.tutor.faceConfidence },
  ] as Array<{ label: string; value: number | null; isBool?: boolean }> : [];

  return (
    <aside style={s.sidebar}>
      <div style={s.inner}>
        {/* 1. Coaching Nudges */}
        <NudgeChips bus={eventBus} />

        {/* 2. Engagement */}
        <div style={cardStyle}>
          <div style={s.cardTitle}>Engagement</div>
          <button style={s.engagementBody} onClick={() => setEngExpanded(!engExpanded)}>
            <div style={s.engagementHeader}>
              <div style={s.engagementName}>{studentName}</div>
              <div style={s.donutRole}>Student</div>
            </div>
            <div style={s.heroDonutRow}>
              <div style={s.heroDonut}>
                <SvgDonut value={studentEng} size={110} strokeWidth={8} />
                <span style={s.donutSubLabel}>Engagement</span>
              </div>
              <div style={s.heroDonut}>
                <SvgDonut value={snapshot?.student?.expressionEnergy ?? null} size={110} strokeWidth={8} color="#5b8af5" />
                <span style={s.donutSubLabel}>Energy</span>
              </div>
            </div>
          </button>
          <div style={{
            maxHeight: engExpanded ? 400 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            {snapshot?.student && (
              <div style={s.metricGrid}>
                {studentMetricCells.map((mc) => {
                  if (mc.isBool) {
                    const active = mc.value === 1;
                    return (
                      <div key={mc.label} style={s.metricCell}>
                        <div style={s.mcLabel}>{mc.label}</div>
                        <div style={{ ...s.mcValue, color: active ? colors.green : colors.textTertiary }}>
                          {mc.value === null ? '–' : active ? 'Yes' : 'No'}
                        </div>
                      </div>
                    );
                  }
                  const c = mc.label === 'Energy' ? colors.blue : metricColor(mc.value);
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

        {/* 3. Latency */}
        <LatencyPanel breakdown={latencyBreakdown} />

        {/* 4. Session */}
        <div style={cardStyle}>
          <div style={s.cardTitle}>Session</div>
          <SessionStatusBar session={snapshot?.session ?? null} />
        </div>

        {/* 5. Engagement Timeline */}
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

        {/* 6. Tutor Engagement */}
        <div style={cardStyle}>
          <div style={s.cardTitle}>Tutor Engagement</div>
          <button style={s.engagementBody} onClick={() => setTutorEngExpanded(!tutorEngExpanded)}>
            <div style={s.engagementHeader}>
              <div style={s.engagementName}>{tutorName}</div>
              <div style={s.donutRole}>Tutor</div>
            </div>
            <div style={s.heroDonutRow}>
              <div style={s.heroDonut}>
                <SvgDonut value={tutorEng} size={110} strokeWidth={8} />
                <span style={s.donutSubLabel}>Engagement</span>
              </div>
              <div style={s.heroDonut}>
                <SvgDonut value={snapshot?.tutor?.expressionEnergy ?? null} size={110} strokeWidth={8} color="#5b8af5" />
                <span style={s.donutSubLabel}>Energy</span>
              </div>
            </div>
          </button>
          <div style={{
            maxHeight: tutorEngExpanded ? 400 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            {snapshot?.tutor && (
              <div style={s.metricGrid}>
                {tutorMetricCells.map((mc) => {
                  if (mc.isBool) {
                    const active = mc.value === 1;
                    return (
                      <div key={mc.label} style={s.metricCell}>
                        <div style={s.mcLabel}>{mc.label}</div>
                        <div style={{ ...s.mcValue, color: active ? colors.green : colors.textTertiary }}>
                          {mc.value === null ? '–' : active ? 'Yes' : 'No'}
                        </div>
                      </div>
                    );
                  }
                  const c = mc.label === 'Energy' ? colors.blue : metricColor(mc.value);
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

  // Engagement clickable body
  engagementBody: {
    width: '100%',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontFamily: font,
    textAlign: 'center' as const,
  },

  // Engagement header
  engagementHeader: {
    textAlign: 'center' as const,
    marginBottom: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  engagementName: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: colors.textPrimary,
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
  donutRole: {
    fontSize: '0.65rem',
    fontWeight: 500,
    color: colors.textTertiary,
    marginTop: -4,
  },
  donutSubLabel: {
    fontSize: '0.72rem',
    fontWeight: 500,
    color: colors.textTertiary,
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
