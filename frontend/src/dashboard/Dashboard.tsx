import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMetricsEngine } from './hooks/useMetricsEngine';
import VideoPreview from './VideoPreview';
import PersistentMetrics from './PersistentMetrics';
import StudentOverlays from './StudentOverlays';
import SessionSetup from './SessionSetup';
import Sidebar from './Sidebar';
import NudgeChips from './NudgeChips';
import PostSessionSummary from './PostSessionSummary';
import { LiveKitSessionOrchestrator } from '../core/LiveKitSessionOrchestrator';
import { MediaPipeFaceDetector } from '../video/FaceDetector';
import { generateSessionSummary } from '../core/generateSessionSummary';
import { fetchRecommendations, generateFallbackRecommendations } from '../core/openaiRecommendations';
import type { LiveKitSetupConfig, InputSourceType, SessionSummary } from '../types/session';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export default function Dashboard() {
  const { snapshot, history, nudges, isRunning, start, stop, resetHistory, startVadForStream, eventBus, streamManager } = useMetricsEngine();
  const [status, setStatus] = useState('Ready');
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tutorStream, setTutorStream] = useState<MediaStream | null>(null);
  const [studentStream, setStudentStream] = useState<MediaStream | null>(null);
  const [showMesh, setShowMesh] = useState(false);
  const [inputSource, setInputSource] = useState<InputSourceType>('webcam');
  const [mirrorTutor, setMirrorTutor] = useState(true);
  const orchestratorRef = useRef<LiveKitSessionOrchestrator | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [primaryView, setPrimaryView] = useState<'student' | 'tutor'>('student');
  const videoStageRef = useRef<HTMLDivElement>(null);
  const [myRole, setMyRole] = useState<'tutor' | 'student'>('tutor');

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!videoStageRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoStageRef.current.requestFullscreen();
    }
  }, []);

  const swapPrimaryView = useCallback(() => {
    setPrimaryView(prev => prev === 'student' ? 'tutor' : 'student');
  }, []);

  const handleJoinRoom = useCallback(async (config: LiveKitSetupConfig) => {
    try {
      setError(null);
      setSetupLoading(true);
      setMyRole(config.role);
      setInputSource(config.inputSource);
      setStatus('Fetching token...');

      if (!LIVEKIT_URL) {
        throw new Error('VITE_LIVEKIT_URL is not configured');
      }

      // Request camera/mic permission immediately in the user gesture context
      // (Safari blocks getUserMedia if called after an async gap like fetch)
      let earlyStream: MediaStream | undefined;
      if (config.inputSource === 'webcam') {
        earlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      }

      // Fetch token from backend
      const baseUrl = API_BASE || '';
      const participantId = `${config.role}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch(`${baseUrl}/api/livekit-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: config.roomName,
          participantName: participantId,
          role: config.role,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Token request failed' }));
        throw new Error(body.error || `Token request failed (${res.status})`);
      }

      const { token } = await res.json();

      setStatus('Connecting to room...');

      const orchestrator = new LiveKitSessionOrchestrator();
      orchestratorRef.current = orchestrator;

      const { localStream, onRemoteReady } = await orchestrator.initialize(
        { ...config, url: LIVEKIT_URL, token, earlyStream },
        streamManager,
      );

      // Set local stream immediately
      if (config.role === 'tutor') {
        setTutorStream(localStream);
      } else {
        setStudentStream(localStream);
      }

      // Initialize ML detector and start pipeline
      const detector = new MediaPipeFaceDetector();
      setStatus('Loading MediaPipe model...');
      await detector.initialize();

      await start(detector);
      setStatus('Waiting for other participant...');

      // When remote participant joins, update state
      onRemoteReady.then(async () => {
        const otherRole = config.role === 'tutor' ? 'student' : 'tutor';
        const remoteStream = streamManager.getStream(otherRole);

        if (config.role === 'tutor') {
          setStudentStream(remoteStream);
        } else {
          setTutorStream(remoteStream);
        }

        // Start VAD for the remote stream
        if (remoteStream) {
          await startVadForStream(otherRole, remoteStream);
        }

        setStatus('Running');
      });
    } catch (err) {
      setError((err as Error).message);
      setStatus('Error');
    } finally {
      setSetupLoading(false);
    }
  }, [start, startVadForStream, streamManager]);

  const handleStop = useCallback(() => {
    stop();

    // Generate summary from history before clearing streams
    const partial = generateSessionSummary(history, nudges);
    const summary: SessionSummary = { ...partial, recommendations: [] };
    setSessionSummary(summary);

    // Fetch recommendations via server proxy (non-blocking)
    fetchRecommendations(partial)
      .then(recs => setSessionSummary(prev => prev ? { ...prev, recommendations: recs } : null))
      .catch(() => {
        const fallback = generateFallbackRecommendations(partial);
        setSessionSummary(prev => prev ? { ...prev, recommendations: fallback } : null);
      });

    orchestratorRef.current?.dispose();
    orchestratorRef.current = null;
    setTutorStream(null);
    setStudentStream(null);
    setStatus('Stopped');
  }, [stop, history, nudges]);

  const isTutorWebcam = myRole === 'tutor' && inputSource === 'webcam';

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

      {!isRunning && !sessionSummary && (
        <SessionSetup onStart={handleJoinRoom} isLoading={setupLoading} />
      )}

      {!isRunning && sessionSummary && myRole === 'tutor' && (
        <PostSessionSummary
          summary={sessionSummary}
          history={history}
          onNewSession={() => {
            setSessionSummary(null);
            resetHistory();
          }}
        />
      )}

      {!isRunning && sessionSummary && myRole === 'student' && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <h2>Session Ended</h2>
          <p style={{ color: '#6c757d' }}>The tutor has ended the session. Thank you!</p>
          <button
            onClick={() => { setSessionSummary(null); resetHistory(); }}
            style={styles.stopBtn}
          >
            New Session
          </button>
        </div>
      )}

      {isRunning && (
        <div style={styles.sessionLayout}>
          <div style={styles.mainArea}>
            <div
              ref={videoStageRef}
              style={{
                ...styles.videoStage,
                ...(isFullscreen ? { borderRadius: 0, width: '100%', height: '100%' } : {}),
              }}
            >
              {myRole === 'tutor' && <NudgeChips bus={eventBus} />}

              {/* Waiting overlay */}
              {status === 'Waiting for other participant...' && (
                <div style={styles.waitingOverlay}>
                  <p style={styles.waitingText}>Waiting for other participant to join...</p>
                  <p style={styles.waitingHint}>Share the room name with them</p>
                </div>
              )}

              {/* Main (big) video */}
              <VideoPreview
                stream={primaryView === 'student' ? studentStream : tutorStream}
                label=""
                showMesh={showMesh}
                mirrored={primaryView === 'tutor' && isTutorWebcam && mirrorTutor}
              />
              {myRole === 'tutor' && primaryView === 'student' && <StudentOverlays metrics={snapshot?.student ?? null} />}
              {myRole === 'tutor' && <PersistentMetrics student={snapshot?.student ?? null} />}
              {/* Mini overlay */}
              <div style={styles.miniOverlay}>
                <VideoPreview
                  stream={primaryView === 'student' ? tutorStream : studentStream}
                  label={primaryView === 'student' ? 'You' : 'Student'}
                  showMesh={showMesh}
                  mirrored={primaryView === 'student' && isTutorWebcam && mirrorTutor}
                />
                {myRole === 'tutor' && primaryView === 'tutor' && <StudentOverlays metrics={snapshot?.student ?? null} />}
                {isTutorWebcam && primaryView === 'student' && (
                  <button
                    onClick={() => setMirrorTutor(m => !m)}
                    style={{ ...styles.miniFullscreenBtn, right: 28 }}
                    title={mirrorTutor ? 'Unmirror' : 'Mirror'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={mirrorTutor ? '#60a5fa' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
                      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
                      <line x1="12" y1="1" x2="12" y2="23" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={swapPrimaryView}
                  style={styles.miniFullscreenBtn}
                  title="Swap to main view"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </button>
              </div>
              <div style={styles.bottomLeftControls}>
                <label style={styles.controlToggle}>
                  <input
                    type="checkbox"
                    checked={showMesh}
                    onChange={(e) => setShowMesh(e.target.checked)}
                  />
                  {' '}Show Mesh
                </label>
              </div>
              {isTutorWebcam && primaryView === 'tutor' && (
                <button
                  onClick={() => setMirrorTutor(m => !m)}
                  style={{ ...styles.fullscreenBtn, right: 56 }}
                  title={mirrorTutor ? 'Unmirror' : 'Mirror'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={mirrorTutor ? '#60a5fa' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
                    <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
                    <line x1="12" y1="1" x2="12" y2="23" />
                  </svg>
                </button>
              )}
              <button onClick={toggleFullscreen} style={styles.fullscreenBtn} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullscreen ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
            </div>

            <button onClick={handleStop} style={styles.stopBtn}>
              Stop Session
            </button>
          </div>

          {myRole === 'tutor' && (
            <Sidebar
              snapshot={snapshot}
              history={history}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
            />
          )}
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
  waitingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
    zIndex: 5,
    pointerEvents: 'none',
  },
  waitingText: {
    color: '#fff',
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: 0,
  },
  waitingHint: {
    color: '#adb5bd',
    fontSize: '0.85rem',
    margin: '0.5rem 0 0',
  },
  miniOverlay: {
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
  bottomLeftControls: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    display: 'flex',
    gap: '6px',
    zIndex: 2,
  },
  controlToggle: {
    fontSize: '0.75rem',
    color: '#fff',
    cursor: 'pointer',
    background: 'rgba(0,0,0,0.5)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  fullscreenBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 12px',
    cursor: 'pointer',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniFullscreenBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    borderRadius: '4px',
    padding: '3px 4px',
    cursor: 'pointer',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
