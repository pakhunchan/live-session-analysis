import React, { useState, useCallback } from 'react';
import type { LiveKitSetupConfig } from '../types/session';
import type { ParticipantRole } from '../types/metrics';

interface SessionSetupProps {
  onStart: (config: LiveKitSetupConfig) => void;
  isLoading: boolean;
}

function generateRoomCode(): string {
  const adjectives = ['swift','calm','bright','bold','crisp','keen','neat','pure','warm','cool',
    'fresh','clear','prime','sharp','vivid','agile','lucid','rapid','quiet','steady'];
  const nouns = ['oak','elm','fox','owl','bay','sun','sky','gem','arc','wave',
    'reef','peak','glen','vale','cove','mesa','iris','fern','lynx','hawk'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}

export default function SessionSetup({ onStart, isLoading }: SessionSetupProps) {
  const [role, setRole] = useState<ParticipantRole | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('biology-101');
  const [submitHover, setSubmitHover] = useState(false);
  const [submitActive, setSubmitActive] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [roomFocused, setRoomFocused] = useState(false);
  const [genHover, setGenHover] = useState(false);
  const [tutorHover, setTutorHover] = useState(false);
  const [studentHover, setStudentHover] = useState(false);

  const canStart = !isLoading && role !== null && displayName.trim().length > 0 && roomName.trim().length > 0;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!canStart || !role) return;
    onStart({
      role,
      inputSource: 'webcam',
      roomName,
      displayName: displayName.trim(),
    });
  }, [role, displayName, roomName, canStart, onStart]);

  const handleGenerateRoom = () => {
    setRoomName(generateRoomCode());
  };

  return (
    <div style={s.splitLayout}>
      {/* ===== Left Decorative Panel ===== */}
      <div style={s.leftPanel}>
        <div style={{ ...s.decoRing, width: 200, height: 200, top: 60, right: 40 }} />
        <div style={{ ...s.decoRing, width: 140, height: 140, bottom: 100, left: 20 }} />
        <div style={{ ...s.decoRing, width: 80, height: 80, top: '40%', right: '15%', borderColor: 'rgba(255,255,255,0.08)' }} />

        <div style={s.leftContent}>
          <div style={s.brand}>
            <div style={s.brandIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <span style={s.brandName}>Live Session Analysis</span>
          </div>

          <h1 style={s.leftHeading}>
            Real-time insights<br/>
            for <span style={{ color: '#99f6e4' }}>better tutoring</span>
          </h1>
          <p style={s.leftTagline}>
            AI-powered analytics that help tutors understand engagement,
            adapt their teaching, and improve student outcomes in real time.
          </p>

          <div style={s.features}>
            <div style={s.feature}>
              <div style={s.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/>
                  <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </div>
              <div>
                <h4 style={s.featureTitle}>Engagement Tracking</h4>
                <p style={s.featureDesc}>Face detection monitors student attention and emotional cues</p>
              </div>
            </div>

            <div style={s.feature}>
              <div style={s.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <div>
                <h4 style={s.featureTitle}>Speech Analysis</h4>
                <p style={s.featureDesc}>Interruption detection and talk-time balance metrics</p>
              </div>
            </div>

            <div style={s.feature}>
              <div style={s.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </div>
              <div>
                <h4 style={s.featureTitle}>Live Dashboard</h4>
                <p style={s.featureDesc}>Real-time metrics and actionable coaching nudges</p>
              </div>
            </div>

            <div style={s.feature}>
              <div style={s.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <h4 style={s.featureTitle}>Privacy First</h4>
                <p style={s.featureDesc}>On-device processing with no video recording or storage</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Right Form Panel ===== */}
      <div style={s.rightPanel}>
        <div style={s.formWrapper}>
          <div style={s.formHeader}>
            <h2 style={s.formTitle}>Join a Session</h2>
            <p style={s.formSubtitle}>Select your role and enter your details to get started.</p>
          </div>

          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Role Selection */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>I am a</label>
              <div style={s.roleCards}>
                <button
                  type="button"
                  onClick={() => setRole('tutor')}
                  onMouseEnter={() => setTutorHover(true)}
                  onMouseLeave={() => setTutorHover(false)}
                  disabled={isLoading}
                  style={{
                    ...s.roleCard,
                    ...(tutorHover || role === 'tutor' ? s.roleCardLifted : {}),
                  }}
                >
                  {/* Accent line */}
                  <div style={{
                    ...s.roleCardAccent,
                    ...(role === 'tutor' ? s.roleCardAccentVisible : {}),
                  }} />
                  {/* Check badge */}
                  <div style={{
                    ...s.roleCheck,
                    ...(role === 'tutor' ? s.roleCheckVisible : {}),
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div style={{
                    ...s.roleCardIcon,
                    ...(role === 'tutor' ? { background: teal[50] } : {}),
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={role === 'tutor' ? teal[600] : gray[500]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                      <path d="M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                  </div>
                  <div style={s.roleCardTitle}>Tutor</div>
                  <div style={{
                    ...s.roleCardDesc,
                    ...(role === 'tutor' ? { color: teal[600] } : {}),
                  }}>View live analytics</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('student')}
                  onMouseEnter={() => setStudentHover(true)}
                  onMouseLeave={() => setStudentHover(false)}
                  disabled={isLoading}
                  style={{
                    ...s.roleCard,
                    ...(studentHover || role === 'student' ? s.roleCardLifted : {}),
                  }}
                >
                  {/* Accent line */}
                  <div style={{
                    ...s.roleCardAccent,
                    ...(role === 'student' ? s.roleCardAccentVisible : {}),
                  }} />
                  {/* Check badge */}
                  <div style={{
                    ...s.roleCheck,
                    ...(role === 'student' ? s.roleCheckVisible : {}),
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div style={{
                    ...s.roleCardIcon,
                    ...(role === 'student' ? { background: teal[50] } : {}),
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={role === 'student' ? teal[600] : gray[500]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div style={s.roleCardTitle}>Student</div>
                  <div style={{
                    ...s.roleCardDesc,
                    ...(role === 'student' ? { color: teal[600] } : {}),
                  }}>Join and learn</div>
                </button>
              </div>
            </div>

            {/* Display Name */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel} htmlFor="nameInput">Display Name</label>
              <div style={{
                ...s.inputCard,
                ...(nameFocused ? s.inputCardFocused : {}),
              }}>
                <div style={{
                  ...s.inputCardAccent,
                  ...(nameFocused ? s.inputCardAccentVisible : {}),
                }} />
                <input
                  type="text"
                  id="nameInput"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  placeholder="Enter your name"
                  maxLength={40}
                  disabled={isLoading}
                  style={s.cardInput}
                />
              </div>
            </div>

            {/* Room Code */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel} htmlFor="roomInput">Room Code</label>
              <div style={s.inputWithBtn}>
                <div style={{
                  ...s.inputCard,
                  ...(roomFocused ? s.inputCardFocused : {}),
                  flex: 1,
                }}>
                  <div style={{
                    ...s.inputCardAccent,
                    ...(roomFocused ? s.inputCardAccentVisible : {}),
                  }} />
                  <input
                    type="text"
                    id="roomInput"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onFocus={() => setRoomFocused(true)}
                    onBlur={() => setRoomFocused(false)}
                    placeholder="e.g. biology-101"
                    maxLength={30}
                    disabled={isLoading}
                    style={s.cardInput}
                  />
                </div>
                <div style={{
                  ...s.generateCard,
                  ...(genHover ? s.generateCardHover : {}),
                }}>
                  <div style={{
                    ...s.inputCardAccent,
                    ...(genHover ? s.inputCardAccentVisible : {}),
                  }} />
                  <button
                    type="button"
                    onClick={handleGenerateRoom}
                    onMouseEnter={() => setGenHover(true)}
                    onMouseLeave={() => setGenHover(false)}
                    style={{
                      ...s.generateBtn,
                      ...(genHover ? { color: teal[600] } : {}),
                    }}
                    disabled={isLoading}
                    title="Generate random room code"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6"/>
                      <path d="M2.5 22v-6h6"/>
                      <path d="M2.5 16A10 10 0 0118.36 4.64L21.5 8"/>
                      <path d="M21.5 8A10 10 0 015.64 19.36L2.5 16"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canStart}
              onMouseEnter={() => setSubmitHover(true)}
              onMouseLeave={() => { setSubmitHover(false); setSubmitActive(false); }}
              onMouseDown={() => setSubmitActive(true)}
              onMouseUp={() => setSubmitActive(false)}
              style={{
                ...s.submitBtn,
                ...(!canStart ? s.submitBtnDisabled : {}),
                ...(submitHover && canStart && !submitActive ? s.submitBtnHover : {}),
                ...(submitActive && canStart ? s.submitBtnActive : {}),
              }}
            >
              {/* Accent line */}
              <div style={{
                ...s.submitAccent,
                ...(submitHover && canStart ? s.submitAccentVisible : {}),
              }} />
              {isLoading ? 'Joining...' : 'Join Session'}
              {!isLoading && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              )}
            </button>
          </form>

          <div style={s.formFooter}>
            Session data is processed locally and never stored.<br/>
            <a href="#" style={s.footerLink}>Learn more about privacy</a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Palette tokens ─── */
const teal = {
  50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
  400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
  800: '#115e59', 900: '#134e4a',
};
const gray = {
  50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
  400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
  800: '#1f2937', 900: '#111827',
};

const transition = '0.25s cubic-bezier(0.4, 0, 0.2, 1)';

const s: Record<string, React.CSSProperties> = {
  /* ── Split layout ── */
  splitLayout: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif",
    WebkitFontSmoothing: 'antialiased',
  },

  /* ── Left panel ── */
  leftPanel: {
    flex: 1,
    background: `linear-gradient(160deg, ${teal[800]} 0%, ${teal[700]} 40%, ${teal[600]} 100%)`,
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '64px 56px',
    position: 'relative',
    overflow: 'hidden',
  },
  decoRing: {
    position: 'absolute',
    border: '2px solid rgba(255,255,255,0.06)',
    borderRadius: '50%',
    pointerEvents: 'none',
  },
  leftContent: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 440,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 40,
  },
  brandIcon: {
    width: 44,
    height: 44,
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(8px)',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brandName: {
    fontSize: '1.1rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  leftHeading: {
    fontSize: '2.4rem',
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: '-0.03em',
    margin: '0 0 16px',
  },
  leftTagline: {
    fontSize: '1.05rem',
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.72)',
    maxWidth: 380,
    margin: '0 0 48px',
  },

  /* ── Feature bullets ── */
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  feature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  featureTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.95)',
    margin: '0 0 3px',
  },
  featureDesc: {
    fontSize: '0.82rem',
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.55)',
    margin: 0,
  },

  /* ── Right panel ── */
  rightPanel: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 40px',
    background: gray[50],
    position: 'relative',
  },
  formWrapper: {
    width: '100%',
    maxWidth: 420,
  },
  formHeader: {
    marginBottom: 36,
  },
  formTitle: {
    fontSize: '1.55rem',
    fontWeight: 700,
    color: gray[900],
    letterSpacing: '-0.02em',
    margin: '0 0 6px',
  },
  formSubtitle: {
    fontSize: '0.9rem',
    color: gray[500],
    lineHeight: 1.5,
    margin: 0,
  },

  /* ── Field groups ── */
  fieldGroup: {
    marginBottom: 28,
  },
  fieldLabel: {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: gray[700],
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },

  /* ── Role cards — elevated lift ── */
  roleCards: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  roleCard: {
    position: 'relative',
    padding: '20px 16px',
    border: 'none',
    borderRadius: 12,
    background: '#fff',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    textAlign: 'center',
    userSelect: 'none',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
    transform: 'translateY(0)',
  },
  roleCardLifted: {
    boxShadow: '0 4px 12px rgba(0,0,0,0.07), 0 8px 24px rgba(0,0,0,0.05)',
    transform: 'translateY(-3px)',
  },
  roleCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    background: teal[500],
    transform: 'scaleX(0)',
    transformOrigin: 'center',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    borderRadius: '12px 12px 0 0',
    zIndex: 1,
  },
  roleCardAccentVisible: {
    transform: 'scaleX(1)',
  },
  roleCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: teal[500],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    color: '#fff',
    transform: 'scale(0)',
    opacity: 0,
  },
  roleCheckVisible: {
    transform: 'scale(1)',
    opacity: 1,
  },
  roleCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    margin: '0 auto 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: gray[100],
    transition,
  },
  roleCardTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: gray[800],
    marginBottom: 2,
  },
  roleCardDesc: {
    fontSize: '0.76rem',
    color: gray[400],
    transition,
  },

  /* ── Elevated card inputs ── */
  inputCard: {
    position: 'relative',
    background: '#fff',
    borderRadius: 12,
    padding: 4,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'translateY(0)',
    overflow: 'hidden',
  },
  inputCardFocused: {
    boxShadow: '0 4px 12px rgba(0,0,0,0.07), 0 8px 24px rgba(0,0,0,0.05)',
    transform: 'translateY(-3px)',
  },
  inputCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    background: teal[500],
    transform: 'scaleX(0)',
    transformOrigin: 'center',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    borderRadius: '12px 12px 0 0',
    zIndex: 1,
  },
  inputCardAccentVisible: {
    transform: 'scaleX(1)',
  },
  cardInput: {
    width: '100%',
    padding: '13px 14px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    fontSize: '0.92rem',
    color: gray[900],
    outline: 'none',
    fontFamily: 'inherit',
    transition,
    boxSizing: 'border-box',
  },
  inputWithBtn: {
    display: 'flex',
    gap: 10,
    alignItems: 'stretch',
  },
  generateCard: {
    position: 'relative',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'translateY(0)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  generateCardHover: {
    boxShadow: '0 4px 12px rgba(0,0,0,0.07), 0 8px 24px rgba(0,0,0,0.05)',
    transform: 'translateY(-3px)',
  },
  generateBtn: {
    width: 48,
    height: '100%',
    minHeight: 48,
    border: 'none',
    borderRadius: 10,
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition,
    color: gray[400],
  },

  /* ── Submit button — elevated card style ── */
  submitBtn: {
    width: '100%',
    padding: '17px 24px',
    border: 'none',
    borderRadius: 12,
    background: '#52e4cf',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'inherit',
    letterSpacing: '-0.01em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
    transform: 'translateY(0)',
  },
  submitBtnHover: {
    boxShadow: '0 4px 12px rgba(0,0,0,0.07), 0 8px 24px rgba(0,0,0,0.05)',
    transform: 'translateY(-3px)',
  },
  submitBtnActive: {
    background: teal[700],
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
    transform: 'translateY(0)',
    transition: 'all 0.1s ease',
  },
  submitAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    background: teal[500],
    transform: 'scaleX(0)',
    transformOrigin: 'center',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    borderRadius: '12px 12px 0 0',
    zIndex: 1,
  },
  submitAccentVisible: {
    transform: 'scaleX(1)',
  },
  submitBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
    transform: 'translateY(0)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
  },

  /* ── Footer ── */
  formFooter: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: '0.78rem',
    color: gray[400],
    lineHeight: 1.5,
  },
  footerLink: {
    color: teal[600],
    textDecoration: 'none',
    fontWeight: 500,
  },
};
