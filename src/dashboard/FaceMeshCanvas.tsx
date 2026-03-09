import React, { useRef, useEffect } from 'react';

// === Every landmark our metrics pipeline actually reads ===
//
// Gaze estimation (gazeEstimation.ts):
//   468 left iris center, 473 right iris center
//   33/133 left eye outer/inner, 362/263 right eye outer/inner
//   159/145 left eye top/bottom, 386/374 right eye top/bottom
//   1 nose tip, 152 chin, 234 left ear, 454 right ear
//
// Expression fallback (expressionAnalysis.ts):
//   105 brow, 13/14 upper/lower lip, 61/291 mouth corners

// Iris rings (468-472 left, 473-477 right)
const IRIS_CONNECTIONS: [number, number][] = [
  [468, 469], [469, 470], [470, 471], [471, 472], [472, 468],
  [473, 474], [474, 475], [475, 476], [476, 477], [477, 473],
];

// Eye boxes — the bounding region used for gaze ratio computation
const EYE_CONNECTIONS: [number, number][] = [
  // Left eye box: outer → top → inner → bottom → outer
  [33, 159], [159, 133], [133, 145], [145, 33],
  // Right eye box: outer → top → inner → bottom → outer
  [362, 386], [386, 263], [263, 374], [374, 362],
];

// Mouth outline — lip openness + smile width
const MOUTH_CONNECTIONS: [number, number][] = [
  [61, 13], [13, 291], [291, 14], [14, 61],
];

// Head pose reference — nose/chin (pitch) + ears (yaw)
const HEAD_POSE_CONNECTIONS: [number, number][] = [
  [1, 152],        // nose → chin (pitch axis)
  [234, 1], [1, 454],  // left ear → nose → right ear (yaw axis)
];

// Brow → eye top (brow position measurement)
const BROW_CONNECTIONS: [number, number][] = [
  [105, 159],  // brow landmark → left eye top
];

// All landmark indices used by the pipeline (for orange dots)
const ALL_LANDMARKS = [
  468, 473,               // iris centers
  33, 133, 159, 145,      // left eye corners
  362, 263, 386, 374,     // right eye corners
  1, 152, 234, 454,       // head pose
  105,                     // brow
  13, 14, 61, 291,        // mouth
];

interface FaceMeshCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export default function FaceMeshCanvas({ videoRef }: FaceMeshCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let landmarker: any = null;
    let animFrameId = 0;
    let running = true;

    async function init() {
      const vision = await import('@mediapipe/tasks-vision');
      const { FaceLandmarker, FilesetResolver } = vision;

      if (!running) return;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      );

      if (!running) return;

      landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      if (!running) { landmarker.close(); return; }

      let lastDetectTime = 0;

      function drawFrame() {
        if (!running) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !landmarker) {
          animFrameId = requestAnimationFrame(drawFrame);
          return;
        }

        if (video.readyState < 2) {
          animFrameId = requestAnimationFrame(drawFrame);
          return;
        }

        // Sync canvas size
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
          canvas.width = video.clientWidth;
          canvas.height = video.clientHeight;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          animFrameId = requestAnimationFrame(drawFrame);
          return;
        }

        const now = performance.now();
        if (now <= lastDetectTime) {
          animFrameId = requestAnimationFrame(drawFrame);
          return;
        }
        lastDetectTime = now;

        const result = landmarker.detectForVideo(video, now);
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          const lm = result.faceLandmarks[0];

          function draw(conns: [number, number][], color: string, width: number) {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            for (const [a, b] of conns) {
              if (a < lm.length && b < lm.length) {
                ctx.moveTo(lm[a].x * w, lm[a].y * h);
                ctx.lineTo(lm[b].x * w, lm[b].y * h);
              }
            }
            ctx.stroke();
          }

          // Eye boxes (blue) — gaze ratio bounding regions
          draw(EYE_CONNECTIONS, 'rgba(66, 133, 244, 0.7)', 1.5);

          // Mouth (blue) — lip openness + smile width
          draw(MOUTH_CONNECTIONS, 'rgba(66, 133, 244, 0.7)', 1.5);

          // Brow (blue) — brow-eye distance
          draw(BROW_CONNECTIONS, 'rgba(66, 133, 244, 0.5)', 1);

          // Head pose axes (red/orange) — yaw + pitch reference
          draw(HEAD_POSE_CONNECTIONS, 'rgba(220, 53, 69, 0.6)', 1.5);

          // Iris rings (green)
          draw(IRIS_CONNECTIONS, 'rgba(52, 168, 83, 0.9)', 1.5);

          // All used landmarks (orange dots)
          ctx.fillStyle = 'rgba(251, 188, 4, 0.9)';
          for (const idx of ALL_LANDMARKS) {
            if (idx < lm.length) {
              ctx.beginPath();
              ctx.arc(lm[idx].x * w, lm[idx].y * h, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        animFrameId = requestAnimationFrame(drawFrame);
      }

      animFrameId = requestAnimationFrame(drawFrame);
    }

    init().catch(console.error);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameId);
      if (landmarker) {
        landmarker.close();
      }
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
