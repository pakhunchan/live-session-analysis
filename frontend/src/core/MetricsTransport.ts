import type { MetricDataPoint, ParticipantRole } from '../types';

export interface MetricsTransportConfig {
  maxReconnectDelayMs: number;
  initialReconnectDelayMs: number;
}

const DEFAULT_CONFIG: MetricsTransportConfig = {
  maxReconnectDelayMs: 10_000,
  initialReconnectDelayMs: 500,
};

type RemoteMetricsCallback = (dp: MetricDataPoint, serverTimestamp: number) => void;

export class MetricsTransport {
  private config: MetricsTransportConfig;
  private ws: WebSocket | null = null;
  private remoteCallbacks: RemoteMetricsCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number;
  private disposed = false;
  private wsUrl = '';
  private roomName = '';
  private role: ParticipantRole = 'tutor';

  constructor(config: Partial<MetricsTransportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reconnectDelay = this.config.initialReconnectDelayMs;
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

  dispose(): void {
    this.disposed = true;
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
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'metrics' && msg.data && msg.serverTimestamp) {
          const dp = msg.data as MetricDataPoint;
          dp.serverTimestamp = msg.serverTimestamp;
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
