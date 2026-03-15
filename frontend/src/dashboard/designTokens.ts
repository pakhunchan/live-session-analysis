// Design tokens for attempt-14 dashboard redesign

// ── Colors ──
export const colors = {
  bgStart: '#eef1f7',
  bgEnd: '#f8f9fc',
  surface: '#ffffff',
  surfaceHover: '#f6f8fb',
  border: '#e4e8ef',
  borderLight: '#eef1f6',

  textPrimary: '#1c1f26',
  textSecondary: '#5c6478',
  textTertiary: '#94a0b8',

  blue: '#5b8af5',
  blueSoft: '#dce6fd',
  blueBg: '#f0f4fe',
  mint: '#4ecda0',
  mintSoft: '#d4f3e6',
  mintBg: '#eefbf4',
  lavender: '#9b8afb',
  lavenderSoft: '#e6e0fd',
  lavenderBg: '#f3f0fe',
  coral: '#f57b7b',
  coralSoft: '#fde0e0',
  amber: '#f0a553',
  amberSoft: '#fdecd4',

  green: '#4ecda0',
  yellow: '#f0c653',
  red: '#f57b7b',
} as const;

// ── Radii ──
export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

// ── Shadows ──
export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)',
  md: '0 4px 12px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.03)',
  lg: '0 8px 24px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.04)',
  donut: '0 2px 12px rgba(0,0,0,0.06)',
} as const;

// ── Layout ──
export const layout = {
  sidebarW: 380,
  topbarH: 48,
  controlsH: 64,
} as const;

// ── Font ──
export const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
export const mono = "'SF Mono', 'Cascadia Code', 'Fira Code', monospace";

// ── Helpers ──

/** Returns green/yellow/red based on 0-1 metric value */
export function metricColor(v: number | null): string {
  if (v === null) return colors.textTertiary;
  if (v >= 0.6) return colors.green;
  if (v >= 0.3) return colors.yellow;
  return colors.red;
}

/** Glassmorphism style mixin */
export function glassmorphism(opacity = 0.72): React.CSSProperties {
  return {
    background: `rgba(255,255,255,${opacity})`,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };
}

/** Card style mixin */
export const card: React.CSSProperties = {
  background: colors.surface,
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  boxShadow: shadows.sm,
  padding: '16px',
};

import type React from 'react';
