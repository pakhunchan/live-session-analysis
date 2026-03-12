import { useState, useRef, useCallback } from 'react';
import { EventBus } from '../../core/EventBus';
import { VideoPipeline } from '../../video/VideoPipeline';
import { AudioPipeline } from '../../audio/AudioPipeline';
import { VadManager } from '../../audio/VadManager';
import { StreamManager } from '../../core/StreamManager';
import { MetricsTransport } from '../../core/MetricsTransport';
import type { IFaceDetector } from '../../video/FaceDetector';
import type { MetricDataPoint } from '../../types';
import { EventType } from '../../types';

const WS_BASE = import.meta.env.VITE_WS_URL as string | undefined;

export interface UseStudentPipelineReturn {
  isRunning: boolean;
  start: (detector: IFaceDetector, roomName: string) => Promise<void>;
  stop: () => void;
  startVadForStream: (stream: MediaStream) => Promise<void>;
  streamManager: StreamManager;
}

export function useStudentPipeline(): UseStudentPipelineReturn {
  const [isRunning, setIsRunning] = useState(false);

  const eventBusRef = useRef(new EventBus());
  const videoPipelineRef = useRef<VideoPipeline | null>(null);
  const audioPipelineRef = useRef<AudioPipeline | null>(null);
  const vadManagerRef = useRef<VadManager | null>(null);
  const streamManagerRef = useRef(new StreamManager({ videoFps: 2, audioSampleHz: 20 }));
  const transportRef = useRef<MetricsTransport | null>(null);

  const start = useCallback(async (detector: IFaceDetector, roomName: string) => {
    const bus = eventBusRef.current;
    const sm = streamManagerRef.current;

    const vp = new VideoPipeline(detector, bus);
    const ap = new AudioPipeline(bus);
    const vadManager = new VadManager();
    ap.setVadManager(vadManager);

    videoPipelineRef.current = vp;
    audioPipelineRef.current = ap;
    vadManagerRef.current = vadManager;

    // Set up MetricsTransport to send data points to backend
    const transport = new MetricsTransport();
    transportRef.current = transport;

    const wsUrl = WS_BASE || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/metrics`;
    transport.connect(wsUrl, roomName, 'student');

    // Wire pipeline events → transport (send all data points to backend)
    bus.on<MetricDataPoint>(EventType.VIDEO_METRICS, (event) => {
      transport.send(event.payload);
    });
    bus.on<MetricDataPoint>(EventType.AUDIO_METRICS, (event) => {
      transport.send(event.payload);
    });

    // Wire StreamManager callbacks
    sm.onFrame(async (frame) => {
      await vp.processFrame(frame);
    });
    sm.onAudioChunk((chunk) => {
      ap.processChunk(chunk);
    });

    sm.start();
    setIsRunning(true);

    // Start VAD for student's own stream in background
    const stream = sm.getStream('student');
    if (stream) {
      try {
        await vadManager.startForParticipant('student', stream);
      } catch (err) {
        console.warn('[useStudentPipeline] Failed to start VAD:', err);
      }
    }
  }, []);

  const startVadForStream = useCallback(async (stream: MediaStream) => {
    const vadManager = vadManagerRef.current;
    if (!vadManager) return;
    try {
      await vadManager.startForParticipant('student', stream);
    } catch (err) {
      console.warn('[useStudentPipeline] Failed to start VAD:', err);
    }
  }, []);

  const stop = useCallback(() => {
    transportRef.current?.dispose();
    transportRef.current = null;
    streamManagerRef.current.stop();
    vadManagerRef.current?.destroy();
    vadManagerRef.current = null;
    setIsRunning(false);
  }, []);

  return {
    isRunning,
    start,
    stop,
    startVadForStream,
    streamManager: streamManagerRef.current,
  };
}
