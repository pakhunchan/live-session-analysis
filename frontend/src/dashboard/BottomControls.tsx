import React from 'react';
import { colors, radius, glassmorphism, font } from './designTokens';

interface BottomControlsProps {
  muted: boolean;
  showMesh: boolean;
  onToggleMute: () => void;
  onToggleMesh: () => void;
  onEndSession: () => void;
}

export default function BottomControls({
  muted,
  showMesh,
  onToggleMute,
  onToggleMesh,
  onEndSession,
}: BottomControlsProps) {
  return (
    <div style={styles.bar}>
      {/* Mic */}
      <button
        onClick={onToggleMute}
        style={{
          ...styles.btn,
          ...(muted ? styles.btnDanger : styles.btnActive),
        }}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18" />
            <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="1" width="6" height="12" rx="3" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* Face Mesh toggle */}
      <button
        onClick={onToggleMesh}
        style={{
          ...styles.btn,
          ...(showMesh ? styles.btnActive : {}),
        }}
        title={showMesh ? 'Hide Face Mesh' : 'Show Face Mesh'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>

      <div style={styles.spacer} />

      {/* End Session */}
      <button
        onClick={onEndSession}
        style={{ ...styles.btn, ...styles.btnEnd }}
        title="End Session"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2.5" />
        </svg>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 64,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '0 20px',
    ...glassmorphism(0.72),
    borderTop: `1px solid ${colors.borderLight}`,
    fontFamily: font,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    background: colors.surface,
    color: colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  btnActive: {
    background: colors.blueBg,
    borderColor: colors.blueSoft,
    color: colors.blue,
  },
  btnDanger: {
    background: colors.coralSoft,
    borderColor: colors.coral,
    color: colors.coral,
  },
  btnEnd: {
    background: colors.coral,
    borderColor: colors.coral,
    color: '#fff',
    width: 'auto',
    padding: '0 20px',
    gap: 6,
    fontWeight: 600,
    fontSize: '0.82rem',
  },
  spacer: {
    flex: 1,
  },
};
