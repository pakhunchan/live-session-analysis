import Meyda from 'meyda';

/**
 * Ensure the buffer length is a power of two (required by meyda).
 * Pads with zeros or trims to the nearest power of two.
 */
function ensurePowerOfTwo(data: Float32Array): Float32Array {
  const len = data.length;
  if (len === 0) return data;

  // Check if already power of two
  if ((len & (len - 1)) === 0) return data;

  // Find next power of two
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(len)));
  const result = new Float32Array(nextPow2);
  result.set(data);
  return result;
}

/**
 * Compute RMS (root mean square) amplitude from time domain data.
 * Uses meyda for standardized extraction.
 */
export function computeRMS(timeDomainData: Float32Array): number {
  if (timeDomainData.length === 0) return 0;

  const signal = ensurePowerOfTwo(timeDomainData);
  const features = Meyda.extract(['rms'], signal);
  if (!features || features.rms == null) return 0;

  return features.rms as number;
}

/**
 * Compute spectral centroid (brightness) from time domain data.
 * Returns raw Hz value (not normalized).
 *
 * Note: Signature changed from (frequencyData, sampleRate) to (timeDomainData, sampleRate)
 * because meyda performs its own FFT internally.
 */
export function computeSpectralCentroid(
  timeDomainData: Float32Array,
  sampleRate: number,
): number {
  if (timeDomainData.length === 0 || sampleRate === 0) return 0;

  const signal = ensurePowerOfTwo(timeDomainData);
  const bufferSize = signal.length;

  const features = Meyda.extract(['spectralCentroid'], signal);
  if (!features || features.spectralCentroid == null) return 0;

  // Meyda returns a bin index; convert to Hz
  const binIndex = features.spectralCentroid as number;
  const centroidHz = binIndex * sampleRate / bufferSize;

  return centroidHz;
}

export interface VoiceEnergyWeights {
  variance: number;
  brightness: number;
  speechRate: number;
}

const DEFAULT_WEIGHTS: VoiceEnergyWeights = {
  variance: 0.35,
  brightness: 0.30,
  speechRate: 0.35,
};

/**
 * Compute composite voice energy score from audio features.
 */
export function computeVoiceEnergy(
  volumeVariance: number,
  spectralBrightness: number,
  speechRate: number,
  _weights: VoiceEnergyWeights = DEFAULT_WEIGHTS,
): number {
  return Math.min(1, volumeVariance + spectralBrightness + speechRate);
}
