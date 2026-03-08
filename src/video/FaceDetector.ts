export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface BlendshapeEntry {
  categoryName: string;
  score: number;
}

export interface FaceDetectionResult {
  landmarks: FaceLandmark[];
  blendshapes: BlendshapeEntry[] | null;
  confidence: number;
}

export interface IFaceDetector {
  detect(image: HTMLVideoElement | ImageBitmap): Promise<FaceDetectionResult | null>;
  isReady(): boolean;
}

/**
 * MediaPipe FaceLandmarker wrapper.
 * In production, this loads the WASM model. For tests, use MockFaceDetector.
 */
export class MediaPipeFaceDetector implements IFaceDetector {
  private landmarker: any = null;
  private ready = false;

  async initialize(): Promise<void> {
    // Dynamic import to avoid bundling issues
    const vision = await import('@mediapipe/tasks-vision');
    const { FaceLandmarker, FilesetResolver } = vision;

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });

    this.ready = true;
  }

  async detect(image: HTMLVideoElement | ImageBitmap): Promise<FaceDetectionResult | null> {
    if (!this.landmarker) return null;

    const timestamp = performance.now();
    const result = this.landmarker.detectForVideo(image, timestamp);

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null;
    }

    const landmarks: FaceLandmark[] = result.faceLandmarks[0];
    const confidence = result.faceBlendshapes?.[0]
      ? 0.95  // blendshapes present = high confidence
      : landmarks.length >= 468 ? 0.85 : 0.5;

    const blendshapes: BlendshapeEntry[] | null = result.faceBlendshapes?.[0]?.categories ?? null;

    return { landmarks, blendshapes, confidence };
  }

  isReady(): boolean {
    return this.ready;
  }
}
