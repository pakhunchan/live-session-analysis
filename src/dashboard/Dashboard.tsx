import React, { useState, useCallback, useRef } from 'react';
import { useMetricsEngine } from './hooks/useMetricsEngine';
import ParticipantCard from './ParticipantCard';
import SessionStatusBar from './SessionStatusBar';
import TimelineChart from './TimelineChart';
import VideoPreview from './VideoPreview';
import SessionSetup from './SessionSetup';
import AmbientBar from '../coaching/AmbientBar';
import { SessionOrchestrator } from '../core/SessionOrchestrator';
import { MediaPipeFaceDetector } from '../video/FaceDetector';
import type { SessionSetupConfig } from '../types/session';

export default function Dashboard() {
  const { snapshot, history, isRunning, start, stop, eventBus, streamManager } = useMetricsEngine();
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [tutorStream, setTutorStream] = useState<MediaStream | null>(null);
  const [studentStream, setStudentStream] = useState<MediaStream | null>(null);
  const [showMesh, setShowMesh] = useState(false);
  const orchestratorRef = useRef<SessionOrchestrator | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const handleSessionStart = useCallback(async (config: SessionSetupConfig) => {
    try {
      setError(null);
      setSetupLoading(true);
      setStatus('Initializing streams...');

      const orchestrator = new SessionOrchestrator();
      orchestratorRef.current = orchestrator;

      const { streams } = await orchestrator.initialize(config, streamManager);
      setTutorStream(streams.tutor);
      setStudentStream(streams.student);

      const detector = new MediaPipeFaceDetector();
      setStatus('Loading MediaPipe model...');
      await detector.initialize();

      await start(detector);
      setStatus('Running');
    } catch (err) {
      setError((err as Error).message);
      setStatus('Error');
    } finally {
      setSetupLoading(false);
    }
  }, [start, streamManager]);

  const handleStop = useCallback(() => {
    stop();
    orchestratorRef.current?.dispose();
    orchestratorRef.current = null;
    setTutorStream(null);
    setStudentStream(null);
    setStatus('Stopped');
  }, [stop]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Live Session Analysis</h1>
        <div style={styles.headerRight}>
          <span style={{
            ...styles.statusDot,
            background: isRunning ? '#198754' : '#6c757d',
          }} />
          <span style={styles.statusText}>{status}</span>
        </div>
      </header>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {!isRunning && (
        <SessionSetup onStart={handleSessionStart} isLoading={setupLoading} />
      )}

      {isRunning && (
        <>
          <AmbientBar bus={eventBus} />

          <div style={styles.videoStage}>
            <VideoPreview
              stream={studentStream}
              label="Student"
              showMesh={showMesh}
            />
            <div style={styles.tutorOverlay}>
              <VideoPreview
                stream={tutorStream}
                label="You"
                showMesh={showMesh}
              />
            </div>
            <label style={styles.meshToggle}>
              <input
                type="checkbox"
                checked={showMesh}
                onChange={(e) => setShowMesh(e.target.checked)}
              />
              {' '}Show Mesh
            </label>
          </div>

          <SessionStatusBar session={snapshot?.session ?? null} />

          <div style={styles.participantRow}>
            <ParticipantCard
              role="Tutor"
              metrics={snapshot?.tutor ?? null}
              color="#0d6efd"
            />
            <ParticipantCard
              role="Student"
              metrics={snapshot?.student ?? null}
              color="#6610f2"
            />
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Engagement Timeline</h3>
            <TimelineChart history={history} height={220} />
          </div>

          <button onClick={handleStop} style={styles.stopBtn}>
            Stop Session
          </button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #dee2e6',
  },
  title: {
    margin: 0,
    fontSize: '1.4rem',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusText: {
    fontSize: '0.85rem',
    color: '#6c757d',
  },
  errorBanner: {
    padding: '0.75rem 1rem',
    background: '#f8d7da',
    color: '#842029',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  participantRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1rem',
  },
  section: {
    marginTop: '1.25rem',
  },
  sectionTitle: {
    margin: '0 0 0.5rem',
    fontSize: '1rem',
    fontWeight: 600,
  },
  videoStage: {
    position: 'relative',
    marginTop: '1.25rem',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#000',
  },
  tutorOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 200,
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    border: '2px solid rgba(255,255,255,0.3)',
    zIndex: 2,
  },
  meshToggle: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    fontSize: '0.75rem',
    color: '#fff',
    cursor: 'pointer',
    background: 'rgba(0,0,0,0.5)',
    padding: '4px 8px',
    borderRadius: '4px',
    zIndex: 2,
  },
  stopBtn: {
    display: 'block',
    margin: '1.5rem auto 0',
    padding: '0.5rem 2rem',
    background: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
};
