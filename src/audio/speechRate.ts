/**
 * Count amplitude peaks in RMS history (syllable boundary estimation).
 * A peak is a local maximum above the mean, with minimum distance between peaks.
 */
export function countAmplitudePeaks(
  rmsHistory: number[],
  minPeakDistance: number = 3,
): number {
  if (rmsHistory.length < 3) return 0;

  const mean = rmsHistory.reduce((a, b) => a + b, 0) / rmsHistory.length;
  const threshold = mean * 1.2; // peak must be 20% above mean

  let peaks = 0;
  let lastPeakIdx = -minPeakDistance; // allow first peak

  for (let i = 1; i < rmsHistory.length - 1; i++) {
    if (
      rmsHistory[i] > rmsHistory[i - 1] &&
      rmsHistory[i] > rmsHistory[i + 1] &&
      rmsHistory[i] > threshold &&
      i - lastPeakIdx >= minPeakDistance
    ) {
      peaks++;
      lastPeakIdx = i;
    }
  }

  return peaks;
}

/**
 * Estimate speech rate as a 0-1 score from RMS amplitude history.
 * Normal speech: 3-5 syllables/sec. Fast: 6-8. Very fast: 8+.
 *
 * @param rmsHistory Array of RMS values sampled at sampleRateHz
 * @param sampleRateHz How many RMS samples per second
 */
export function estimateSpeechRate(
  rmsHistory: number[],
  sampleRateHz: number,
): number {
  if (rmsHistory.length < 3 || sampleRateHz <= 0) return 0;

  const minPeakDistance = Math.max(1, Math.floor(sampleRateHz / 10)); // min ~100ms between peaks
  const peaks = countAmplitudePeaks(rmsHistory, minPeakDistance);

  const durationSec = rmsHistory.length / sampleRateHz;
  if (durationSec < 0.1) return 0;

  const syllablesPerSec = peaks / durationSec;

  // Normalize: 0 syl/s → 0, 4 syl/s → 0.5, 8+ syl/s → 1.0
  return Math.min(1, syllablesPerSec / 8);
}
