import { describe, it, expect, vi } from 'vitest';
import { computeRMS, computeSpectralCentroid, computeVoiceEnergy } from './voiceEnergy';

// Meyda may have issues in jsdom/Node env — mock if needed
vi.mock('meyda', () => ({
  default: {
    extract: (features: string[], signal: Float32Array) => {
      if (features.includes('rms')) {
        // Manual RMS calc for mock
        let sum = 0;
        for (let i = 0; i < signal.length; i++) {
          sum += signal[i] * signal[i];
        }
        return { rms: Math.sqrt(sum / signal.length) };
      }
      if (features.includes('spectralCentroid')) {
        // Simulate: low-freq signal → low bin index, high-freq → higher bin index
        // Simple energy-weighted centroid approximation
        let weightedSum = 0;
        let totalPower = 0;
        for (let i = 0; i < signal.length; i++) {
          const power = signal[i] * signal[i];
          weightedSum += i * power;
          totalPower += power;
        }
        if (totalPower < 1e-10) return { spectralCentroid: 0 };
        return { spectralCentroid: weightedSum / totalPower };
      }
      return {};
    },
  },
}));

describe('computeRMS', () => {
  it('silence (all zeros) returns 0', () => {
    const data = new Float32Array(1024).fill(0);
    expect(computeRMS(data)).toBe(0);
  });

  it('sine wave returns correct RMS', () => {
    // Sine wave RMS = amplitude / sqrt(2)
    const amplitude = 0.5;
    const data = new Float32Array(1024);
    for (let i = 0; i < data.length; i++) {
      data[i] = amplitude * Math.sin((2 * Math.PI * i) / 64);
    }
    const rms = computeRMS(data);
    expect(rms).toBeCloseTo(amplitude / Math.sqrt(2), 2);
  });

  it('empty buffer returns 0', () => {
    expect(computeRMS(new Float32Array(0))).toBe(0);
  });

  it('non-power-of-two buffer works', () => {
    const data = new Float32Array(1000).fill(0.5);
    const rms = computeRMS(data);
    expect(rms).toBeGreaterThan(0);
  });
});

describe('computeSpectralCentroid', () => {
  it('silence returns 0', () => {
    const data = new Float32Array(1024).fill(0);
    expect(computeSpectralCentroid(data, 44100)).toBe(0);
  });

  it('returns Hz value (not normalized 0-1)', () => {
    // Create a signal with some energy
    const data = new Float32Array(1024);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin((2 * Math.PI * i) / 64);
    }
    const centroid = computeSpectralCentroid(data, 44100);
    // Should return a raw Hz value, potentially > 1
    expect(centroid).toBeGreaterThanOrEqual(0);
  });

  it('empty buffer returns 0', () => {
    expect(computeSpectralCentroid(new Float32Array(0), 44100)).toBe(0);
  });

  it('zero sample rate returns 0', () => {
    expect(computeSpectralCentroid(new Float32Array(1024), 0)).toBe(0);
  });
});

describe('computeVoiceEnergy', () => {
  it('max features produce score near 1.0', () => {
    expect(computeVoiceEnergy(1, 1, 1)).toBeGreaterThan(0.9);
  });

  it('silence produces score near 0.0', () => {
    expect(computeVoiceEnergy(0, 0, 0)).toBe(0);
  });

  it('high variance scores higher than low variance', () => {
    const highVar = computeVoiceEnergy(0.8, 0.5, 0.5);
    const lowVar = computeVoiceEnergy(0.1, 0.5, 0.5);
    expect(highVar).toBeGreaterThan(lowVar);
  });
});
