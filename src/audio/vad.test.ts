import { describe, it, expect } from 'vitest';
import { VoiceActivityDetector, computeBandEnergy } from './vad';

// Create frequency data with energy concentrated in speech band
function makeSpeechFreqData(sampleRate: number): Float32Array {
  const data = new Float32Array(1024);
  const binWidth = sampleRate / (data.length * 2);
  for (let i = 0; i < data.length; i++) {
    const freq = i * binWidth;
    // Strong in 85-3000 Hz range, weak elsewhere
    data[i] = (freq >= 85 && freq <= 3000) ? -10 : -80;
  }
  return data;
}

function makeNoiseFreqData(sampleRate: number): Float32Array {
  const data = new Float32Array(1024);
  const binWidth = sampleRate / (data.length * 2);
  for (let i = 0; i < data.length; i++) {
    const freq = i * binWidth;
    // Strong in low rumble range, weak in speech
    data[i] = freq < 50 ? -10 : -80;
  }
  return data;
}

function makeSilentFreqData(): Float32Array {
  return new Float32Array(1024).fill(-100);
}

describe('computeBandEnergy', () => {
  it('returns correct band ratio for speech-dominated signal', () => {
    const data = makeSpeechFreqData(44100);
    const ratio = computeBandEnergy(data, 44100, 85, 3000);
    expect(ratio).toBeGreaterThan(0.5);
  });
});

describe('VoiceActivityDetector', () => {
  it('silence is not speaking', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 2, offsetFrames: 3 });
    const result = vad.update(0.001, makeSilentFreqData(), 44100);
    expect(result).toBe(false);
  });

  it('loud speech triggers speaking after onset frames', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 3, offsetFrames: 6 });
    const freqData = makeSpeechFreqData(44100);

    // Not yet speaking after 1-2 frames
    vad.update(0.1, freqData, 44100);
    vad.update(0.1, freqData, 44100);
    expect(vad.isSpeaking()).toBe(false);

    // Speaking after 3rd frame
    const result = vad.update(0.1, freqData, 44100);
    expect(result).toBe(true);
  });

  it('single loud frame does not trigger', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 3 });
    vad.update(0.1, makeSpeechFreqData(44100), 44100);
    expect(vad.isSpeaking()).toBe(false);
  });

  it('single silent frame does not end speech', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 2, offsetFrames: 4 });
    const freqData = makeSpeechFreqData(44100);

    // Start speaking
    vad.update(0.1, freqData, 44100);
    vad.update(0.1, freqData, 44100);
    expect(vad.isSpeaking()).toBe(true);

    // One silent frame
    vad.update(0.001, makeSilentFreqData(), 44100);
    expect(vad.isSpeaking()).toBe(true); // still speaking
  });

  it('low rumble (non-speech band) is filtered', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 2 });
    const noiseData = makeNoiseFreqData(44100);

    // High RMS but wrong frequency band
    vad.update(0.2, noiseData, 44100);
    vad.update(0.2, noiseData, 44100);
    vad.update(0.2, noiseData, 44100);
    expect(vad.isSpeaking()).toBe(false);
  });

  it('speech band triggers correctly', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 2 });
    const speechData = makeSpeechFreqData(44100);

    vad.update(0.1, speechData, 44100);
    vad.update(0.1, speechData, 44100);
    expect(vad.isSpeaking()).toBe(true);
  });

  it('reset clears state', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 2 });
    const speechData = makeSpeechFreqData(44100);

    vad.update(0.1, speechData, 44100);
    vad.update(0.1, speechData, 44100);
    expect(vad.isSpeaking()).toBe(true);

    vad.reset();
    expect(vad.isSpeaking()).toBe(false);
  });
});
