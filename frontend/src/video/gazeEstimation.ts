import type { FaceLandmark } from './FaceDetector';

export interface GazeEstimate {
  horizontalRatio: number;  // 0=left, 0.5=center, 1=right
  verticalRatio: number;    // 0=up, 0.5=center, 1=down
  headYawDeg: number;       // negative=turned left, positive=turned right
  headPitchDeg: number;     // negative=looking up, positive=looking down
}

// Key landmark indices
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_OUTER = 362;
const RIGHT_EYE_INNER = 263;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_EAR = 234;
const RIGHT_EAR = 454;

function safeLandmark(landmarks: FaceLandmark[], index: number): FaceLandmark | null {
  return index < landmarks.length ? landmarks[index] : null;
}

function computeHorizontalRatio(
  iris: FaceLandmark,
  outer: FaceLandmark,
  inner: FaceLandmark,
): number {
  const eyeWidth = inner.x - outer.x;
  if (Math.abs(eyeWidth) < 1e-6) return 0.5;
  return (iris.x - outer.x) / eyeWidth;
}

function computeVerticalRatio(
  iris: FaceLandmark,
  top: FaceLandmark,
  bottom: FaceLandmark,
): number {
  const eyeHeight = bottom.y - top.y;
  if (Math.abs(eyeHeight) < 1e-6) return 0.5;
  return (iris.y - top.y) / eyeHeight;
}

export function estimateGaze(landmarks: FaceLandmark[]): GazeEstimate {
  // Need at least iris landmarks (index 473 = minimum 474 landmarks)
  if (landmarks.length < 474) {
    return { horizontalRatio: 0.5, verticalRatio: 0.5, headYawDeg: 0, headPitchDeg: 0 };
  }

  const leftIris = safeLandmark(landmarks, LEFT_IRIS_CENTER)!;
  const rightIris = safeLandmark(landmarks, RIGHT_IRIS_CENTER)!;
  const leftOuter = safeLandmark(landmarks, LEFT_EYE_OUTER)!;
  const leftInner = safeLandmark(landmarks, LEFT_EYE_INNER)!;
  const rightOuter = safeLandmark(landmarks, RIGHT_EYE_OUTER)!;
  const rightInner = safeLandmark(landmarks, RIGHT_EYE_INNER)!;
  const leftTop = safeLandmark(landmarks, LEFT_EYE_TOP)!;
  const leftBottom = safeLandmark(landmarks, LEFT_EYE_BOTTOM)!;
  const rightTop = safeLandmark(landmarks, RIGHT_EYE_TOP)!;
  const rightBottom = safeLandmark(landmarks, RIGHT_EYE_BOTTOM)!;

  // Average horizontal ratio from both eyes
  const leftH = computeHorizontalRatio(leftIris, leftOuter, leftInner);
  const rightH = computeHorizontalRatio(rightIris, rightOuter, rightInner);
  const horizontalRatio = (leftH + rightH) / 2;

  // Average vertical ratio from both eyes
  const leftV = computeVerticalRatio(leftIris, leftTop, leftBottom);
  const rightV = computeVerticalRatio(rightIris, rightTop, rightBottom);
  const verticalRatio = (leftV + rightV) / 2;

  // Head pose estimation from nose, chin, ears
  const nose = safeLandmark(landmarks, NOSE_TIP)!;
  const chin = safeLandmark(landmarks, CHIN)!;
  const leftEar = safeLandmark(landmarks, LEFT_EAR)!;
  const rightEar = safeLandmark(landmarks, RIGHT_EAR)!;

  // Yaw: nose position relative to ear midpoint
  // Landmarks 234/454 are cheek-boundary points (not ear tips), so the
  // baseline is narrow.  A scaling factor of 25 (not 45) prevents a
  // forward-facing person from registering 40°+ yaw.
  const earMidX = (leftEar.x + rightEar.x) / 2;
  const earWidth = rightEar.x - leftEar.x;
  const headYawDeg = earWidth > 1e-6
    ? ((nose.x - earMidX) / (earWidth / 2)) * 25
    : 0;

  // Pitch: nose-chin depth ratio.  MediaPipe z-values are noisy and the
  // nose always protrudes, so we use a conservative multiplier of 35
  // (not 60) to avoid false high-pitch readings.
  const faceHeight = chin.y - nose.y;
  const headPitchDeg = faceHeight > 1e-6
    ? ((nose.z - chin.z) / faceHeight) * 35
    : 0;

  return { horizontalRatio, verticalRatio, headYawDeg, headPitchDeg };
}
