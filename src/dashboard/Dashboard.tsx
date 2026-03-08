import React, { useState, useCallback, useRef } from 'react';
import { useMetricsEngine } from './hooks/useMetricsEngine';
import ParticipantCard from './ParticipantCard';
import SessionStatusBar from './SessionStatusBar';
import TimelineChart from './TimelineChart';
import VideoPreview from './VideoPreview';
import AmbientBar from '../coaching/AmbientBar';
import { FileInputAdapter } from '../inputs/FileInputAdapter';
import { LiveInputAdapter } from '../inputs/LiveInputAdapter';
import { MediaPipeFaceDetector } from '../video/FaceDetector';
import type { InputAdapter } from '../inputs/InputAdapter';

export default function Dashboard() {
  const { snapshot, history, isRunning, start, stop, eventBus, streamManager } = useMetricsEngine();
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [tutorStream, setTutorStream] = useState<MediaStream | null>(null);
  const [dragging, setDragging] = useState(false);
  const adapterRef = useRef<InputAdapter | null>(null);

  const initAndStart = useCallback(async (adapter: InputAdapter) => {
    try {
      setError(null);
      setStatus('Initializing face detector...');

      await adapter.initialize();
      adapterRef.current = adapter;

      const videoEl = adapter.getVideoElement();
      const stream = adapter.getMediaStream();

      if (videoEl) streamManager.setVideoElement('tutor', videoEl);
      if (stream) {
        streamManager.setStream('tutor', stream);
        setTutorStream(stream);
      }

      const detector = new MediaPipeFaceDetector();
      setStatus('Loading MediaPipe model...');
      await detector.initialize();

      start(detector);
      setStatus('Running');
    } catch (err) {
      setError((err as Error).message);
      setStatus('Error');
    }
  }, [start, streamManager]);

  const handleFileLoad = useCallback(async (file: File) => {
    const adapter = new FileInputAdapter(file);
    await initAndStart(adapter);
  }, [initAndStart]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      handleFileLoad(file);
    }
  }, [handleFileLoad]);

  const handleLiveCamera = useCallback(async () => {
    const adapter = new LiveInputAdapter();
    await initAndStart(adapter);
  }, [initAndStart]);

  const handleStop = useCallback(() => {
    stop();
    adapterRef.current?.dispose();
    adapterRef.current = null;
    setTutorStream(null);
    setStatus('Stopped');
  }, [stop]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileLoad(file);
  }, [handleFileLoad]);

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
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          style={{
            ...styles.dropZone,
            ...(dragging ? styles.dropZoneActive : {}),
          }}
        >
          <p style={styles.dropTitle}>Drop a video file to analyze</p>
          <p style={styles.dropSub}>or use the buttons below</p>
          <div style={styles.startControls}>
            <input type="file" accept="video/*" onChange={handleFileInput} />
            <button onClick={handleLiveCamera} style={styles.cameraBtn}>
              Use Live Camera
            </button>
          </div>
        </div>
      )}

      {isRunning && (
        <>
          <AmbientBar bus={eventBus} />
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

          <div style={styles.videoRow}>
            <VideoPreview stream={tutorStream} label="Tutor" />
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
    maxWidth: '960px',
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
  dropZone: {
    border: '2px dashed #adb5bd',
    borderRadius: '12px',
    padding: '3rem 2rem',
    textAlign: 'center',
    background: '#f8f9fa',
    transition: 'all 0.2s',
  },
  dropZoneActive: {
    borderColor: '#0d6efd',
    background: '#e7f1ff',
  },
  dropTitle: {
    margin: '0 0 0.25rem',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#495057',
  },
  dropSub: {
    margin: '0 0 1.5rem',
    fontSize: '0.85rem',
    color: '#6c757d',
  },
  startControls: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cameraBtn: {
    padding: '0.5rem 1.25rem',
    background: '#198754',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
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
  videoRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.25rem',
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
