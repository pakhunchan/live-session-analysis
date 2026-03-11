import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveInputAdapter } from './LiveInputAdapter';

function createMockStream(): MediaStream {
  const track = { stop: vi.fn(), kind: 'video' } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe('LiveInputAdapter', () => {
  let mockGetUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetUserMedia = vi.fn();
  });

  it('calls getUserMedia with correct constraints', async () => {
    const stream = createMockStream();
    mockGetUserMedia.mockResolvedValue(stream);

    // Stub video element
    const mockVideoEl = {
      set srcObject(_: any) {},
      set muted(_: boolean) {},
      set playsInline(_: boolean) {},
      play: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockVideoEl as any);

    const adapter = new LiveInputAdapter(
      { video: { width: { ideal: 640 } }, audio: true },
      mockGetUserMedia,
    );
    await adapter.initialize();

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: { width: { ideal: 640 } },
      audio: true,
    });
  });

  it('creates video element on initialize', async () => {
    const stream = createMockStream();
    mockGetUserMedia.mockResolvedValue(stream);

    const mockVideoEl = {
      srcObject: null as any,
      muted: false,
      playsInline: false,
      play: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockVideoEl as any);

    const adapter = new LiveInputAdapter({}, mockGetUserMedia);
    await adapter.initialize();

    expect(adapter.getVideoElement()).toBe(mockVideoEl);
    expect(adapter.isReady()).toBe(true);
  });

  it('dispose stops all tracks', async () => {
    const stopFn = vi.fn();
    const track = { stop: stopFn, kind: 'video' } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    mockGetUserMedia.mockResolvedValue(stream);

    const mockVideoEl = {
      srcObject: null as any,
      muted: false,
      playsInline: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockVideoEl as any);

    const adapter = new LiveInputAdapter({}, mockGetUserMedia);
    await adapter.initialize();
    adapter.dispose();

    expect(stopFn).toHaveBeenCalled();
    expect(adapter.isReady()).toBe(false);
    expect(adapter.getMediaStream()).toBeNull();
  });

  it('getMediaStream returns null before init', () => {
    const adapter = new LiveInputAdapter({}, mockGetUserMedia);
    expect(adapter.getMediaStream()).toBeNull();
    expect(adapter.isReady()).toBe(false);
  });

  it('setRemoteStream stores correctly', () => {
    const adapter = new LiveInputAdapter({}, mockGetUserMedia);
    const remote = createMockStream();
    adapter.setRemoteStream(remote);
    expect(adapter.getRemoteStream()).toBe(remote);
  });
});
