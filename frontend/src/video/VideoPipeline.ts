import type { EventBus } from '../core/EventBus';
import type { FrameData, MetricDataPoint, ParticipantRole } from '../types';
import { EventType } from '../types';
import type { IFaceDetector } from './FaceDetector';
import { estimateGaze } from './gazeEstimation';
import { classifyEyeContact } from './eyeContactClassifier';
import {
  extractBlendshapeFeatures,
  extractLandmarkFeatures,
  computeExpressionEnergy,
  type ExpressionFeatures,
} from './expressionAnalysis';

export interface VideoPipelineConfig {
  confidenceThreshold: number;
  expressionHistorySize: number;
}

const DEFAULT_CONFIG: VideoPipelineConfig = {
  confidenceThreshold: 0.7,
  expressionHistorySize: 10,
};

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(v);
}

export class VideoPipeline {
  private detector: IFaceDetector;
  private eventBus: EventBus;
  private config: VideoPipelineConfig;

  private expressionHistory: Record<ParticipantRole, ExpressionFeatures[]> = {
    tutor: [],
    student: [],
  };

  private pitchHistory: Record<ParticipantRole, number[]> = {
    tutor: [],
    student: [],
  };

  private gazeHistory: Record<ParticipantRole, { x: number; y: number }[]> = {
    tutor: [],
    student: [],
  };

  private lastEyeContact: Record<ParticipantRole, number> = { tutor: 0, student: 0 };
  private lastEnergy: Record<ParticipantRole, number> = { tutor: 0, student: 0 };

  private static readonly GAZE_HISTORY_SIZE = 100;

  private totalFrames = 0;
  private degradedFrames = 0;

  constructor(
    detector: IFaceDetector,
    eventBus: EventBus,
    config: Partial<VideoPipelineConfig> = {},
  ) {
    this.detector = detector;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async processFrame(frame: FrameData): Promise<void> {
    this.totalFrames++;

    const result = await this.detector.detect(frame.imageData as HTMLVideoElement);

    if (!result || result.confidence < this.config.confidenceThreshold) {
      this.degradedFrames++;

      const dp: MetricDataPoint = {
        source: 'video',
        participant: frame.participant,
        timestamp: frame.timestamp,
        faceDetected: false,
        faceConfidence: result?.confidence ?? 0,
        eyeContact: 0,
        expressionEnergy: 0,
      };

      this.eventBus.emit(EventType.VIDEO_METRICS, dp);
      return;
    }

    // Eye contact
    const gaze = estimateGaze(result.landmarks);
    // During blinks, iris landmarks are unreliable — hold the last open-eye value
    const rawEyeContact = classifyEyeContact(gaze);

    // Expression features
    const features: ExpressionFeatures =
      result.blendshapes && result.blendshapes.length > 0
        ? extractBlendshapeFeatures(result.blendshapes)
        : extractLandmarkFeatures(result.landmarks);

    // Update expression history
    const history = this.expressionHistory[frame.participant];
    history.push(features);
    if (history.length > this.config.expressionHistorySize) {
      history.shift();
    }

    // Update pitch history (for head nod detection)
    const pitchHist = this.pitchHistory[frame.participant];
    if (result.headPose) {
      pitchHist.push(result.headPose.pitch);
      if (pitchHist.length > this.config.expressionHistorySize) {
        pitchHist.shift();
      }
    }

    // Update gaze history (for gaze variation — eye wandering detection)
    // Gate: skip when eyes are partially or fully closed — iris landmarks are unreliable
    const gazeHist = this.gazeHistory[frame.participant];
    if (features.eyeOpenness > 0.6) {
      gazeHist.push({ x: gaze.horizontalRatio, y: gaze.verticalRatio });
      if (gazeHist.length > VideoPipeline.GAZE_HISTORY_SIZE) {
        gazeHist.shift();
      }
    }

    // Gaze variation: EMA of frame-to-frame gaze deltas.
    // Responds instantly when eyes start moving, decays within ~1s when steady.
    // Clamp per-frame deltas to reject residual blink artifacts that slip through.
    const MAX_GAZE_DELTA = 0.15;
    let gazeVariationX = 0;
    if (gazeHist.length >= 2) {
      const decay = 0.2;
      let emaX = 0;
      for (let i = 1; i < gazeHist.length; i++) {
        const dx = Math.abs(gazeHist[i].x - gazeHist[i - 1].x);
        emaX = decay * emaX + (1 - decay) * Math.min(dx, MAX_GAZE_DELTA);
      }
      gazeVariationX = Math.min(1, emaX * 20);
    }

    const exprResult = computeExpressionEnergy(features, history, undefined, pitchHist, this.lastEnergy[frame.participant]);
    this.lastEnergy[frame.participant] = exprResult.energy;

    // Blink gate: when blinkActivity >= 15%, only allow eye contact to increase (not decrease).
    // This prevents blink-induced iris noise from dragging the score down.
    const last = this.lastEyeContact[frame.participant];
    const eyesReliable = features.eyeOpenness >= 0.7 && exprResult.blinkActivity < 0.15;
    const eyeContact = eyesReliable
      ? rawEyeContact
      : Math.max(rawEyeContact, last);
    this.lastEyeContact[frame.participant] = eyeContact;

    const dp: MetricDataPoint = {
      source: 'video',
      participant: frame.participant,
      timestamp: frame.timestamp,
      faceDetected: true,
      faceConfidence: result.confidence,
      eyeContact,
      expressionEnergy: exprResult.energy,
      // Computed activity scores (variance-based)
      blinkActivity: exprResult.blinkActivity,
      browActivity: exprResult.browActivity,
      lipActivity: exprResult.lipActivity,
      genuineSmile: exprResult.genuineSmile,
      // New engagement metrics (debug only)
      headNodActivity: exprResult.headNodActivity,
      eyeWideness: exprResult.eyeWideness,
      lipTension: exprResult.lipTension,
      gazeVariationX,
    };

    // Latency trace — sample ~1 per second
    const now = Date.now();
    if (now % 1000 < 55) {
      dp._trace = { t0_capture: frame.timestamp, t1_processed: now, t2_sent: 0 };
    }

    this.eventBus.emit(EventType.VIDEO_METRICS, dp);
  }

  getDegradationRate(): number {
    return this.totalFrames > 0 ? this.degradedFrames / this.totalFrames : 0;
  }

  getTotalFrames(): number {
    return this.totalFrames;
  }

  getDegradedFrames(): number {
    return this.degradedFrames;
  }
}
