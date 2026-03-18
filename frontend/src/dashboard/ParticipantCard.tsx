import React from 'react';
import MetricGauge from './MetricGauge';
import { isLookingAtScreen } from '../../../shared/engagement';
import type { ParticipantMetrics, EnergyBreakdown } from '../types';

interface ParticipantCardProps {
  role: 'Tutor' | 'Student';
  metrics: ParticipantMetrics | null;
  color: string;
}

export default function ParticipantCard({ role, metrics, color }: ParticipantCardProps) {
  const m = metrics ?? {
    eyeContactScore: 0,
    talkTimePercent: 0,
    energyScore: 0,
    isSpeaking: false,
    faceDetected: false,
    faceConfidence: 0,
    distractionDurationMs: 0,
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ ...styles.dot, background: color }} />
        <span style={styles.role}>{role}</span>
        {m.isSpeaking && <span style={styles.speakingBadge}>Speaking</span>}
        {!m.faceDetected && <span style={styles.noFaceBadge}>No Face</span>}
      </div>

      <div style={styles.gauges}>
        <div style={styles.boolGauge}>
          <div style={{
            ...styles.boolIndicator,
            background: isLookingAtScreen(m.eyeContactScore) ? '#d1e7dd' : '#f8d7da',
            color: isLookingAtScreen(m.eyeContactScore) ? '#0f5132' : '#842029',
          }}>
            {isLookingAtScreen(m.eyeContactScore) ? 'Yes' : 'No'}
          </div>
          <span style={styles.boolLabel}>Eye Contact</span>
        </div>
        <MetricGauge label="Talk Time" value={m.talkTimePercent} size={100} />
        <MetricGauge label="Energy" value={m.energyScore} size={100} color="#5b8af5" />
      </div>

      <div style={styles.details}>
        <span>Face Confidence: {Math.round(m.faceConfidence * 100)}%</span>
      </div>

      {m.energyBreakdown && <EnergyDebug breakdown={m.energyBreakdown} />}
    </div>
  );
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function EnergyDebug({ breakdown: b }: { breakdown: EnergyBreakdown }) {
  return (
    <div style={styles.debugPanel}>
      <div style={styles.debugTitle}>Energy Breakdown</div>
      <div style={styles.debugColumns}>
        <div style={styles.debugCol}>
          <div style={styles.debugColTitle}>Video (20%)</div>
          <DebugRow label="Blink" value={b.blinkActivity} />
          <DebugRow label="Brows" value={b.browActivity} />
          <DebugRow label="MouthOpen" value={b.lipActivity} />
          <DebugRow label="Smile" value={b.genuineSmile} />
          <div style={styles.debugSubtotal}>Expr: {pct(b.expressionEnergy)}</div>
          <div style={styles.debugSectionDivider} />
          <div style={styles.debugColTitle}>New Signals</div>
          <DebugRow label="Nod" value={b.headNodActivity} />
          <DebugRow label="EyeWide" value={b.eyeWideness} />
          <DebugRow label="LipTens" value={b.lipTension} />
          <DebugRow label="GazeX" value={b.gazeVariationX} />
        </div>
        <div style={styles.debugCol}>
          <div style={styles.debugColTitle}>Audio (80%)</div>
          <DebugRow label="VolVar" value={b.volumeVariance} />
          <DebugRow label="Bright" value={b.spectralBrightness} />
          <DebugRow label="SpeechRate" value={b.speechRate} />
          <DebugRow label="Pitch" value={Math.min(1, b.pitch / 500)} />
          <DebugRow label="PitchVar" value={b.pitchVariance} />
          <div style={styles.debugSubtotal}>Voice: {pct(b.voiceEnergy)}</div>
        </div>
      </div>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: number }) {
  const barWidth = Math.round(value * 100);
  return (
    <div style={styles.debugRow}>
      <span style={styles.debugLabel}>{label}</span>
      <div style={styles.debugBarBg}>
        <div style={{ ...styles.debugBarFill, width: `${barWidth}%` }} />
      </div>
      <span style={styles.debugValue}>{pct(value)}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    flex: 1,
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    background: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  role: {
    fontWeight: 700,
    fontSize: '1rem',
  },
  speakingBadge: {
    padding: '2px 8px',
    borderRadius: '12px',
    background: '#d1e7dd',
    color: '#0f5132',
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  noFaceBadge: {
    padding: '2px 8px',
    borderRadius: '12px',
    background: '#f8d7da',
    color: '#842029',
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  gauges: {
    display: 'flex',
    justifyContent: 'space-around',
    marginBottom: '0.5rem',
  },
  details: {
    fontSize: '0.75rem',
    color: '#6c757d',
    textAlign: 'center',
  },
  debugPanel: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    background: '#f8f9fa',
    borderRadius: '6px',
    border: '1px solid #e9ecef',
  },
  debugTitle: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#495057',
    marginBottom: '0.35rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  debugColumns: {
    display: 'flex',
    gap: '0.75rem',
  },
  debugCol: {
    flex: 1,
  },
  debugColTitle: {
    fontSize: '0.65rem',
    fontWeight: 600,
    color: '#6c757d',
    marginBottom: '0.25rem',
  },
  debugRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginBottom: '2px',
  },
  debugLabel: {
    fontSize: '0.6rem',
    color: '#495057',
    width: '52px',
    flexShrink: 0,
  },
  debugSectionDivider: {
    height: 1,
    background: '#dee2e6',
    margin: '4px 0',
  },
  debugBarBg: {
    flex: 1,
    height: 6,
    background: '#dee2e6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  debugBarFill: {
    height: '100%',
    background: '#0d6efd',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  debugValue: {
    fontSize: '0.6rem',
    color: '#495057',
    width: '28px',
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  debugSubtotal: {
    fontSize: '0.6rem',
    fontWeight: 600,
    color: '#495057',
    marginTop: '2px',
    textAlign: 'right' as const,
  },
  boolGauge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    width: 100,
  },
  boolIndicator: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  boolLabel: {
    fontSize: '0.7rem',
    color: '#6c757d',
    fontWeight: 500,
  },
};
