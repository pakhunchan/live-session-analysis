export interface IAudioAnalyser {
  getTimeDomainData(): Float32Array;
  getFrequencyData(): Float32Array;
  getSampleRate(): number;
}

/**
 * Web Audio API AnalyserNode wrapper.
 * For testing, use MockAudioAnalyser.
 */
export class WebAudioAnalyser implements IAudioAnalyser {
  private analyser: AnalyserNode;
  private audioContext: AudioContext;

  constructor(stream: MediaStream, fftSize = 2048) {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = fftSize;

    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);
  }

  getTimeDomainData(): Float32Array {
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatTimeDomainData(data);
    return data;
  }

  getFrequencyData(): Float32Array {
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(data);
    return data;
  }

  getSampleRate(): number {
    return this.audioContext.sampleRate;
  }
}
