import React from 'react';
import MetricGauge from './MetricGauge';
import TimelineChart from './TimelineChart';
import type { SessionSummary } from '../types/session';
import type { MetricSnapshot } from '../types/metrics';

interface PostSessionSummaryProps {
  summary: SessionSummary;
  history: MetricSnapshot[];
  onNewSession: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** Format a relative timestamp (ms offset from session start) as m:ss */
function formatTimestamp(offsetMs: number): string {
  const totalSec = Math.max(0, Math.floor(offsetMs / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const momentIcons: Record<string, string> = {
  attention_drop: '\u25CF',   // filled circle
  engagement_spike: '\u25B2', // triangle up
  long_silence: '\u25CB',     // empty circle
  interruption_burst: '\u25A0', // filled square
  energy_shift: '\u25BC',     // triangle down
};

const momentColors: Record<string, string> = {
  attention_drop: '#dc3545',
  engagement_spike: '#198754',
  long_silence: '#6c757d',
  interruption_burst: '#fd7e14',
  energy_shift: '#0d6efd',
};

export default function PostSessionSummary({ summary, history, onNewSession }: PostSessionSummaryProps) {

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Session Summary</h2>
        <button onClick={onNewSession} style={styles.newSessionBtn}>
          New Session
        </button>
      </div>

      {/* Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatDuration(summary.durationMs)}</div>
          <div style={styles.statLabel}>Duration</div>
        </div>
        <div style={styles.statCard}>
          <div style={{
            ...styles.statValue,
            color: summary.engagementScore >= 60 ? '#198754' : summary.engagementScore >= 40 ? '#ffc107' : '#dc3545',
          }}>
            {summary.engagementScore}%
          </div>
          <div style={styles.statLabel}>Engagement</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{summary.totalInterruptions}</div>
          <div style={styles.statLabel}>Interruptions</div>
        </div>
      </div>

      {/* Participant Comparison */}
      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Participant Comparison</h3>
        <div style={styles.comparisonGrid}>
          <div style={styles.participantCol}>
            <h4 style={{ ...styles.participantLabel, color: '#6610f2' }}>Student</h4>
            <div style={styles.gaugeRow}>
              <MetricGauge
                label="Engagement"
                value={summary.engagementScore / 100}
                size={100}
              />
              <MetricGauge
                label="Energy"
                value={summary.avgMetrics.student?.energyScore ?? 0}
                size={100}
                color="#5b8af5"
              />
              <MetricGauge
                label="Talk Time"
                value={summary.talkTimeRatio.student}
                size={100}
              />
            </div>
          </div>
          <div style={styles.divider} />
          <div style={styles.participantCol}>
            <h4 style={{ ...styles.participantLabel, color: '#0d6efd' }}>Tutor</h4>
            <div style={styles.gaugeRow}>
              <MetricGauge
                label="Engagement"
                value={summary.avgMetrics.tutor?.engagementScore ?? 0}
                size={100}
              />
              <MetricGauge
                label="Energy"
                value={summary.avgMetrics.tutor?.energyScore ?? 0}
                size={100}
                color="#5b8af5"
              />
              <MetricGauge
                label="Talk Time"
                value={summary.talkTimeRatio.tutor}
                size={100}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Key Moments */}
      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Key Moments</h3>
        {summary.keyMoments.length === 0 ? (
          <p style={styles.emptyText}>No significant moments detected during this session.</p>
        ) : (
          <div style={styles.momentsList}>
            {summary.keyMoments.map((moment, i) => (
              <div key={i} style={styles.momentItem}>
                <span style={{
                  ...styles.momentIcon,
                  color: momentColors[moment.type] ?? '#6c757d',
                }}>
                  {momentIcons[moment.type] ?? '\u25CF'}
                </span>
                <span style={styles.momentTime}>
                  {formatTimestamp(moment.timestamp)}
                </span>
                <span style={styles.momentDesc}>{moment.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Recommendations</h3>
        {summary.recommendations.length === 0 ? (
          <div style={styles.loadingRow}>
            <div style={styles.spinner} />
            <span style={styles.loadingText}>Generating recommendations...</span>
          </div>
        ) : (
          <ol style={styles.recList}>
            {summary.recommendations.map((rec, i) => (
              <li key={i} style={styles.recItem}>{rec}</li>
            ))}
          </ol>
        )}
      </div>

      {/* Full Session Timeline */}
      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Engagement Timeline (Full Session)</h3>
        <TimelineChart history={history} height={220} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
  },
  newSessionBtn: {
    padding: '0.5rem 1.25rem',
    background: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  statsRow: {
    display: 'flex',
    gap: '1rem',
  },
  statCard: {
    flex: 1,
    background: '#f8f9fa',
    borderRadius: '8px',
    padding: '1.25rem',
    textAlign: 'center',
    border: '1px solid #dee2e6',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#212529',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '0.25rem',
  },
  card: {
    background: '#f8f9fa',
    borderRadius: '8px',
    padding: '1.25rem',
    border: '1px solid #dee2e6',
  },
  sectionTitle: {
    margin: '0 0 1rem 0',
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#495057',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  comparisonGrid: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
  },
  participantCol: {
    flex: 1,
    textAlign: 'center',
  },
  participantLabel: {
    margin: '0 0 0.75rem 0',
    fontSize: '1rem',
    fontWeight: 600,
  },
  gaugeRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  divider: {
    width: 1,
    background: '#dee2e6',
    alignSelf: 'stretch',
  },
  momentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: 200,
    overflowY: 'auto',
  },
  momentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.9rem',
  },
  momentIcon: {
    fontSize: '0.75rem',
    flexShrink: 0,
  },
  momentTime: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    color: '#495057',
    flexShrink: 0,
    fontWeight: 600,
  },
  momentDesc: {
    color: '#212529',
  },
  emptyText: {
    color: '#6c757d',
    fontSize: '0.9rem',
    fontStyle: 'italic',
    margin: 0,
  },
  recList: {
    margin: 0,
    paddingLeft: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  recItem: {
    fontSize: '0.9rem',
    color: '#212529',
    lineHeight: 1.5,
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  spinner: {
    width: 16,
    height: 16,
    border: '2px solid #dee2e6',
    borderTopColor: '#0d6efd',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: '0.9rem',
    color: '#6c757d',
    fontStyle: 'italic',
  },
};
