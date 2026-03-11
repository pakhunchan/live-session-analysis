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
import type { MetricSnapshot } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface TimelineChartProps {
  history: MetricSnapshot[];
  height?: number;
}

export default function TimelineChart({ history, height = 200 }: TimelineChartProps) {
  // Use absolute timestamps so existing points keep stable x-positions across updates
  const latestTs = history.length > 0 ? history[history.length - 1].timestamp : 0;
  const labels = history.map((snap) => {
    const secAgo = Math.round((snap.timestamp - latestTs) / 1000);
    return secAgo < 0 ? `${secAgo}s` : 'now';
  });

  const data = {
    labels,
    datasets: [
      {
        label: 'Tutor Eye Contact',
        data: history.map((s) => s.tutor.eyeContactScore),
        borderColor: '#0d6efd',
        backgroundColor: 'rgba(13, 110, 253, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Student Eye Contact',
        data: history.map((s) => s.student.eyeContactScore),
        borderColor: '#6610f2',
        backgroundColor: 'rgba(102, 16, 242, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Tutor Energy',
        data: history.map((s) => s.tutor.energyScore),
        borderColor: '#198754',
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [4, 2],
      },
      {
        label: 'Student Energy',
        data: history.map((s) => s.student.energyScore),
        borderColor: '#fd7e14',
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [4, 2],
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
