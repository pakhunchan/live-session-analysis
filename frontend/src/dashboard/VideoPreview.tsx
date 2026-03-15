import React, { useRef, useEffect } from 'react';
import FaceMeshCanvas from './FaceMeshCanvas';

interface VideoPreviewProps {
  stream: MediaStream | null;
  label: string;
  showMesh?: boolean;
  mirrored?: boolean;
  onVideoElement?: (el: HTMLVideoElement | null) => void;
}

export default function VideoPreview({ stream, label, showMesh, mirrored, onVideoElement }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      onVideoElement?.(videoRef.current);
    } else {
      onVideoElement?.(null);
    }
  }, [stream, onVideoElement]);

  return (
    <div style={styles.container}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ ...styles.video, ...(mirrored ? { transform: 'scaleX(-1)' } : {}) }}
      />
      {showMesh && <FaceMeshCanvas videoRef={videoRef} mirrored={mirrored} />}
      {label && <div style={styles.label}>{label}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    flex: 1,
    height: '100%',
    minHeight: 0,
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    borderRadius: 16,
    background: '#000',
    display: 'block',
  },
  label: {
    position: 'absolute',
    top: 10,
    left: 10,
    padding: '4px 10px',
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#fff',
    borderRadius: 8,
    fontSize: '0.72rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
    border: '1px solid rgba(255,255,255,0.08)',
  },
};
