import { useState, useEffect, useRef, useCallback } from 'react';
import { EventBus } from '../../core/EventBus';
import { MetricsEngine } from '../../core/MetricsEngine';
import { VideoPipeline } from '../../video/VideoPipeline';
import { AudioPipeline } from '../../audio/AudioPipeline';
import { VadManager } from '../../audio/VadManager';
import { StreamManager } from '../../core/StreamManager';
import { NudgeEngine } from '../../coaching/NudgeEngine';
import { MetricsTransport } from '../../core/MetricsTransport';
import { LatencyTracker } from '../../core/LatencyTracker';
import type { LatencyBreakdown } from '../../core/LatencyTracker';
import type { IFaceDetector } from '../../video/FaceDetector';
import type { MetricSnapshot, MetricDataPoint, Nudge } from '../../types';
import { EventType } from '../../types';

const WS_BASE = import.meta.env.VITE_WS_URL as string | undefined;

export interface UseMetricsEngineReturn {
  snapshot: MetricSnapshot | null;
  history: MetricSnapshot[];
  nudges: Nudge[];
  latencyBreakdown: LatencyBreakdown | null;
  isRunning: boolean;
  start: (detector: IFaceDetector, roomName: string) => Promise<void>;
  stop: () => void;
  resetHistory: () => void;
  startVadForStream: (role: 'tutor' | 'student', stream: MediaStream) => Promise<void>;
  eventBus: EventBus;
  streamManager: StreamManager;
}

export function useMetricsEngine(sessionId = 'session-1'): UseMetricsEngineReturn {
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [history, setHistory] = useState<MetricSnapshot[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [latencyBreakdown, setLatencyBreakdown] = useState<LatencyBreakdown | null>(null);

  const eventBusRef = useRef(new EventBus());
  const metricsEngineRef = useRef<MetricsEngine | null>(null);
  const videoPipelineRef = useRef<VideoPipeline | null>(null);
  const audioPipelineRef = useRef<AudioPipeline | null>(null);
  const vadManagerRef = useRef<VadManager | null>(null);
  const streamManagerRef = useRef(new StreamManager({ videoFps: 2, audioSampleHz: 20 }));
  const nudgeEngineRef = useRef<NudgeEngine | null>(null);
  const transportRef = useRef<MetricsTransport | null>(null);
  const latencyTrackerRef = useRef<LatencyTracker | null>(null);

  // Subscribe to snapshots — full history kept for post-session summary
  useEffect(() => {
    const bus = eventBusRef.current;
    const unsub = bus.on<MetricSnapshot>(EventType.METRIC_SNAPSHOT, (event) => {
      setSnapshot(event.payload);
      setHistory((prev) => [...prev, event.payload]);
    });
    return unsub;
  }, []);

  // Collect nudges for post-session summary
  useEffect(() => {
    const unsub = eventBusRef.current.on<Nudge>(EventType.NUDGE, (event) => {
      setNudges(prev => [...prev, event.payload]);
    });
    return unsub;
  }, []);

  // Wire video metrics → metrics engine + transport
  useEffect(() => {
    const bus = eventBusRef.current;
    const unsub = bus.on<MetricDataPoint>(EventType.VIDEO_METRICS, (event) => {
      const dp = event.payload;
      if (dp._trace) {
        dp._trace.t2_sent = Date.now();
        dp._trace.clockOffset = transportRef.current?.getClockOffset();
      }
      metricsEngineRef.current?.ingestDataPoint(dp);
      transportRef.current?.send(dp);
    });
    return unsub;
  }, []);

  // Wire audio metrics → metrics engine + transport
  useEffect(() => {
    const bus = eventBusRef.current;
    const unsub = bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (event) => {
      const dp = event.payload;
      if (dp._trace) {
        dp._trace.t2_sent = Date.now();
        dp._trace.clockOffset = transportRef.current?.getClockOffset();
      }
      metricsEngineRef.current?.ingestDataPoint(dp);
      transportRef.current?.send(dp);
    });
    return unsub;
  }, []);

  const start = useCallback(async (detector: IFaceDetector, roomName: string) => {
    const bus = eventBusRef.current;
    const sm = streamManagerRef.current;

    // Create engines — tutor processes own media only
    const me = new MetricsEngine({ sessionId, snapshotIntervalMs: 500 });
    const vp = new VideoPipeline(detector, bus);
    const ap = new AudioPipeline(bus);
    const vadManager = new VadManager();

    ap.setVadManager(vadManager);

    metricsEngineRef.current = me;
    videoPipelineRef.current = vp;
    audioPipelineRef.current = ap;
    vadManagerRef.current = vadManager;

    // Set up LatencyTracker — fed completed traces from MetricsEngine
    const lt = new LatencyTracker();
    latencyTrackerRef.current = lt;
    me.setTraceCallback((trace) => {
      lt.setTutorClockOffset(transportRef.current?.getClockOffset() ?? 0);
      lt.ingestTrace(trace);
      setLatencyBreakdown(lt.getBreakdown());
    });

    // Set up MetricsTransport — connect to backend relay
    const transport = new MetricsTransport();
    transportRef.current = transport;

    const wsUrl = WS_BASE || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/metrics`;
    transport.connect(wsUrl, roomName, 'tutor');

    // Receive remote student metrics from backend → ingest into MetricsEngine
    transport.onRemoteMetrics((dp, _serverTimestamp) => {
      metricsEngineRef.current?.ingestDataPoint(dp);
    });

    // Wire StreamManager callbacks
    sm.onFrame(async (frame) => {
      await vp.processFrame(frame);
    });
    sm.onAudioChunk((chunk) => {
      ap.processChunk(chunk);
    });

    // Start coaching engine
    const ne = new NudgeEngine(bus);
    nudgeEngineRef.current = ne;
    ne.start();

    // Start core pipeline immediately (works without VAD)
    me.start((snap) => {
      bus.emit(EventType.METRIC_SNAPSHOT, snap);
    });
    sm.start();
    setIsRunning(true);

    // Start VadManager in background — non-blocking so session works even if
    // vad-web fails to load (ONNX/AudioWorklet issues)
    const stream = sm.getStream('tutor');
    if (stream) {
      try {
        await vadManager.startForParticipant('tutor', stream);
      } catch (err) {
        console.warn('[VadManager] Failed to start VAD for tutor:', err);
      }
    }
  }, [sessionId]);

  const startVadForStream = useCallback(async (role: 'tutor' | 'student', stream: MediaStream) => {
    const vadManager = vadManagerRef.current;
    if (!vadManager) return;
    try {
      await vadManager.startForParticipant(role, stream);
    } catch (err) {
      console.warn(`[VadManager] Failed to start VAD for ${role}:`, err);
    }
  }, []);

  const stop = useCallback(() => {
    transportRef.current?.dispose();
    transportRef.current = null;
    nudgeEngineRef.current?.stop();
    metricsEngineRef.current?.stop();
    streamManagerRef.current.stop();
    vadManagerRef.current?.destroy();
    vadManagerRef.current = null;
    setIsRunning(false);
  }, []);

  const resetHistory = useCallback(() => {
    setHistory([]);
    setSnapshot(null);
    setNudges([]);
  }, []);

  return {
    snapshot,
    history,
    nudges,
    latencyBreakdown,
    isRunning,
    start,
    stop,
    resetHistory,
    startVadForStream,
    eventBus: eventBusRef.current,
    streamManager: streamManagerRef.current,
  };
}
