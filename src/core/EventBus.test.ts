import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './EventBus';
import { EventType } from '../types';

describe('EventBus', () => {
  it('delivers event to subscriber', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on(EventType.METRIC_SNAPSHOT, handler);
    bus.emit(EventType.METRIC_SNAPSHOT, { value: 42 });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].payload).toEqual({ value: 42 });
  });

  it('delivers to multiple subscribers', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on(EventType.METRIC_SNAPSHOT, h1);
    bus.on(EventType.METRIC_SNAPSHOT, h2);
    bus.emit(EventType.METRIC_SNAPSHOT, 'data');

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops delivery', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.on(EventType.NUDGE, handler);
    bus.emit(EventType.NUDGE, 'first');
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    bus.emit(EventType.NUDGE, 'second');
    expect(handler).toHaveBeenCalledOnce(); // still 1
  });

  it('isolates event types', () => {
    const bus = new EventBus();
    const videoHandler = vi.fn();
    const audioHandler = vi.fn();

    bus.on(EventType.VIDEO_METRICS, videoHandler);
    bus.on(EventType.AUDIO_METRICS, audioHandler);

    bus.emit(EventType.VIDEO_METRICS, 'video-data');

    expect(videoHandler).toHaveBeenCalledOnce();
    expect(audioHandler).not.toHaveBeenCalled();
  });

  it('clear removes all listeners', () => {
    const bus = new EventBus();
    bus.on(EventType.METRIC_SNAPSHOT, vi.fn());
    bus.on(EventType.NUDGE, vi.fn());

    expect(bus.listenerCount(EventType.METRIC_SNAPSHOT)).toBe(1);
    bus.clear();
    expect(bus.listenerCount(EventType.METRIC_SNAPSHOT)).toBe(0);
    expect(bus.listenerCount(EventType.NUDGE)).toBe(0);
  });

  it('emit with no subscribers does not throw', () => {
    const bus = new EventBus();
    expect(() => bus.emit(EventType.SESSION_START, {})).not.toThrow();
  });
});
