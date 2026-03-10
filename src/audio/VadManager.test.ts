import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VadManager } from './VadManager';

// Mock the vad-web module
let onSpeechStartCb: (() => void) | null = null;
let onSpeechEndCb: (() => void) | null = null;
const mockStart = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (opts: {
      stream: MediaStream;
      onSpeechStart?: () => void;
      onSpeechEnd?: () => void;
    }) => {
      onSpeechStartCb = opts.onSpeechStart ?? null;
      onSpeechEndCb = opts.onSpeechEnd ?? null;
      return {
        start: mockStart,
        destroy: mockDestroy,
      };
    }),
  },
}));

function makeFakeStream(): MediaStream {
  return {} as MediaStream;
}

describe('VadManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSpeechStartCb = null;
    onSpeechEndCb = null;
  });

  it('initial state is not speaking', () => {
    const vm = new VadManager();
    expect(vm.isSpeaking('tutor')).toBe(false);
    expect(vm.isSpeaking('student')).toBe(false);
  });

  it('starts VAD for a participant', async () => {
    const vm = new VadManager();
    await vm.startForParticipant('tutor', makeFakeStream());

    expect(mockStart).toHaveBeenCalled();
  });

  it('speech start callback sets speaking state', async () => {
    const vm = new VadManager();
    await vm.startForParticipant('tutor', makeFakeStream());

    expect(vm.isSpeaking('tutor')).toBe(false);

    // Simulate speech start
    onSpeechStartCb?.();
    expect(vm.isSpeaking('tutor')).toBe(true);

    // Other participant unaffected
    expect(vm.isSpeaking('student')).toBe(false);
  });

  it('speech end callback clears speaking state', async () => {
    const vm = new VadManager();
    await vm.startForParticipant('tutor', makeFakeStream());

    onSpeechStartCb?.();
    expect(vm.isSpeaking('tutor')).toBe(true);

    onSpeechEndCb?.();
    expect(vm.isSpeaking('tutor')).toBe(false);
  });

  it('destroy cleans up all VAD instances', async () => {
    const vm = new VadManager();
    await vm.startForParticipant('tutor', makeFakeStream());
    await vm.startForParticipant('student', makeFakeStream());

    await vm.destroy();

    expect(mockDestroy).toHaveBeenCalledTimes(2);
    expect(vm.isSpeaking('tutor')).toBe(false);
    expect(vm.isSpeaking('student')).toBe(false);
  });
});
