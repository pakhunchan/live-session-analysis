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
  const [muted, setMuted] = useState(false);

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

  const toggleMute = useCallback(() => {
    const stream = myRole === 'tutor' ? tutorStream : studentStream;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  }, [muted, myRole, tutorStream, studentStream]);

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
                      <polyline points="18 8 22 8 22 8" /><polyline points="18 5 22 8 18 11" /><line x1="2" y1="8" x2="22" y2="8" />
                      <polyline points="6 19 2 16 6 13" /><line x1="2" y1="16" x2="22" y2="16" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={swapPrimaryView}
                  style={styles.miniFullscreenBtn}
                  title="Swap to main view"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h-6v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
              <div style={styles.topRightControls}>
                {isTutorWebcam && primaryView === 'tutor' && (
                  <button
                    onClick={() => setMirrorTutor(m => !m)}
                    style={styles.topRightBtn}
                    title={mirrorTutor ? 'Unmirror' : 'Mirror'}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={mirrorTutor ? '#60a5fa' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 8 22 8 22 8" /><polyline points="18 5 22 8 18 11" /><line x1="2" y1="8" x2="22" y2="8" />
                      <polyline points="6 19 2 16 6 13" /><line x1="2" y1="16" x2="22" y2="16" />
                    </svg>
                  </button>
                )}
                <button onClick={toggleFullscreen} style={styles.topRightBtn} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 3 3 3 3 9" />
                    <polyline points="15 21 21 21 21 15" />
                    <polyline points="9 21 3 21 3 15" />
                  </svg>
                </button>
              </div>
            </div>

            <div style={styles.belowVideoControls}>
              <label style={styles.meshToggle}>
                <input
                  type="checkbox"
                  checked={showMesh}
                  onChange={(e) => setShowMesh(e.target.checked)}
                />
                {' '}Show Face Mesh
              </label>
              <div style={styles.centerControls}>
                <button onClick={toggleMute} style={styles.muteBtn} title={muted ? 'Unmute' : 'Mute'}>
                  {muted ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc3545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  )}
                  <span style={{ color: muted ? '#dc3545' : '#fff', fontSize: '0.85rem', fontWeight: 500 }}>
                    {muted ? 'Unmute' : 'Mute'}
                  </span>
                </button>
                <button onClick={handleStop} style={styles.stopBtn}>
                  End Session
                </button>
              </div>
            </div>
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
    height: 'calc(100vh - 6rem)',
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
    flex: 1,
    minHeight: 0,
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
    aspectRatio: '4 / 3',
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
  topRightControls: {
    position: 'absolute',
    top: 8,
    right: 8,
    display: 'flex',
    gap: 6,
    zIndex: 3,
  },
  topRightBtn: {
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    borderRadius: '6px',
    width: 40,
    height: 40,
    cursor: 'pointer',
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
  belowVideoControls: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 0',
    flexShrink: 0,
  },
  meshToggle: {
    fontSize: '0.8rem',
    color: '#6c757d',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  centerControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    flex: 1,
  },
  muteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0.6rem 1.2rem',
    background: '#343a40',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  stopBtn: {
    padding: '0.6rem 1.5rem',
    background: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
};
