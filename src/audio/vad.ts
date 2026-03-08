export interface VADConfig {
  silenceThreshold: number;    // RMS below this = silence
  minSpeechFreqHz: number;     // lower bound of speech band
  maxSpeechFreqHz: number;     // upper bound of speech band
  onsetFrames: number;         // consecutive active frames to trigger speech
  offsetFrames: number;        // consecutive silent frames to end speech
}

const DEFAULT_VAD_CONFIG: VADConfig = {
  silenceThreshold: 0.01,
  minSpeechFreqHz: 85,
  maxSpeechFreqHz: 3000,
  onsetFrames: 3,
  offsetFrames: 6,
};

/**
 * Compute energy in a specific frequency band from frequency domain data.
 */
export function computeBandEnergy(
  frequencyData: Float32Array,
  sampleRate: number,
  minFreqHz: number,
  maxFreqHz: number,
): number {
  if (frequencyData.length === 0 || sampleRate === 0) return 0;

  const binWidth = sampleRate / (frequencyData.length * 2);
  const minBin = Math.floor(minFreqHz / binWidth);
  const maxBin = Math.min(frequencyData.length - 1, Math.ceil(maxFreqHz / binWidth));

  let bandEnergy = 0;
  let totalEnergy = 0;

  for (let i = 0; i < frequencyData.length; i++) {
    const power = Math.pow(10, frequencyData[i] / 20);
    totalEnergy += power;
    if (i >= minBin && i <= maxBin) {
      bandEnergy += power;
    }
  }

  if (totalEnergy < 1e-10) return 0;
  return bandEnergy / totalEnergy;
}

export class VoiceActivityDetector {
  private config: VADConfig;
  private consecutiveActive = 0;
  private consecutiveSilent = 0;
  private speaking = false;

  constructor(config: Partial<VADConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
  }

  update(
    rms: number,
    frequencyData: Float32Array,
    sampleRate: number,
  ): boolean {
    const aboveThreshold = rms > this.config.silenceThreshold;

    // Check speech band dominance (filters keyboard/fan noise)
    const speechBandRatio = computeBandEnergy(
      frequencyData,
      sampleRate,
      this.config.minSpeechFreqHz,
      this.config.maxSpeechFreqHz,
    );
    const isSpeechLike = speechBandRatio > 0.3;

    const frameActive = aboveThreshold && isSpeechLike;

    if (frameActive) {
      this.consecutiveActive++;
      this.consecutiveSilent = 0;
    } else {
      this.consecutiveSilent++;
      this.consecutiveActive = 0;
    }

    // Onset: transition to speaking
    if (!this.speaking && this.consecutiveActive >= this.config.onsetFrames) {
      this.speaking = true;
    }

    // Offset: transition to not speaking
    if (this.speaking && this.consecutiveSilent >= this.config.offsetFrames) {
      this.speaking = false;
    }

    return this.speaking;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  reset(): void {
    this.speaking = false;
    this.consecutiveActive = 0;
    this.consecutiveSilent = 0;
  }
}
