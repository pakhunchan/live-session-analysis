import React from 'react';
import { metricColor, shadows } from './designTokens';

interface SvgDonutProps {
  /** 0-1 value */
  value: number | null;
  /** Size in px (width & height of the SVG) */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Label below percentage (e.g. "Engage") */
  label?: string;
  /** Override color (otherwise auto green/yellow/red) */
  color?: string;
  /** Dark variant for video overlays */
  dark?: boolean;
}

export default function SvgDonut({
  value,
  size = 80,
  strokeWidth = 5,
  label,
  color,
  dark = false,
}: SvgDonutProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = value !== null ? Math.round(value * 100) : null;
  const offset = pct !== null ? circumference * (1 - value!) : circumference;
  const strokeColor = color ?? metricColor(value);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}>
      <svg
        width={size}
        height={size}
        style={{ filter: dark ? 'none' : `drop-shadow(${shadows.donut})` }}
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={dark ? 'rgba(255,255,255,0.1)' : '#eef1f6'}
          strokeWidth={strokeWidth}
        />
        {/* Value ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease' }}
        />
        {/* Percentage text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={dark ? '#fff' : '#1c1f26'}
          fontSize={size * 0.22}
          fontWeight={700}
          fontFamily="Inter, sans-serif"
        >
          {pct !== null ? `${pct}%` : '–'}
        </text>
      </svg>
      {label && (
        <span style={{
          fontSize: dark ? '0.58rem' : '0.7rem',
          color: dark ? 'rgba(255,255,255,0.6)' : '#5c6478',
          fontWeight: 500,
          letterSpacing: '0.02em',
          textTransform: 'uppercase' as const,
        }}>
          {label}
        </span>
      )}
    </div>
  );
}
