import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FileInputAdapter } from '../inputs/FileInputAdapter';
import { LiveInputAdapter } from '../inputs/LiveInputAdapter';
import { StreamManager } from '../core/StreamManager';
import type { InputAdapter } from '../inputs/InputAdapter';

export default function DevPanel() {
  const [source, setSource] = useState<'none' | 'file' | 'live'>('none');
  const [frameCount, setFrameCount] = useState(0);
  const [audioChunkCount, setAudioChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Idle');
  const [dragging, setDragging] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const adapterRef = useRef<InputAdapter | null>(null);
  const streamManagerRef = useRef<StreamManager | null>(null);

  const cleanup = useCallback(() => {
    streamManagerRef.current?.stop();
    streamManagerRef.current = null;
    adapterRef.current?.dispose();
    adapterRef.current = null;
    setFrameCount(0);
    setAudioChunkCount(0);
  }, []);

  const startStreamManager = useCallback((adapter: InputAdapter) => {
    const sm = new StreamManager({ videoFps: 2, audioSampleHz: 20 });
    const videoEl = adapter.getVideoElement();
    const stream = adapter.getMediaStream();

    if (videoEl) {
      sm.setVideoElement('tutor', videoEl);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    }
    if (stream) {
      sm.setStream('tutor', stream);
    }

    sm.onFrame(() => setFrameCount((c) => c + 1));
    sm.onAudioChunk(() => setAudioChunkCount((c) => c + 1));
    sm.start();

    streamManagerRef.current = sm;
    adapterRef.current = adapter;
  }, []);

  const loadVideoFile = useCallback(async (file: File) => {
    cleanup();
    setError(null);
    setStatus('Loading video file...');

    try {
      const adapter = new FileInputAdapter(file);
      await adapter.initialize();
      setSource('file');
      setStatus(`Playing: ${file.name}`);
      startStreamManager(adapter);
    } catch (err) {
      setError(`Failed to load file: ${(err as Error).message}`);
      setStatus('Error');
    }
  }, [cleanup, startStreamManager]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadVideoFile(file);
  }, [loadVideoFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      loadVideoFile(file);
    } else if (file) {
      setError('Please drop a video file (.mp4, .webm, etc.)');
    }
  }, [loadVideoFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleLiveCamera = useCallback(async () => {
    cleanup();
    setError(null);
    setStatus('Requesting camera access...');

    try {
      const adapter = new LiveInputAdapter();
      await adapter.initialize();
      setSource('live');
      setStatus('Live camera active');
      startStreamManager(adapter);
    } catch (err) {
      setError(`Camera error: ${(err as Error).message}`);
      setStatus('Error');
    }
  }, [cleanup, startStreamManager]);

  const handleStop = useCallback(() => {
    cleanup();
    setSource('none');
    setStatus('Idle');
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Dev Panel</h2>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          ...styles.dropZone,
          ...(dragging ? styles.dropZoneActive : {}),
        }}
      >
        <p style={styles.dropText}>
          {dragging ? 'Drop video here...' : 'Drag & drop a video file here'}
        </p>
        <p style={styles.dropSubtext}>or use the file picker / camera buttons below</p>
      </div>

      <div style={styles.controls}>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
        />

        <button
          onClick={handleLiveCamera}
          style={styles.button}
          disabled={source === 'live'}
        >
          Use Live Camera
        </button>

        <button
          onClick={handleStop}
          style={{ ...styles.button, background: '#dc3545' }}
          disabled={source === 'none'}
        >
          Stop
        </button>
      </div>

      <div style={styles.status}>
        <span>Status: <strong>{status}</strong></span>
        {error && <span style={styles.error}>{error}</span>}
      </div>

      <div style={styles.metrics}>
        <div style={styles.metric}>
          <span style={styles.metricValue}>{frameCount}</span>
          <span style={styles.metricLabel}>Video Frames</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.metricValue}>{audioChunkCount}</span>
          <span style={styles.metricLabel}>Audio Chunks</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.metricValue}>{source}</span>
          <span style={styles.metricLabel}>Source</span>
        </div>
      </div>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={styles.video}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '1.5rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '800px',
    margin: '0 auto',
  },
  title: {
    margin: '0 0 1rem',
    fontSize: '1.5rem',
  },
  dropZone: {
    border: '2px dashed #adb5bd',
    borderRadius: '8px',
    padding: '2rem',
    textAlign: 'center',
    marginBottom: '1rem',
    transition: 'all 0.2s',
    background: '#f8f9fa',
  },
  dropZoneActive: {
    borderColor: '#0d6efd',
    background: '#e7f1ff',
  },
  dropText: {
    margin: '0 0 0.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#495057',
  },
  dropSubtext: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#6c757d',
  },
  controls: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  button: {
    padding: '0.5rem 1rem',
    background: '#198754',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  status: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  error: {
    color: '#dc3545',
    fontWeight: 500,
  },
  metrics: {
    display: 'flex',
    gap: '2rem',
    marginBottom: '1rem',
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0.75rem 1.5rem',
    background: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
  },
  metricValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  metricLabel: {
    fontSize: '0.75rem',
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  video: {
    width: '100%',
    maxHeight: '400px',
    background: '#000',
    borderRadius: '8px',
  },
};
