import { describe, it, expect, vi } from 'vitest';
import { AudioPipeline } from './AudioPipeline';
import { EventBus } from '../core/EventBus';
import { EventType } from '../types';
import type { MetricDataPoint, AudioChunkData } from '../types';
import type { VadManager } from './VadManager';

// Mock meyda for Node/jsdom environment
vi.mock('meyda', () => ({
  default: {
    extract: (features: string[], signal: Float32Array) => {
      if (features.includes('rms')) {
        let sum = 0;
        for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i];
        return { rms: Math.sqrt(sum / signal.length) };
      }
      if (features.includes('spectralCentroid')) {
        // Return a reasonable bin index
        return { spectralCentroid: 10 };
      }
      return {};
    },
  },
}));

// Mock pitchfinder
vi.mock('pitchfinder', () => ({
  YIN: () => (buf: Float32Array) => {
    // Return 200Hz if there's energy, null if silent
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length) > 0.01 ? 200 : null;
  },
}));

function makeChunk(
  participant: 'tutor' | 'student',
  rms: number,
  timestamp: number,
): AudioChunkData {
  // Create time domain data with target RMS
  const timeDomainData = new Float32Array(1024);
  for (let i = 0; i < timeDomainData.length; i++) {
    timeDomainData[i] = rms * Math.sin((2 * Math.PI * i) / 64);
  }

  // frequencyData still present in AudioChunkData but not used by pipeline
  const frequencyData = new Float32Array(1024);

  return {
    participant,
    timeDomainData,
    frequencyData,
    sampleRate: 44100,
    timestamp,
  };
}

function makeMockVadManager(speakingState: Record<string, boolean> = {}): VadManager {
  return {
    isSpeaking: (role: string) => speakingState[role] ?? false,
    startForParticipant: vi.fn(),
    destroy: vi.fn(),
  } as unknown as VadManager;
}

describe('AudioPipeline', () => {
  it('publishes AUDIO_METRICS event', () => {
    const bus = new EventBus();
    const pipeline = new AudioPipeline(bus);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (e) => events.push(e.payload));

    pipeline.processChunk(makeChunk('tutor', 0.1, 1000));

    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('audio');
    expect(events[0].participant).toBe('tutor');
    expect(typeof events[0].voiceEnergy).toBe('number');
  });

  it('RMS history accumulates', () => {
    const bus = new EventBus();
    const pipeline = new AudioPipeline(bus);

    pipeline.processChunk(makeChunk('tutor', 0.1, 1000));
    pipeline.processChunk(makeChunk('tutor', 0.2, 1050));
    pipeline.processChunk(makeChunk('tutor', 0.3, 1100));

    const history = pipeline.getRmsHistory('tutor');
    expect(history).toHaveLength(3);
  });

  it('history is capped at configured size', () => {
    const bus = new EventBus();
    const pipeline = new AudioPipeline(bus, { rmsHistorySize: 5, sampleRateHz: 20 });

    for (let i = 0; i < 10; i++) {
      pipeline.processChunk(makeChunk('tutor', 0.1, i * 50));
    }

    const history = pipeline.getRmsHistory('tutor');
    expect(history).toHaveLength(5);
  });

  it('reads speaking state from VadManager', () => {
    const bus = new EventBus();
    const pipeline = new AudioPipeline(bus);
    const mockVm = makeMockVadManager({ tutor: true, student: false });
    pipeline.setVadManager(mockVm);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (e) => events.push(e.payload));

    pipeline.processChunk(makeChunk('tutor', 0.1, 1000));

    expect(events[0].isSpeaking).toBe(true);
  });

  it('isSpeaking is false without VadManager', () => {
    const bus = new EventBus();
    const pipeline = new AudioPipeline(bus);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (e) => events.push(e.payload));

    pipeline.processChunk(makeChunk('tutor', 0.1, 1000));

    expect(events[0].isSpeaking).toBe(false);
  });

  it('emits pitch and pitchVariance', () => {
    const bus = new EventBus();
    const pipeline = new AudioPipeline(bus);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (e) => events.push(e.payload));

    pipeline.processChunk(makeChunk('tutor', 0.1, 1000));

    // With mocked pitchfinder returning 200Hz for non-silent signal
    expect(events[0].pitch).toBe(200);
    expect(typeof events[0].pitchVariance).toBe('number');
  });

  it('pitch is undefined for silent signal', () => {
    const bus = new EventBus();
    const pipeline = new AudioPipeline(bus);

    const events: MetricDataPoint[] = [];
    bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (e) => events.push(e.payload));

    pipeline.processChunk(makeChunk('tutor', 0.001, 1000));

    // Mock returns null for silent signal → undefined in emitted data
    expect(events[0].pitch).toBeUndefined();
  });
});
