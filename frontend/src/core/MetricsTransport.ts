import type { MetricDataPoint, InterruptionCounts, ParticipantRole } from '../types';

export interface MetricsTransportConfig {
  maxReconnectDelayMs: number;
  initialReconnectDelayMs: number;
}

const DEFAULT_CONFIG: MetricsTransportConfig = {
  maxReconnectDelayMs: 10_000,
  initialReconnectDelayMs: 500,
};

type RemoteMetricsCallback = (dp: MetricDataPoint, serverTimestamp: number) => void;
type InterruptionsCallback = (counts: InterruptionCounts) => void;

export class MetricsTransport {
  private config: MetricsTransportConfig;
  private ws: WebSocket | null = null;
  private remoteCallbacks: RemoteMetricsCallback[] = [];
  private interruptionsCallbacks: InterruptionsCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number;
  private disposed = false;
  private wsUrl = '';
  private roomName = '';
  private role: ParticipantRole = 'tutor';

  // Clock-sync state
  private clockOffsetSamples: number[] = [];
  private clockSyncTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly CLOCK_SYNC_INTERVAL_MS = 10_000;
  private static readonly CLOCK_SYNC_MAX_SAMPLES = 5;

  constructor(config: Partial<MetricsTransportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reconnectDelay = this.config.initialReconnectDelayMs;
  }

  getClockOffset(): number {
    if (this.clockOffsetSamples.length === 0) return 0;
    // Median of recent samples for stability
    const sorted = [...this.clockOffsetSamples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  connect(wsUrl: string, roomName: string, role: ParticipantRole): void {
    this.wsUrl = wsUrl;
    this.roomName = roomName;
    this.role = role;
    this.disposed = false;
    this.openConnection();
  }

  send(dataPoint: MetricDataPoint): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'metrics', data: dataPoint }));
  }

  onRemoteMetrics(cb: RemoteMetricsCallback): () => void {
    this.remoteCallbacks.push(cb);
    return () => {
      this.remoteCallbacks = this.remoteCallbacks.filter((c) => c !== cb);
    };
  }

  onInterruptions(cb: InterruptionsCallback): () => void {
    this.interruptionsCallbacks.push(cb);
    return () => {
      this.interruptionsCallbacks = this.interruptionsCallbacks.filter((c) => c !== cb);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.stopClockSync();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
    this.remoteCallbacks = [];
    this.interruptionsCallbacks = [];
  }

  private sendClockSync(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'clock-sync', clientTs: Date.now() }));
    }
  }

  private stopClockSync(): void {
    if (this.clockSyncTimer) {
      clearInterval(this.clockSyncTimer);
      this.clockSyncTimer = null;
    }
  }

  private openConnection(): void {
    if (this.disposed) return;

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = this.config.initialReconnectDelayMs;
      this.ws!.send(JSON.stringify({
        type: 'join',
        roomName: this.roomName,
        role: this.role,
      }));

      // Start clock-sync pings
      this.stopClockSync();
      this.sendClockSync();
      this.clockSyncTimer = setInterval(() => this.sendClockSync(), MetricsTransport.CLOCK_SYNC_INTERVAL_MS);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'clock-sync-ack' && typeof msg.clientTs === 'number' && typeof msg.serverTs === 'number') {
          const now = Date.now();
          const rtt = now - msg.clientTs;
          const offset = msg.serverTs - msg.clientTs - rtt / 2;
          this.clockOffsetSamples.push(offset);
          if (this.clockOffsetSamples.length > MetricsTransport.CLOCK_SYNC_MAX_SAMPLES) {
            this.clockOffsetSamples.shift();
          }
          return;
        }

        if (msg.type === 'interruptions' && msg.counts) {
          const counts = msg.counts as InterruptionCounts;
          for (const cb of this.interruptionsCallbacks) {
            cb(counts);
          }
          return;
        }

        if (msg.type === 'metrics' && msg.data && msg.serverTimestamp) {
          const dp = msg.data as MetricDataPoint;
          dp.serverTimestamp = msg.serverTimestamp;
          // Stamp t5 — transport receive time
          if (dp._trace) {
            dp._trace.t5_clientRecv = Date.now();
          }
          for (const cb of this.remoteCallbacks) {
            cb(dp, msg.serverTimestamp);
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror — reconnect handled there
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.config.maxReconnectDelayMs);
      this.openConnection();
    }, this.reconnectDelay);
  }
}
