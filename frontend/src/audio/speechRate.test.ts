import { describe, it, expect } from 'vitest';
import { estimateSpeechRate, countAmplitudePeaks } from './speechRate';

describe('countAmplitudePeaks', () => {
  it('peak count correct for known pattern', () => {
    // Pattern with clear peaks at indices 2, 6, 10
    const history = [0.01, 0.02, 0.1, 0.02, 0.01, 0.02, 0.1, 0.02, 0.01, 0.02, 0.1, 0.02, 0.01];
    const peaks = countAmplitudePeaks(history, 2);
    expect(peaks).toBe(3);
  });

  it('min peak distance is respected', () => {
    // Peaks very close together
    const history = [0.01, 0.1, 0.05, 0.1, 0.05, 0.1, 0.01];
    const peaksClose = countAmplitudePeaks(history, 1);
    const peaksFar = countAmplitudePeaks(history, 3);
    expect(peaksClose).toBeGreaterThanOrEqual(peaksFar);
  });
});

describe('estimateSpeechRate', () => {
  it('silence returns 0', () => {
    const history = new Array(20).fill(0);
    expect(estimateSpeechRate(history, 20)).toBe(0);
  });

  it('constant amplitude returns 0 (no peaks)', () => {
    const history = new Array(20).fill(0.1);
    expect(estimateSpeechRate(history, 20)).toBe(0);
  });

  it('4 Hz syllable rate returns moderate score', () => {
    // Simulate ~4 syllables per second at 20 Hz sample rate
    const history: number[] = [];
    for (let i = 0; i < 40; i++) { // 2 seconds
      // Peak every 5 samples = 4 Hz
      history.push(i % 5 === 0 ? 0.2 : 0.01);
    }
    const rate = estimateSpeechRate(history, 20);
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.8);
  });

  it('7 Hz rate returns high score', () => {
    const history: number[] = [];
    for (let i = 0; i < 60; i++) { // 3 seconds at 20 Hz
      // Peak every ~3 samples ≈ 7 Hz
      history.push(i % 3 === 0 ? 0.3 : 0.01);
    }
    const rate = estimateSpeechRate(history, 20);
    expect(rate).toBeGreaterThan(0.4);
  });
});
