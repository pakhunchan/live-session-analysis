import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip);

interface MetricGaugeProps {
  label: string;
  value: number | null;  // 0-1, null when unavailable
  size?: number;
}

function getColor(value: number): string {
  if (value >= 0.6) return '#198754';  // green
  if (value >= 0.4) return '#ffc107';  // yellow
  return '#dc3545';                     // red
}

export default function MetricGauge({ label, value, size = 120 }: MetricGaugeProps) {
  const v = value ?? 0;
  const color = value === null ? '#adb5bd' : getColor(v);
  const pct = value === null ? '–' : `${Math.round(v * 100)}`;

  const data = {
    datasets: [{
      data: [v, 1 - v],
      backgroundColor: [color, '#e9ecef'],
      borderWidth: 0,
      circumference: 180,
      rotation: 270,
    }],
  };

  const options = {
    responsive: false,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      tooltip: { enabled: false },
    },
  } as const;

  return (
    <div style={{ textAlign: 'center', width: size }}>
      <div style={{ position: 'relative', height: size / 2 + 10 }}>
        <Doughnut data={data} options={options} width={size} height={size / 2 + 10} />
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          fontSize: size / 5,
          fontWeight: 700,
          color,
        }}>
          {value === null ? '–' : `${pct}%`}
        </div>
      </div>
      <div style={{
        fontSize: '0.7rem',
        color: '#6c757d',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginTop: 4,
      }}>
        {label}
      </div>
    </div>
  );
}
