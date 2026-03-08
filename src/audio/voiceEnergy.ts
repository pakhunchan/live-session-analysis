/**
 * Compute RMS (root mean square) amplitude from time domain data.
 */
export function computeRMS(timeDomainData: Float32Array): number {
  if (timeDomainData.length === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    sumSquares += timeDomainData[i] * timeDomainData[i];
  }
  return Math.sqrt(sumSquares / timeDomainData.length);
}

/**
 * Compute spectral centroid (brightness) from frequency data.
 * Higher centroid = brighter/more energetic voice.
 */
export function computeSpectralCentroid(
  frequencyData: Float32Array,
  sampleRate: number,
): number {
  if (frequencyData.length === 0 || sampleRate === 0) return 0;

  // Convert from dB to linear power
  let weightedSum = 0;
  let totalPower = 0;
  const binWidth = sampleRate / (frequencyData.length * 2);

  for (let i = 0; i < frequencyData.length; i++) {
    // frequencyData is in dB, convert to linear
    const power = Math.pow(10, frequencyData[i] / 20);
    const freq = i * binWidth;
    weightedSum += freq * power;
    totalPower += power;
  }

  if (totalPower < 1e-10) return 0;

  const centroid = weightedSum / totalPower;
  // Normalize to 0-1 range (assume max useful frequency ~8000 Hz)
  return Math.min(1, centroid / 8000);
}

export interface VoiceEnergyWeights {
  volume: number;
  variance: number;
  brightness: number;
  speechRate: number;
}

const DEFAULT_WEIGHTS: VoiceEnergyWeights = {
  volume: 0.30,
  variance: 0.25,
  brightness: 0.20,
  speechRate: 0.25,
};

/**
 * Compute composite voice energy score from audio features.
 */
export function computeVoiceEnergy(
  volumeLevel: number,
  volumeVariance: number,
  spectralBrightness: number,
  speechRate: number,
  weights: VoiceEnergyWeights = DEFAULT_WEIGHTS,
): number {
  const score =
    volumeLevel * weights.volume +
    volumeVariance * weights.variance +
    spectralBrightness * weights.brightness +
    speechRate * weights.speechRate;

  return Math.min(1, Math.max(0, score));
}
