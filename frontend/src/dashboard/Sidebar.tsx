import React from 'react';
import ParticipantCard from './ParticipantCard';
import SessionStatusBar from './SessionStatusBar';
import TimelineChart from './TimelineChart';
import type { MetricSnapshot } from '../types';

interface SidebarProps {
  snapshot: MetricSnapshot | null;
  history: MetricSnapshot[];
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ snapshot, history, isOpen, onToggle }: SidebarProps) {
  return (
    <>
      <button
        onClick={onToggle}
        style={styles.toggleBtn}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <svg width="24" height="42" viewBox="0 0 24 42" fill="none" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          <path d="M18 6L6 21L18 36" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <aside style={styles.sidebar}>
          <div style={styles.sidebarInner}>
            <SessionStatusBar session={snapshot?.session ?? null} />

            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Student</h4>
              <ParticipantCard
                role="Student"
                metrics={snapshot?.student ?? null}
                color="#6610f2"
              />
            </div>

            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Tutor</h4>
              <ParticipantCard
                role="Tutor"
                metrics={snapshot?.tutor ?? null}
                color="#0d6efd"
              />
            </div>

            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Engagement Timeline</h4>
              <TimelineChart history={history} height={180} />
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

const SIDEBAR_WIDTH = 340;

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    background: '#f8f9fa',
    borderLeft: '1px solid #dee2e6',
    overflowY: 'auto',
    height: '100%',
  },
  sidebarInner: {
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
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
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#495057',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
};

export { SIDEBAR_WIDTH };
