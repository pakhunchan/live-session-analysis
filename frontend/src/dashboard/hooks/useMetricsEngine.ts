import { useState, useEffect, useRef, useCallback } from 'react';
import { EventBus } from '../../core/EventBus';
import { MetricsEngine } from '../../core/MetricsEngine';
import { VideoPipeline } from '../../video/VideoPipeline';
import { AudioPipeline } from '../../audio/AudioPipeline';
import { VadManager } from '../../audio/VadManager';
import { StreamManager } from '../../core/StreamManager';
import { NudgeEngine } from '../../coaching/NudgeEngine';
import type { IFaceDetector } from '../../video/FaceDetector';
import type { MetricSnapshot, MetricDataPoint, Nudge } from '../../types';
import { EventType } from '../../types';

export interface UseMetricsEngineReturn {
  snapshot: MetricSnapshot | null;
  history: MetricSnapshot[];
  nudges: Nudge[];
  isRunning: boolean;
  start: (detector: IFaceDetector) => Promise<void>;
  stop: () => void;
  resetHistory: () => void;
  eventBus: EventBus;
  streamManager: StreamManager;
}

export function useMetricsEngine(sessionId = 'session-1'): UseMetricsEngineReturn {
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [history, setHistory] = useState<MetricSnapshot[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const eventBusRef = useRef(new EventBus());
  const metricsEngineRef = useRef<MetricsEngine | null>(null);
  const videoPipelineRef = useRef<VideoPipeline | null>(null);
  const audioPipelineRef = useRef<AudioPipeline | null>(null);
  const vadManagerRef = useRef<VadManager | null>(null);
  const streamManagerRef = useRef(new StreamManager({ videoFps: 2, audioSampleHz: 20 }));
  const nudgeEngineRef = useRef<NudgeEngine | null>(null);

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

  const start = useCallback(async (detector: IFaceDetector) => {
    const bus = eventBusRef.current;
    const sm = streamManagerRef.current;

    // Create engines
    const me = new MetricsEngine({ sessionId, snapshotIntervalMs: 500 });
    const vp = new VideoPipeline(detector, bus);
    const ap = new AudioPipeline(bus);
    const vadManager = new VadManager();

    ap.setVadManager(vadManager);

    metricsEngineRef.current = me;
    videoPipelineRef.current = vp;
    audioPipelineRef.current = ap;
    vadManagerRef.current = vadManager;

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
    const startVadForRole = async (role: 'tutor' | 'student') => {
      const stream = sm.getStream(role);
      if (stream) {
        try {
          await vadManager.startForParticipant(role, stream);
        } catch (err) {
          console.warn(`[VadManager] Failed to start VAD for ${role}:`, err);
        }
      }
    };
    Promise.all([startVadForRole('tutor'), startVadForRole('student')]).catch(() => {
      // Silently degrade — AudioPipeline falls back to isSpeaking=false
    });
  }, [sessionId]);

  const stop = useCallback(() => {
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
    isRunning,
    start,
    stop,
    resetHistory,
    eventBus: eventBusRef.current,
    streamManager: streamManagerRef.current,
  };
}
