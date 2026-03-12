import React, { useRef, useEffect } from 'react';
import FaceMeshCanvas from './FaceMeshCanvas';

interface VideoPreviewProps {
  stream: MediaStream | null;
  label: string;
  showMesh?: boolean;
  mirrored?: boolean;
}

export default function VideoPreview({ stream, label, showMesh, mirrored }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

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
    borderRadius: '8px',
    background: '#000',
    display: 'block',
  },
  label: {
    position: 'absolute',
    top: 8,
    left: 8,
    padding: '2px 8px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 600,
  },
};
