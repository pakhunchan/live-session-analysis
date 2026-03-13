export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface BlendshapeEntry {
  categoryName: string;
  score: number;
}

export interface HeadPose {
  pitch: number;  // radians, positive = looking up
  yaw: number;    // radians, positive = looking right
  roll: number;   // radians, positive = tilting right
}

export interface FaceDetectionResult {
  landmarks: FaceLandmark[];
  blendshapes: BlendshapeEntry[] | null;
  confidence: number;
  headPose?: HeadPose;
}

export interface IFaceDetector {
  detect(image: HTMLVideoElement | ImageBitmap): Promise<FaceDetectionResult | null>;
  isReady(): boolean;
}

/**
 * Extract Euler angles (pitch, yaw, roll) from a column-major 4×4 transformation matrix.
 * Uses ZYX decomposition. Returns undefined if matrix data is unavailable.
 */
export function extractHeadPose(matrixData: Float32Array | number[] | undefined): HeadPose | undefined {
  if (!matrixData || matrixData.length < 16) return undefined;

  // Column-major indexing: m[row][col] = data[col * 4 + row]
  const m00 = matrixData[0];
  const m10 = matrixData[1];
  const m20 = matrixData[2];
  const m21 = matrixData[6];
  const m22 = matrixData[10];

  // ZYX Euler decomposition, mapped to face-tracking convention:
  // pitch = X rotation (nodding), yaw = Y rotation (turning), roll = Z rotation (tilting)
  const pitch = Math.atan2(m21, m22);  // rotation around X axis (nodding up/down)
  const yaw = Math.asin(-clamp(m20, -1, 1));  // rotation around Y axis (looking left/right)
  const roll = Math.atan2(m10, m00);  // rotation around Z axis (head tilt)

  return { pitch, yaw, roll };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });

    this.ready = true;
  }

  async detect(image: HTMLVideoElement | ImageBitmap): Promise<FaceDetectionResult | null> {
    if (!this.landmarker) return null;

    // For live video elements (especially WebRTC remote streams), snapshot the
    // current frame to an ImageBitmap before passing to IMAGE-mode detect().
    // IMAGE mode's detect() can miss the current GPU texture on live video
    // elements — the texture from network-decoded frames may not be
    // synchronously available, causing detect() to return empty results.
    // Converting to ImageBitmap forces a reliable pixel read from the video.
    let source: HTMLVideoElement | ImageBitmap = image;
    if (image instanceof HTMLVideoElement && image.videoWidth > 0 && image.videoHeight > 0) {
      try {
        source = await createImageBitmap(image);
      } catch {
        // Fall back to the video element if bitmap creation fails
      }
    }

    const result = this.landmarker.detect(source);

    // Clean up the ImageBitmap to avoid memory leaks
    if (source !== image && source instanceof ImageBitmap) {
      source.close();
    }

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null;
    }

    const landmarks: FaceLandmark[] = result.faceLandmarks[0];
    const confidence = result.faceBlendshapes?.[0]
      ? 0.95  // blendshapes present = high confidence
      : landmarks.length >= 468 ? 0.85 : 0.5;

    const blendshapes: BlendshapeEntry[] | null = result.faceBlendshapes?.[0]?.categories ?? null;

    // Extract head pose from facial transformation matrix (column-major 4x4)
    const headPose = extractHeadPose(result.facialTransformationMatrixes?.[0]?.data);

    return { landmarks, blendshapes, confidence, headPose };
  }

  isReady(): boolean {
    return this.ready;
  }
}
