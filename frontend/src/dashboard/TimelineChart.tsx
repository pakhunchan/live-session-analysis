import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { engagementScore } from '../core/engagement';
import { colors } from './designTokens';
import type { MetricSnapshot } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface TimelineChartProps {
  history: MetricSnapshot[];
  height?: number;
}

/** Exponential moving average — smooths binary gate flicker. */
function ema(values: number[], alpha = 0.15): number[] {
  if (values.length === 0) return [];
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(alpha * values[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

const WINDOW_SEC = 60;

export default function TimelineChart({ history, height = 100 }: TimelineChartProps) {
  const latestTs = history.length > 0 ? history[history.length - 1].timestamp : 0;
  const cutoff = latestTs - WINDOW_SEC * 1000;
  const window = history.filter((s) => s.timestamp >= cutoff);

  const labels = window.map((snap) => {
    const secAgo = Math.round((snap.timestamp - latestTs) / 1000);
    return secAgo < 0 ? `${secAgo}s` : 'now';
  });

  const tutorEng = ema(window.map((s) => engagementScore(s.tutor) ?? 0));
  const studentEng = ema(window.map((s) => engagementScore(s.student) ?? 0));

  const data = {
    labels,
    datasets: [
      {
        label: 'Student',
        data: studentEng,
        borderColor: colors.blue,
        backgroundColor: 'rgba(91, 138, 245, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Tutor',
        data: tutorEng,
        borderColor: colors.mint,
        backgroundColor: 'rgba(78, 205, 160, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: {
      y: {
        min: 0,
        max: 1,
        ticks: {
          callback: (v: any) => `${Math.round(v * 100)}%`,
          font: { size: 10, family: 'Inter' },
          color: colors.textTertiary,
        },
        grid: { color: colors.borderLight },
        border: { display: false },
      },
      x: {
        ticks: {
          maxTicksLimit: 8,
          font: { size: 10, family: 'Inter' },
          color: colors.textTertiary,
        },
        grid: { display: false },
        border: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index' as const, intersect: false },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
