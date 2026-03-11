import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamManager } from './StreamManager';
import type { IAudioContext, IAudioAnalyserNode } from './StreamManager';
import type { FrameData, AudioChunkData } from '../types';

function createMockAnalyser(): IAudioAnalyserNode {
  return {
    fftSize: 2048,
    frequencyBinCount: 1024,
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => arr.fill(0)),
    getFloatFrequencyData: vi.fn((arr: Float32Array) => arr.fill(-100)),
  };
}

function createMockAudioContext(analyser: IAudioAnalyserNode): IAudioContext {
  return {
    sampleRate: 44100,
    createAnalyser: () => analyser,
    createMediaStreamSource: () => ({ connect: vi.fn() }),
  };
}

function createMockMediaStream(): MediaStream {
  return {} as MediaStream;
}

function createMockVideoElement(ready = true): HTMLVideoElement {
  return {
    readyState: ready ? 4 : 0,
    videoWidth: 640,
    videoHeight: 480,
    width: 640,
    height: 480,
  } as unknown as HTMLVideoElement;
}

describe('StreamManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires frame callbacks at configured rate', () => {
    const sm = new StreamManager({ videoFps: 2 });
    const videoEl = createMockVideoElement();
    sm.setVideoElement('tutor', videoEl);

    const frames: FrameData[] = [];
    sm.onFrame((f) => frames.push(f));
    sm.start();

    // 2 Hz = 500ms interval, advance 2100ms → expect ~4 frames
    vi.advanceTimersByTime(2100);
    sm.stop();

    expect(frames.length).toBe(4);
    expect(frames[0].participant).toBe('tutor');
  });

  it('fires audio callbacks at configured rate', () => {
    const analyser = createMockAnalyser();
    const sm = new StreamManager({ audioSampleHz: 10 });

    sm.setAudioContextFactory(() => createMockAudioContext(analyser));
    sm.setStream('tutor', createMockMediaStream());

    const chunks: AudioChunkData[] = [];
    sm.onAudioChunk((c) => chunks.push(c));
    sm.start();

    // 10 Hz = 100ms interval, advance 550ms → expect 5 chunks
    vi.advanceTimersByTime(550);
    sm.stop();

    expect(chunks.length).toBe(5);
    expect(chunks[0].participant).toBe('tutor');
    expect(chunks[0].sampleRate).toBe(44100);
  });

  it('stop halts all callbacks', () => {
    const sm = new StreamManager({ videoFps: 2 });
    sm.setVideoElement('tutor', createMockVideoElement());

    const frames: FrameData[] = [];
    sm.onFrame((f) => frames.push(f));
    sm.start();

    vi.advanceTimersByTime(600);
    const countBeforeStop = frames.length;
    sm.stop();

    vi.advanceTimersByTime(2000);
    expect(frames.length).toBe(countBeforeStop);
  });

  it('setStream wires AudioContext', () => {
    const analyser = createMockAnalyser();
    const factory = vi.fn(() => createMockAudioContext(analyser));

    const sm = new StreamManager();
    sm.setAudioContextFactory(factory);
    sm.setStream('student', createMockMediaStream());

    expect(factory).toHaveBeenCalledOnce();
  });

  it('FrameData has correct participant and timestamp', () => {
    const sm = new StreamManager({ videoFps: 10 });
    sm.setVideoElement('student', createMockVideoElement());

    const frames: FrameData[] = [];
    sm.onFrame((f) => frames.push(f));
    sm.start();

    vi.advanceTimersByTime(150);
    sm.stop();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].participant).toBe('student');
    expect(frames[0].width).toBe(640);
    expect(frames[0].height).toBe(480);
    expect(typeof frames[0].timestamp).toBe('number');
  });

  it('start without stream skips gracefully', () => {
    const sm = new StreamManager({ videoFps: 2 });
    // No streams set

    const frames: FrameData[] = [];
    const chunks: AudioChunkData[] = [];
    sm.onFrame((f) => frames.push(f));
    sm.onAudioChunk((c) => chunks.push(c));

    sm.start();
    vi.advanceTimersByTime(2000);
    sm.stop();

    expect(frames.length).toBe(0);
    expect(chunks.length).toBe(0);
  });
});
