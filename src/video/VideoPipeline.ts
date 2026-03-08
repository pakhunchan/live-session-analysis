import type { EventBus } from '../core/EventBus';
import type { FrameData, MetricDataPoint, ParticipantRole } from '../types';
import { EventType } from '../types';
import type { IFaceDetector, FaceLandmark } from './FaceDetector';
import { estimateGaze } from './gazeEstimation';
import { classifyEyeContact } from './eyeContactClassifier';
import {
  extractBlendshapeFeatures,
  extractLandmarkFeatures,
  computeHeadMovement,
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

  private previousLandmarks: Record<ParticipantRole, FaceLandmark[] | null> = {
    tutor: null,
    student: null,
  };
  private previousTimestamp: Record<ParticipantRole, number> = {
    tutor: 0,
    student: 0,
  };
  private expressionHistory: Record<ParticipantRole, ExpressionFeatures[]> = {
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
    let features: ExpressionFeatures;
    if (result.blendshapes && result.blendshapes.length > 0) {
      features = extractBlendshapeFeatures(result.blendshapes);
    } else {
      features = extractLandmarkFeatures(result.landmarks);
    }

    // Head movement
    const deltaMs = frame.timestamp - (this.previousTimestamp[frame.participant] || frame.timestamp);
    const headMovement = computeHeadMovement(
      result.landmarks,
      this.previousLandmarks[frame.participant],
      deltaMs,
    );
    features = { ...features, headMovement };

    // Update history
    const history = this.expressionHistory[frame.participant];
    history.push(features);
    if (history.length > this.config.expressionHistorySize) {
      history.shift();
    }

    const expressionEnergy = computeExpressionEnergy(features, history);

    // Store for next frame
    this.previousLandmarks[frame.participant] = result.landmarks;
    this.previousTimestamp[frame.participant] = frame.timestamp;

    const dp: MetricDataPoint = {
      source: 'video',
      participant: frame.participant,
      timestamp: frame.timestamp,
      faceDetected: true,
      faceConfidence: result.confidence,
      eyeContact,
      expressionEnergy,
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
