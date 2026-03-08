import { describe, it, expect } from 'vitest';
import { AudioPipeline } from './AudioPipeline';
import { EventBus } from '../core/EventBus';
import { EventType } from '../types';
import type { MetricDataPoint, AudioChunkData } from '../types';

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

  // Create frequency data with energy in speech band
  const frequencyData = new Float32Array(1024);
  const binWidth = 44100 / (frequencyData.length * 2);
  for (let i = 0; i < frequencyData.length; i++) {
    const freq = i * binWidth;
    frequencyData[i] = (freq >= 85 && freq <= 3000) ? -10 : -80;
  }

  return {
    participant,
    timeDomainData,
    frequencyData,
    sampleRate: 44100,
    timestamp,
  };
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
});
