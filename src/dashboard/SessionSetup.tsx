import React, { useState, useCallback, useRef } from 'react';
import type { SessionSetupConfig, InputSourceType } from '../types/session';

interface SessionSetupProps {
  onStart: (config: SessionSetupConfig) => void;
  isLoading: boolean;
}

export default function SessionSetup({ onStart, isLoading }: SessionSetupProps) {
  const [tutorSource, setTutorSource] = useState<InputSourceType>('file');
  const [studentSource, setStudentSource] = useState<InputSourceType>('webcam');
  const [tutorFile, setTutorFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [playAudio, setPlayAudio] = useState(true);
  const [dragging, setDragging] = useState<'tutor' | 'student' | null>(null);
  const tutorFileRef = useRef<HTMLInputElement>(null);
  const studentFileRef = useRef<HTMLInputElement>(null);

  const handleStart = useCallback(() => {
    const config: SessionSetupConfig = {
      tutor: {
        source: tutorSource,
        ...(tutorSource === 'file' ? { file: tutorFile!, playAudio } : {}),
      },
      student: {
        source: studentSource,
        ...(studentSource === 'file' ? { file: studentFile! } : {}),
      },
    };
    onStart(config);
  }, [tutorSource, studentSource, tutorFile, studentFile, playAudio, onStart]);

  const canStart =
    !isLoading &&
    (tutorSource === 'webcam' || tutorFile !== null) &&
    (studentSource === 'webcam' || studentFile !== null);

  const handleDrop = useCallback((role: 'tutor' | 'student', e: React.DragEvent) => {
    e.preventDefault();
    setDragging(null);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      if (role === 'tutor') {
        setTutorFile(file);
        setTutorSource('file');
      } else {
        setStudentFile(file);
        setStudentSource('file');
      }
    }
  }, []);

  const renderSourceColumn = (
    role: 'tutor' | 'student',
    label: string,
    source: InputSourceType,
    setSource: (s: InputSourceType) => void,
    file: File | null,
    setFile: (f: File | null) => void,
    fileRef: React.RefObject<HTMLInputElement>,
  ) => (
    <div style={styles.column}>
      <h3 style={styles.columnTitle}>{label} Source</h3>
      <label style={styles.radioLabel}>
        <input
          type="radio"
          name={`${role}-source`}
          checked={source === 'file'}
          onChange={() => setSource('file')}
          disabled={isLoading}
        />
        <span style={styles.radioText}>Video File</span>
      </label>
      <label style={styles.radioLabel}>
        <input
          type="radio"
          name={`${role}-source`}
          checked={source === 'webcam'}
          onChange={() => setSource('webcam')}
          disabled={isLoading}
        />
        <span style={styles.radioText}>Webcam</span>
      </label>

      {source === 'file' && (
        <div
          onDrop={(e) => handleDrop(role, e)}
          onDragOver={(e) => { e.preventDefault(); setDragging(role); }}
          onDragLeave={() => setDragging(null)}
          style={{
            ...styles.dropArea,
            ...(dragging === role ? styles.dropAreaActive : {}),
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

      {source === 'webcam' && (
        <div style={styles.webcamReady}>
          Camera will activate on start
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Session Setup</h2>
      <div style={styles.columns}>
        {renderSourceColumn('tutor', 'Tutor', tutorSource, setTutorSource, tutorFile, setTutorFile, tutorFileRef)}
        {renderSourceColumn('student', 'Student', studentSource, setStudentSource, studentFile, setStudentFile, studentFileRef)}
      </div>

      {(tutorSource === 'file' || studentSource === 'file') && (
        <label style={styles.audioToggle}>
          <input
            type="checkbox"
            checked={playAudio}
            onChange={(e) => setPlayAudio(e.target.checked)}
            disabled={isLoading}
          />
          <span style={styles.audioToggleText}>
            Play file audio through speakers (headphones recommended)
          </span>
        </label>
      )}

      <button
        onClick={handleStart}
        disabled={!canStart}
        style={{
          ...styles.startBtn,
          ...(!canStart ? styles.startBtnDisabled : {}),
        }}
      >
        {isLoading ? 'Starting...' : 'Start Session'}
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
  },
  heading: {
    margin: '0 0 1.5rem',
    fontSize: '1.2rem',
    fontWeight: 600,
    textAlign: 'center',
  },
  columns: {
    display: 'flex',
    gap: '2rem',
  },
  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  columnTitle: {
    margin: '0 0 0.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#495057',
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
  audioToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '1.5rem',
    cursor: 'pointer',
  },
  audioToggleText: {
    fontSize: '0.85rem',
    color: '#495057',
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
