import { describe, it, expect } from 'vitest';
import { PitchTracker } from './pitchTracker';

function makeSineWave(frequencyHz: number, sampleRate: number, durationSamples: number): Float32Array {
  const data = new Float32Array(durationSamples);
  for (let i = 0; i < durationSamples; i++) {
    data[i] = Math.sin(2 * Math.PI * frequencyHz * i / sampleRate);
  }
  return data;
}

describe('PitchTracker', () => {
  it('detects a 440Hz sine wave', () => {
    const tracker = new PitchTracker({ sampleRate: 44100 });
    const signal = makeSineWave(440, 44100, 2048);

    const result = tracker.update(signal);
    expect(result.pitch).not.toBeNull();
    expect(result.pitch!).toBeCloseTo(440, -1); // within ~10 Hz
  });

  it('detects a 220Hz sine wave', () => {
    const tracker = new PitchTracker({ sampleRate: 44100 });
    const signal = makeSineWave(220, 44100, 2048);

    const result = tracker.update(signal);
    expect(result.pitch).not.toBeNull();
    expect(result.pitch!).toBeCloseTo(220, -1);
  });

  it('returns null for silence', () => {
    const tracker = new PitchTracker({ sampleRate: 44100 });
    const silence = new Float32Array(2048).fill(0);

    const result = tracker.update(silence);
    expect(result.pitch).toBeNull();
  });

  it('rejects pitches outside valid range', () => {
    const tracker = new PitchTracker({
      sampleRate: 44100,
      minPitchHz: 80,
      maxPitchHz: 500,
    });
    // 20 Hz is below minPitchHz — too low for a 2048-sample buffer to resolve well anyway
    const signal = makeSineWave(20, 44100, 2048);

    const result = tracker.update(signal);
    expect(result.pitch).toBeNull();
  });

  it('variance is 0 with constant pitch', () => {
    const tracker = new PitchTracker({ sampleRate: 44100 });
    const signal = makeSineWave(300, 44100, 2048);

    // Feed same pitch multiple times
    for (let i = 0; i < 10; i++) {
      tracker.update(signal);
    }
    const result = tracker.update(signal);
    expect(result.pitchVariance).toBeCloseTo(0, 1);
  });

  it('variance increases with varied pitches', () => {
    const tracker = new PitchTracker({ sampleRate: 44100 });

    // Alternate between different pitches
    const pitches = [150, 300, 150, 300, 150, 300, 150, 300, 150, 300];
    let lastResult = tracker.update(makeSineWave(200, 44100, 2048));

    for (const p of pitches) {
      lastResult = tracker.update(makeSineWave(p, 44100, 2048));
    }

    expect(lastResult.pitchVariance).toBeGreaterThan(0.2);
  });

  it('reset clears history', () => {
    const tracker = new PitchTracker({ sampleRate: 44100 });
    const signal = makeSineWave(300, 44100, 2048);

    tracker.update(signal);
    tracker.update(signal);
    tracker.reset();

    const result = tracker.update(signal);
    // After reset, only 1 sample — variance is 0
    expect(result.pitchVariance).toBe(0);
  });
});
