import React, { useState, useCallback, useRef } from 'react';
import { useMetricsEngine } from './hooks/useMetricsEngine';
import VideoPreview from './VideoPreview';
import PersistentMetrics from './PersistentMetrics';
import StudentOverlays from './StudentOverlays';
import SessionSetup from './SessionSetup';
import Sidebar from './Sidebar';
import NudgeChips from './NudgeChips';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        <div style={styles.sessionLayout}>
          <div style={styles.mainArea}>
            <div style={styles.videoStage}>
              <NudgeChips bus={eventBus} />
              <VideoPreview
                stream={studentStream}
                label="Student"
                showMesh={showMesh}
              />
              <StudentOverlays metrics={snapshot?.student ?? null} />
              <PersistentMetrics student={snapshot?.student ?? null} />
              <div style={styles.tutorOverlay}>
                <VideoPreview
                  stream={tutorStream}
                  label="You"
                  showMesh={showMesh}
                  mirrored
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

            <button onClick={handleStop} style={styles.stopBtn}>
              Stop Session
            </button>
          </div>

          <Sidebar
            snapshot={snapshot}
            history={history}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
          />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '100%',
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
  sessionLayout: {
    display: 'flex',
    gap: 0,
    position: 'relative',
  },
  mainArea: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  videoStage: {
    position: 'relative',
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
    margin: '1rem auto 0',
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
