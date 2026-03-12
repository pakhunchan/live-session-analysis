import React, { useState, useCallback, useRef } from 'react';
import type { LiveKitSetupConfig, InputSourceType } from '../types/session';
import type { ParticipantRole } from '../types/metrics';

interface SessionSetupProps {
  onStart: (config: LiveKitSetupConfig) => void;
  isLoading: boolean;
}

function generateRoomName(): string {
  const adjectives = ['bright', 'calm', 'eager', 'gentle', 'keen', 'lively', 'quick', 'sharp', 'warm', 'bold'];
  const nouns = ['oak', 'pine', 'lake', 'mesa', 'reef', 'dune', 'peak', 'vale', 'cove', 'glen'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}-${noun}-${num}`;
}

export default function SessionSetup({ onStart, isLoading }: SessionSetupProps) {
  const [role, setRole] = useState<ParticipantRole>('tutor');
  const [inputSource, setInputSource] = useState<InputSourceType>('webcam');
  const [file, setFile] = useState<File | null>(null);
  const [roomName, setRoomName] = useState(generateRoomName);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleStart = useCallback(() => {
    const config: LiveKitSetupConfig = {
      role,
      inputSource,
      roomName,
      ...(inputSource === 'file' ? { file: file! } : {}),
    };
    onStart(config);
  }, [role, inputSource, file, roomName, onStart]);

  const canStart =
    !isLoading &&
    roomName.trim().length > 0 &&
    (inputSource === 'webcam' || file !== null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) {
      setFile(f);
      setInputSource('file');
    }
  }, []);

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Join Session</h2>

      {/* Role selector */}
      <div style={styles.section}>
        <label style={styles.sectionLabel}>I am the...</label>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="role"
              checked={role === 'tutor'}
              onChange={() => setRole('tutor')}
              disabled={isLoading}
            />
            <span style={styles.radioText}>Tutor</span>
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="role"
              checked={role === 'student'}
              onChange={() => setRole('student')}
              disabled={isLoading}
            />
            <span style={styles.radioText}>Student</span>
          </label>
        </div>
      </div>

      {/* Room name */}
      <div style={styles.section}>
        <label style={styles.sectionLabel}>Room Name</label>
        <div style={styles.roomRow}>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            style={styles.roomInput}
            disabled={isLoading}
            placeholder="Enter room name"
          />
          <button
            onClick={() => setRoomName(generateRoomName())}
            style={styles.randomBtn}
            disabled={isLoading}
          >
            Random
          </button>
        </div>
      </div>

      {/* Input source */}
      <div style={styles.section}>
        <label style={styles.sectionLabel}>Video Source</label>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="input-source"
              checked={inputSource === 'webcam'}
              onChange={() => setInputSource('webcam')}
              disabled={isLoading}
            />
            <span style={styles.radioText}>Webcam</span>
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="input-source"
              checked={inputSource === 'file'}
              onChange={() => setInputSource('file')}
              disabled={isLoading}
            />
            <span style={styles.radioText}>Video File</span>
          </label>
        </div>

        {inputSource === 'file' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            style={{
              ...styles.dropArea,
              ...(dragging ? styles.dropAreaActive : {}),
            }}
          >
            {file ? (
              <p style={styles.fileName}>{file.name}</p>
            ) : (
              <p style={styles.dropHint}>Drop video here</p>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              style={styles.browseBtn}
              disabled={isLoading}
            >
              Browse
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
          </div>
        )}

        {inputSource === 'webcam' && (
          <div style={styles.webcamReady}>
            Camera will activate on join
          </div>
        )}
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart}
        style={{
          ...styles.startBtn,
          ...(!canStart ? styles.startBtnDisabled : {}),
        }}
      >
        {isLoading ? 'Joining...' : 'Join Room'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: '1px solid #dee2e6',
    borderRadius: '12px',
    padding: '2rem',
    background: '#f8f9fa',
    maxWidth: 480,
    margin: '0 auto',
  },
  heading: {
    margin: '0 0 1.5rem',
    fontSize: '1.2rem',
    fontWeight: 600,
    textAlign: 'center',
  },
  section: {
    marginBottom: '1.25rem',
  },
  sectionLabel: {
    display: 'block',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#495057',
    marginBottom: '0.5rem',
  },
  radioGroup: {
    display: 'flex',
    gap: '1.5rem',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  radioText: {
    color: '#212529',
  },
  roomRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  roomInput: {
    flex: 1,
    padding: '0.5rem 0.75rem',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    fontSize: '0.9rem',
  },
  randomBtn: {
    padding: '0.5rem 1rem',
    background: '#e9ecef',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
  },
  dropArea: {
    marginTop: '0.5rem',
    border: '2px dashed #adb5bd',
    borderRadius: '8px',
    padding: '1.25rem',
    textAlign: 'center',
    background: '#fff',
    transition: 'all 0.2s',
  },
  dropAreaActive: {
    borderColor: '#0d6efd',
    background: '#e7f1ff',
  },
  fileName: {
    margin: '0 0 0.5rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#198754',
    wordBreak: 'break-all',
  },
  dropHint: {
    margin: '0 0 0.5rem',
    fontSize: '0.85rem',
    color: '#6c757d',
  },
  browseBtn: {
    padding: '0.3rem 1rem',
    background: '#e9ecef',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  webcamReady: {
    marginTop: '0.5rem',
    padding: '1.25rem',
    borderRadius: '8px',
    background: '#d1e7dd',
    color: '#0f5132',
    textAlign: 'center',
    fontSize: '0.85rem',
  },
  startBtn: {
    display: 'block',
    width: '100%',
    marginTop: '1.5rem',
    padding: '0.75rem',
    background: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
  },
  startBtnDisabled: {
    background: '#6c757d',
    cursor: 'not-allowed',
  },
};
