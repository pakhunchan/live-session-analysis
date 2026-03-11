import React, { useState, useRef } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'above' | 'below';
  align?: 'center' | 'right';
}

export default function Tooltip({ text, children, position = 'above', align = 'center' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    clearTimeout(timeoutRef.current);
    setVisible(true);
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100);
  };

  return (
    <div
      style={styles.wrapper}
      onMouseEnter={show}
      onMouseLeave={hide}
      onTouchStart={show}
      onTouchEnd={hide}
    >
      {children}
      {visible && (
        <div style={{
          ...(position === 'below' ? styles.tooltipBelow : styles.tooltipAbove),
          ...(align === 'right' ? { left: 'auto', right: 0, transform: 'none', whiteSpace: 'normal', width: 200 } : {}),
        }}>
          {position === 'below' && <div style={{
            ...styles.arrowUp,
            ...(align === 'right' ? { left: 'auto', right: 12, transform: 'none' } : {}),
          }} />}
          {text}
          {position === 'above' && <div style={{
            ...styles.arrowDown,
            ...(align === 'right' ? { left: 'auto', right: 12, transform: 'none' } : {}),
          }} />}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
    cursor: 'default',
  },
  tooltipBase: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 10px',
    background: '#212529',
    color: '#fff',
    fontSize: '0.7rem',
    lineHeight: 1.4,
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    zIndex: 20,
    pointerEvents: 'none',
  } as React.CSSProperties,
  tooltipAbove: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: '100%',
    marginBottom: 8,
    padding: '6px 10px',
    background: '#212529',
    color: '#fff',
    fontSize: '0.7rem',
    lineHeight: 1.4,
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    zIndex: 20,
    pointerEvents: 'none',
  },
  tooltipBelow: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    top: '100%',
    marginTop: 8,
    padding: '6px 10px',
    background: '#212529',
    color: '#fff',
    fontSize: '0.7rem',
    lineHeight: 1.4,
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    zIndex: 20,
    pointerEvents: 'none',
  },
  arrowDown: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderTop: '5px solid #212529',
  },
  arrowUp: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderBottom: '5px solid #212529',
  },
};
