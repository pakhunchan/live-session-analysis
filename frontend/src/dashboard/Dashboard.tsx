import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMetricsEngine } from './hooks/useMetricsEngine';
import { useStudentPipeline } from './hooks/useStudentPipeline';
import VideoPreview from './VideoPreview';
import SvgDonut from './SvgDonut';
import SessionSetup from './SessionSetup';
import Sidebar from './Sidebar';
import BottomControls from './BottomControls';
import PostSessionSummary from './PostSessionSummary';
import { LiveKitSessionOrchestrator } from '../core/LiveKitSessionOrchestrator';
import { MediaPipeFaceDetector } from '../video/FaceDetector';
import { fetchRecommendations, generateFallbackRecommendations } from '../core/openaiRecommendations';
import { engagementScore } from '../core/engagement';
import { colors, font, glassmorphism, layout, radius } from './designTokens';
import type { LiveKitSetupConfig, InputSourceType, SessionSummary } from '../types/session';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function Dashboard() {
  const tutor = useMetricsEngine();
  const student = useStudentPipeline();
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [primaryView, setPrimaryView] = useState<'student' | 'tutor'>('student');
  const videoStageRef = useRef<HTMLDivElement>(null);
  const [myRole, setMyRole] = useState<'tutor' | 'student'>('tutor');
  const [muted, setMuted] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);

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

  // Role-aware accessors
  const isRunning = myRole === 'tutor' ? tutor.isRunning : student.isRunning;
  const snapshot = tutor.snapshot;
  const history = tutor.history;
  const streamManager = myRole === 'tutor' ? tutor.streamManager : student.streamManager;

  const handleTutorVideoElement = useCallback((el: HTMLVideoElement | null) => {
    if (el && myRole === 'tutor') streamManager.setVideoElement('tutor', el);
  }, [streamManager, myRole]);

  const handleStudentVideoElement = useCallback((el: HTMLVideoElement | null) => {
    if (el && myRole === 'student') streamManager.setVideoElement('student', el);
  }, [streamManager, myRole]);

  const handleJoinRoom = useCallback(async (config: LiveKitSetupConfig) => {
    try {
      setError(null);
      setSetupLoading(true);
      setMyRole(config.role);
      setRoomName(config.roomName);
      setInputSource(config.inputSource);
      setStatus('Fetching token...');

      if (!LIVEKIT_URL) {
        throw new Error('VITE_LIVEKIT_URL is not configured');
      }

      let earlyStream: MediaStream | undefined;
      if (config.inputSource === 'webcam') {
        earlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      }

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

      const sm = config.role === 'tutor' ? tutor.streamManager : student.streamManager;
      const { localStream, onRemoteReady } = await orchestrator.initialize(
        { ...config, url: LIVEKIT_URL, token, earlyStream },
        sm,
      );

      if (config.role === 'tutor') {
        setTutorStream(localStream);
      } else {
        setStudentStream(localStream);
      }

      const detector = new MediaPipeFaceDetector();
      setStatus('Loading MediaPipe model...');
      await detector.initialize();

      if (config.role === 'tutor') {
        await tutor.start(detector, config.roomName);
      } else {
        await student.start(detector, config.roomName);
      }
      setStatus('Waiting for other participant...');

      onRemoteReady.then(async (remoteStream) => {
        if (config.role === 'tutor') {
          setStudentStream(remoteStream);
        } else {
          setTutorStream(remoteStream);
        }
        setStatus('Running');
      });
    } catch (err) {
      setError((err as Error).message);
      setStatus('Error');
    } finally {
      setSetupLoading(false);
    }
  }, [tutor, student]);

  const handleStop = useCallback(() => {
    if (myRole === 'tutor') {
      tutor.stop();

      setSessionSummary({
        sessionId: '',
        durationMs: 0,
        avgMetrics: { tutor: {}, student: {} },
        totalInterruptions: 0,
        talkTimeRatio: { tutor: 0.5, student: 0.5 },
        engagementScore: 0,
        keyMoments: [],
        nudgesTriggered: [],
        recommendations: [],
      });

      if (roomName) {
        fetchRecommendations(roomName)
          .then(({ recommendations, summary }) => {
            setSessionSummary({
              ...summary,
              nudgesTriggered: tutor.nudges,
              recommendations,
            });
          })
          .catch(() => {
            const fallback = generateFallbackRecommendations({
              sessionId: '',
              durationMs: 0,
              avgMetrics: { tutor: {}, student: {} },
              totalInterruptions: 0,
              talkTimeRatio: { tutor: 0.5, student: 0.5 },
              engagementScore: 0,
              keyMoments: [],
              nudgesTriggered: tutor.nudges,
            });
            setSessionSummary(prev => prev ? { ...prev, recommendations: fallback } : null);
          });
      }
    } else {
      student.stop();
      setSessionSummary({} as SessionSummary);
    }

    orchestratorRef.current?.dispose();
    orchestratorRef.current = null;
    setTutorStream(null);
    setStudentStream(null);
    setStatus('Stopped');
  }, [myRole, tutor, student, roomName]);

  const isTutorWebcam = myRole === 'tutor' && inputSource === 'webcam';
  const showSetup = !isRunning && !sessionSummary;

  // Overlay gauge values
  const studentMetrics = snapshot?.student ?? null;
  const studentEng = studentMetrics ? engagementScore(studentMetrics) : null;
  const studentTalk = studentMetrics?.talkTimePercent ?? null;
  const faceDetected = studentMetrics?.faceDetected ?? false;

  const elapsed = snapshot?.session?.sessionElapsedMs ?? 0;

  if (showSetup) {
    return (
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        {error && (
          <div style={{ ...styles.errorBanner, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#842029', fontSize: '1rem' }}
            >
              &times;
            </button>
          </div>
        )}
        <SessionSetup onStart={handleJoinRoom} isLoading={setupLoading} />
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      {/* Pulsing dot keyframes */}
      <style>{`@keyframes pulse-live{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* ===== TOP BAR ===== */}
      <header style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <span style={styles.logo}>LSA</span>
          <div style={styles.sessionInfo}>
            <span style={styles.sessionLabel}>
              {roomName ?? 'Session'}
            </span>
            <span style={styles.elapsedBadge}>
              <span style={styles.liveDot} />
              {formatDuration(elapsed)}
            </span>
          </div>
        </div>
        <div style={styles.topbarRight}>
          <span style={styles.statusText}>{status}</span>
        </div>
      </header>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {!isRunning && sessionSummary && myRole === 'tutor' && (
        <PostSessionSummary
          summary={sessionSummary}
          history={history}
          onNewSession={() => {
            setSessionSummary(null);
            tutor.resetHistory();
          }}
        />
      )}

      {!isRunning && sessionSummary && myRole === 'student' && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <h2>Session Ended</h2>
          <p style={{ color: colors.textSecondary }}>The tutor has ended the session. Thank you!</p>
          <button
            onClick={() => { setSessionSummary(null); tutor.resetHistory(); }}
            style={styles.newSessionBtn}
          >
            New Session
          </button>
        </div>
      )}

      {isRunning && (
        <div style={styles.mainLayout}>
          {/* Video area */}
          <div style={styles.videoArea}>
            <div
              ref={videoStageRef}
              style={{
                ...styles.videoStage,
                ...(isFullscreen ? { borderRadius: 0, width: '100%', height: '100%' } : {}),
              }}
            >
              {/* Waiting overlay */}
              {status === 'Waiting for other participant...' && (
                <div style={styles.waitingOverlay}>
                  <p style={styles.waitingText}>Waiting for participant...</p>
                  <p style={styles.waitingHint}>Share the room name with them</p>
                </div>
              )}

              {/* Main video */}
              <VideoPreview
                stream={primaryView === 'student' ? studentStream : tutorStream}
                label=""
                showMesh={showMesh}
                mirrored={primaryView === 'tutor' && isTutorWebcam && mirrorTutor}
                onVideoElement={primaryView === 'student' ? handleStudentVideoElement : handleTutorVideoElement}
              />

              {/* Overlay gauges — top-left */}
              {myRole === 'tutor' && primaryView === 'student' && (
                <div style={styles.overlayGauges}>
                  <SvgDonut value={studentEng} size={40} strokeWidth={4} label="Engage" dark />
                  <SvgDonut value={studentTalk} size={40} strokeWidth={4} label="Talk" dark />
                  {/* Face indicator */}
                  <div style={{
                    ...styles.faceIndicator,
                    borderColor: faceDetected ? colors.green : colors.red,
                  }}>
                    <div style={{
                      ...styles.faceIndicatorDot,
                      background: faceDetected ? colors.green : colors.red,
                    }} />
                    <span style={styles.faceIndicatorText}>
                      {faceDetected ? 'Face' : 'No Face'}
                    </span>
                  </div>
                </div>
              )}

              {/* Student name badge — bottom-left */}
              {primaryView === 'student' && (
                <div style={styles.nameBadge}>Student</div>
              )}

              {/* PiP self-view — bottom-right */}
              <div style={styles.pipOverlay}>
                <VideoPreview
                  stream={primaryView === 'student' ? tutorStream : studentStream}
                  label={primaryView === 'student' ? 'You' : 'Student'}
                  showMesh={showMesh}
                  mirrored={primaryView === 'student' && isTutorWebcam && mirrorTutor}
                  onVideoElement={primaryView === 'student' ? handleTutorVideoElement : handleStudentVideoElement}
                />
                <button onClick={swapPrimaryView} style={styles.pipSwapBtn} title="Swap to main view">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              </div>

              {/* Fullscreen button — top-right */}
              <div style={styles.topRightControls}>
                {isTutorWebcam && (
                  <button
                    onClick={() => setMirrorTutor(m => !m)}
                    style={styles.topRightBtn}
                    title={mirrorTutor ? 'Unmirror' : 'Mirror'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={mirrorTutor ? colors.blue : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 8 22 8 22 8" /><polyline points="18 5 22 8 18 11" /><line x1="2" y1="8" x2="22" y2="8" />
                      <polyline points="6 19 2 16 6 13" /><line x1="2" y1="16" x2="22" y2="16" />
                    </svg>
                  </button>
                )}
                <button onClick={toggleFullscreen} style={styles.topRightBtn} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 3 3 3 3 9" />
                    <polyline points="15 21 21 21 21 15" />
                    <polyline points="9 21 3 21 3 15" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          {myRole === 'tutor' && (
            <Sidebar
              snapshot={snapshot}
              history={history}
              latencyBreakdown={tutor.latencyBreakdown}
              eventBus={tutor.eventBus}
            />
          )}
        </div>
      )}

      {/* ===== BOTTOM CONTROLS ===== */}
      {isRunning && (
        <BottomControls
          muted={muted}
          showMesh={showMesh}
          onToggleMute={toggleMute}
          onToggleMesh={() => setShowMesh(m => !m)}
          onEndSession={handleStop}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    fontFamily: font,
    background: `linear-gradient(175deg, ${colors.bgStart} 0%, ${colors.bgEnd} 100%)`,
    color: colors.textPrimary,
  },

  // ── Top Bar ──
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: layout.topbarH,
    padding: '0 20px',
    ...glassmorphism(0.72),
    borderBottom: `1px solid ${colors.borderLight}`,
    flexShrink: 0,
    zIndex: 100,
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: colors.blue,
    letterSpacing: '-0.02em',
  },
  sessionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  sessionLabel: {
    fontSize: '0.82rem',
    fontWeight: 500,
    color: colors.textSecondary,
  },
  elapsedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px',
    background: colors.surfaceHover,
    borderRadius: 8,
    fontSize: '0.78rem',
    fontWeight: 600,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: colors.green,
    animation: 'pulse-live 2s ease-in-out infinite',
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: '0.78rem',
    color: colors.textTertiary,
  },

  // ── Errors ──
  errorBanner: {
    padding: '0.75rem 1rem',
    background: '#f8d7da',
    color: '#842029',
    borderRadius: 6,
    margin: '8px 20px 0',
    fontSize: '0.85rem',
  },

  // ── Main Layout ──
  mainLayout: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    gap: 0,
  },
  videoArea: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 12,
  },
  videoStage: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    background: '#0a0a0a',
    flex: 1,
    minHeight: 0,
  },

  // ── Waiting ──
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

  // ── Overlay Gauges ──
  overlayGauges: {
    position: 'absolute',
    top: 14,
    left: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    zIndex: 3,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: radius.sm,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '8px 12px',
  },
  faceIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(16px)',
    borderRadius: radius.sm,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '5px 10px',
  },
  faceIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  faceIndicatorText: {
    fontSize: '0.65rem',
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 500,
  },

  // ── Name Badge ──
  nameBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    padding: '6px 14px',
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    color: '#fff',
    borderRadius: 10,
    fontSize: '0.82rem',
    fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.1)',
    zIndex: 3,
  },

  // ── PiP ──
  pipOverlay: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 180,
    aspectRatio: '4 / 3',
    borderRadius: radius.sm,
    overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    border: '2px solid rgba(255,255,255,0.15)',
    zIndex: 2,
  },
  pipSwapBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    borderRadius: 6,
    padding: '4px 5px',
    cursor: 'pointer',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Top-right video controls ──
  topRightControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    display: 'flex',
    gap: 6,
    zIndex: 3,
  },
  topRightBtn: {
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    width: 36,
    height: 36,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Post-session ──
  newSessionBtn: {
    padding: '0.6rem 1.5rem',
    background: colors.coral,
    color: '#fff',
    border: 'none',
    borderRadius: radius.xs,
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    marginTop: '1rem',
  },
};
