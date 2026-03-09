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
    const eyeContact = classifyEyeContact(gaze);

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

    const exprResult = computeExpressionEnergy(features, history, undefined, pitchHist);

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
    };

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
