import { YIN } from 'pitchfinder';

export interface PitchTrackerConfig {
  historySize: number;  // rolling window for variance calc
  minPitchHz: number;   // reject detected pitches below this
  maxPitchHz: number;   // reject detected pitches above this
  sampleRate: number;
  silenceRmsThreshold: number;  // skip YIN when signal is below this RMS
  holdFrames: number;           // hold last valid pitch for this many frames
}

const DEFAULT_CONFIG: PitchTrackerConfig = {
  historySize: 100,  // ~5s at 20Hz
  minPitchHz: 50,
  maxPitchHz: 600,
  sampleRate: 44100,
  silenceRmsThreshold: 0.01,
  holdFrames: 10,  // ~0.5s at 20Hz
};

export interface PitchResult {
  pitch: number | null;       // Hz, or null if unvoiced
  pitchVariance: number;      // 0-1, coefficient of variation (std/mean)
}

export class PitchTracker {
  private config: PitchTrackerConfig;
  private detect: (buf: Float32Array) => number | null;
  private history: number[] = [];
  private lastValidPitch: number | null = null;
  private framesSinceValid = 0;
  private smoothedVariance = 0;

  constructor(config: Partial<PitchTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detect = YIN({
      sampleRate: this.config.sampleRate,
      threshold: 0.1,
    });
  }

  update(timeDomainData: Float32Array, sampleRate?: number): PitchResult {
    // Reinitialize detector if sample rate changed
    if (sampleRate && sampleRate !== this.config.sampleRate) {
      this.config.sampleRate = sampleRate;
      this.detect = YIN({
        sampleRate,
        threshold: 0.1,
      });
    }

    // Gate: skip YIN on quiet signals — prevents false detections from noise
    const rms = computeQuickRMS(timeDomainData);
    if (rms < this.config.silenceRmsThreshold) {
      this.framesSinceValid++;
      this.decayVariance();
      return {
        pitch: this.getHeldPitch(),
        pitchVariance: this.smoothedVariance,
      };
    }

    const raw = this.detect(timeDomainData);

    // Filter out-of-range pitches
    const pitch = (raw !== null && raw >= this.config.minPitchHz && raw <= this.config.maxPitchHz)
      ? raw
      : null;

    // Update history and hold state
    if (pitch !== null) {
      this.history.push(pitch);
      if (this.history.length > this.config.historySize) {
        this.history.shift();
      }
      this.lastValidPitch = pitch;
      this.framesSinceValid = 0;
      // Use raw variance directly — the short window (20 samples) already
      // makes it responsive. No EMA needed.
      this.smoothedVariance = this.computeVariance();
    } else {
      this.framesSinceValid++;
      this.decayVariance();
    }

    return {
      pitch: pitch ?? this.getHeldPitch(),
      pitchVariance: this.smoothedVariance,
    };
  }

  /** Return held pitch if within hold window, otherwise null */
  private getHeldPitch(): number | null {
    if (this.lastValidPitch !== null && this.framesSinceValid <= this.config.holdFrames) {
      return this.lastValidPitch;
    }
    return null;
  }

  private computeVariance(): number {
    // Use only the most recent ~1s (20 samples) for responsive variance
    const VARIANCE_WINDOW = 20;
    const recent = this.history.length > VARIANCE_WINDOW
      ? this.history.slice(-VARIANCE_WINDOW)
      : this.history;

    if (recent.length < 2) return 0;

    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (mean < 1) return 0;

    const variance = recent.reduce((sum, v) => sum + (v - mean) ** 2, 0) / recent.length;
    const std = Math.sqrt(variance);
    const cv = std / mean;  // coefficient of variation

    // Normalize to 0-1: CV of 0 = monotone, CV of 0.5+ = very expressive
    return Math.min(1, cv / 0.5);
  }

  /** Decay smoothed variance toward 0 during silence / no-pitch frames */
  private decayVariance(): void {
    this.smoothedVariance *= 0.95;  // ~1s half-life at 20Hz
    if (this.smoothedVariance < 0.01) this.smoothedVariance = 0;
  }

  reset(): void {
    this.history = [];
    this.lastValidPitch = null;
    this.framesSinceValid = 0;
    this.smoothedVariance = 0;
  }
}

/** Fast RMS without meyda overhead — just for gating */
function computeQuickRMS(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}
