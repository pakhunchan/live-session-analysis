import React, { useRef, useEffect } from 'react';

interface VideoPreviewProps {
  stream: MediaStream | null;
  label: string;
}

export default function VideoPreview({ stream, label }: VideoPreviewProps) {
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
        style={styles.video}
      />
      <div style={styles.label}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    flex: 1,
  },
  video: {
    width: '100%',
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
