import { describe, it, expect } from 'vitest';
import { computeRMS, computeSpectralCentroid, computeVoiceEnergy } from './voiceEnergy';

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
});

describe('computeSpectralCentroid', () => {
  it('low frequency dominant returns low centroid', () => {
    // Simulate low-frequency dominant spectrum
    const data = new Float32Array(512);
    for (let i = 0; i < data.length; i++) {
      data[i] = i < 50 ? -10 : -80; // strong low bins, weak high bins
    }
    const centroid = computeSpectralCentroid(data, 44100);
    expect(centroid).toBeLessThan(0.3);
  });
});

describe('computeVoiceEnergy', () => {
  it('max features produce score near 1.0', () => {
    expect(computeVoiceEnergy(1, 1, 1, 1)).toBeGreaterThan(0.9);
  });

  it('silence produces score near 0.0', () => {
    expect(computeVoiceEnergy(0, 0, 0, 0)).toBe(0);
  });

  it('high variance scores higher than low variance', () => {
    const highVar = computeVoiceEnergy(0.5, 0.8, 0.5, 0.5);
    const lowVar = computeVoiceEnergy(0.5, 0.1, 0.5, 0.5);
    expect(highVar).toBeGreaterThan(lowVar);
  });
});
