import { useState, useEffect, useRef, useCallback } from 'react';
import { EventBus } from '../../core/EventBus';
import { MetricsEngine } from '../../core/MetricsEngine';
import { VideoPipeline } from '../../video/VideoPipeline';
import { AudioPipeline } from '../../audio/AudioPipeline';
import { StreamManager } from '../../core/StreamManager';
import { NudgeEngine } from '../../coaching/NudgeEngine';
import type { IFaceDetector } from '../../video/FaceDetector';
import type { MetricSnapshot, MetricDataPoint } from '../../types';
import { EventType } from '../../types';

export interface UseMetricsEngineReturn {
  snapshot: MetricSnapshot | null;
  history: MetricSnapshot[];
  isRunning: boolean;
  start: (detector: IFaceDetector) => void;
  stop: () => void;
  eventBus: EventBus;
  streamManager: StreamManager;
}

export function useMetricsEngine(sessionId = 'session-1'): UseMetricsEngineReturn {
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [history, setHistory] = useState<MetricSnapshot[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const eventBusRef = useRef(new EventBus());
  const metricsEngineRef = useRef<MetricsEngine | null>(null);
  const videoPipelineRef = useRef<VideoPipeline | null>(null);
  const audioPipelineRef = useRef<AudioPipeline | null>(null);
  const streamManagerRef = useRef(new StreamManager({ videoFps: 2, audioSampleHz: 20 }));
  const nudgeEngineRef = useRef<NudgeEngine | null>(null);

  // Subscribe to snapshots
  useEffect(() => {
    const bus = eventBusRef.current;
    const unsub = bus.on<MetricSnapshot>(EventType.METRIC_SNAPSHOT, (event) => {
      setSnapshot(event.payload);
      setHistory((prev) => {
        const next = [...prev, event.payload];
        return next.length > 360 ? next.slice(-360) : next; // 3 min at 2 Hz
      });
    });
    return unsub;
  }, []);

  // Wire video metrics → metrics engine
  useEffect(() => {
    const bus = eventBusRef.current;
    const unsub = bus.on<MetricDataPoint>(EventType.VIDEO_METRICS, (event) => {
      metricsEngineRef.current?.ingestDataPoint(event.payload);
    });
    return unsub;
  }, []);

  // Wire audio metrics → metrics engine
  useEffect(() => {
    const bus = eventBusRef.current;
    const unsub = bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (event) => {
      metricsEngineRef.current?.ingestDataPoint(event.payload);
      // Update interruption count from audio pipeline
      if (audioPipelineRef.current) {
        metricsEngineRef.current?.setInterruptionCount(
          audioPipelineRef.current.getInterruptionCount()
        );
      }
    });
    return unsub;
  }, []);

  const start = useCallback((detector: IFaceDetector) => {
    const bus = eventBusRef.current;
    const sm = streamManagerRef.current;

    // Create engines
    const me = new MetricsEngine({ sessionId, snapshotIntervalMs: 500 });
    const vp = new VideoPipeline(detector, bus);
    const ap = new AudioPipeline(bus);

    metricsEngineRef.current = me;
    videoPipelineRef.current = vp;
    audioPipelineRef.current = ap;

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

    // Start everything
    me.start((snap) => {
      bus.emit(EventType.METRIC_SNAPSHOT, snap);
    });
    sm.start();
    setIsRunning(true);
  }, [sessionId]);

  const stop = useCallback(() => {
    nudgeEngineRef.current?.stop();
    metricsEngineRef.current?.stop();
    streamManagerRef.current.stop();
    setIsRunning(false);
  }, []);

  return {
    snapshot,
    history,
    isRunning,
    start,
    stop,
    eventBus: eventBusRef.current,
    streamManager: streamManagerRef.current,
  };
}
