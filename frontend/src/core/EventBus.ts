import type { EventType, MetricEvent } from '../types';

type Handler<T = unknown> = (event: MetricEvent<T>) => void;

export class EventBus {
  private listeners = new Map<EventType, Set<Handler<any>>>();

  on<T>(type: EventType, handler: Handler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const handlers = this.listeners.get(type)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  emit<T>(type: EventType, payload: T): void {
    const event: MetricEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  listenerCount(type: EventType): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}
