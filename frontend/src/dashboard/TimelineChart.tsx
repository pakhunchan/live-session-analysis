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

export default function TimelineChart({ history, height = 200 }: TimelineChartProps) {
  // Only show the last 60 seconds of data
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
        label: 'Tutor Engagement',
        data: tutorEng,
        borderColor: '#0d6efd',
        backgroundColor: 'rgba(13, 110, 253, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Student Engagement',
        data: studentEng,
        borderColor: '#6610f2',
        backgroundColor: 'rgba(102, 16, 242, 0.1)',
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
        ticks: { callback: (v: any) => `${Math.round(v * 100)}%` },
      },
      x: {
        ticks: { maxTicksLimit: 10, font: { size: 10 } },
      },
    },
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { mode: 'index' as const, intersect: false },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
