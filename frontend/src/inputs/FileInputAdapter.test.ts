import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileInputAdapter } from './FileInputAdapter';

function createMockFile(name = 'test.mp4'): File {
  return new File(['video-data'], name, { type: 'video/mp4' });
}

// jsdom doesn't provide URL.createObjectURL/revokeObjectURL
const origCreate = URL.createObjectURL;
const origRevoke = URL.revokeObjectURL;

describe('FileInputAdapter', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });
  it('creates video with correct src via objectURL', async () => {
    const file = createMockFile();
    const adapter = new FileInputAdapter(file);

    const mockVideoEl = {
      src: '',
      muted: false,
      playsInline: false,
      loop: false,
      onloadeddata: null as any,
      onerror: null as any,
      play: vi.fn().mockResolvedValue(undefined),
      captureStream: vi.fn().mockReturnValue({} as MediaStream),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockVideoEl as any);

    const initPromise = adapter.initialize();
    // Trigger loadeddata
    mockVideoEl.onloadeddata();
    await initPromise;

    expect(mockVideoEl.src).toBe('blob:mock-url');
    expect(mockVideoEl.loop).toBe(true);
  });

  it('isReady true after load', async () => {
    const file = createMockFile();
    const adapter = new FileInputAdapter(file);

    const mockVideoEl = {
      src: '',
      muted: false,
      playsInline: false,
      loop: false,
      onloadeddata: null as any,
      onerror: null as any,
      play: vi.fn().mockResolvedValue(undefined),
      captureStream: vi.fn().mockReturnValue({} as MediaStream),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockVideoEl as any);

    const p = adapter.initialize();
    mockVideoEl.onloadeddata();
    await p;

    expect(adapter.isReady()).toBe(true);
    expect(adapter.getVideoElement()).toBe(mockVideoEl);
  });

  it('dispose pauses and revokes object URL', async () => {
    const file = createMockFile();
    const adapter = new FileInputAdapter(file);

    const mockVideoEl = {
      src: '',
      muted: false,
      playsInline: false,
      loop: false,
      onloadeddata: null as any,
      onerror: null as any,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      captureStream: vi.fn().mockReturnValue({} as MediaStream),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockVideoEl as any);

    const p = adapter.initialize();
    mockVideoEl.onloadeddata();
    await p;

    adapter.dispose();

    expect(mockVideoEl.pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(adapter.isReady()).toBe(false);
  });

  it('handles missing file with error', async () => {
    const adapter = new FileInputAdapter();
    await expect(adapter.initialize()).rejects.toThrow('No file provided');
  });
});
