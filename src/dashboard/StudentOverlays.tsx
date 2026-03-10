import React from 'react';
import { engagementScore } from '../core/engagement';
import type { ParticipantMetrics } from '../types';

interface StudentOverlaysProps {
  metrics: ParticipantMetrics | null;
}

function getBorderColor(engagement: number): string {
  if (engagement >= 0.6) return '#198754'; // green
  if (engagement >= 0.4) return '#ffc107'; // yellow
  return '#dc3545';                         // red
}

function getStatusIcon(m: ParticipantMetrics): { icon: string; title: string } | null {
  if (m.isSpeaking) return { icon: '🎙', title: 'Speaking' };
  if (m.distractionDurationMs > 10000) return { icon: '⚠', title: 'Distracted' };
  return null;
}

export default function StudentOverlays({ metrics }: StudentOverlaysProps) {
  if (!metrics) return null;

  const engagement = engagementScore(metrics);
  const borderColor = getBorderColor(engagement);
  const engPct = Math.round(engagement * 100);
  const status = getStatusIcon(metrics);

  return (
    <>
      {/* Engagement border — inset glow around the whole video */}
      <div style={{
        ...styles.borderOverlay,
        boxShadow: `inset 0 0 0 3px ${borderColor}`,
      }} />

      {/* Engagement pill — bottom-left */}
      <div style={{
        ...styles.engagementPill,
        background: borderColor,
      }}>
        Eng {engPct}%
      </div>

      {/* Status icon — top-right */}
      {status && (
        <div style={styles.statusIcon} title={status.title}>
          {status.icon}
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  borderOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: '8px',
    pointerEvents: 'none',
    zIndex: 1,
    transition: 'box-shadow 0.5s',
  },
  engagementPill: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    padding: '3px 10px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: 700,
    zIndex: 3,
    fontVariantNumeric: 'tabular-nums',
  },
  statusIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: '1.1rem',
    lineHeight: 1,
    zIndex: 3,
    background: 'rgba(0,0,0,0.5)',
    borderRadius: '50%',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
