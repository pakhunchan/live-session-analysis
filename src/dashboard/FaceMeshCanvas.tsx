import React, { useRef, useEffect } from 'react';

// === Landmarks used by the metrics pipeline ===
//
// Gaze (gazeEstimation.ts):
//   468/473 iris centers, 33/133/159/145 left eye, 362/263/386/374 right eye
//   1 nose tip, 152 chin, 234 left ear, 454 right ear
//
// Expression (expressionAnalysis.ts):
//   105/334 brows, 13/14 inner lips, 0/17 outer lips, 61/291 mouth corners
//   50/280 cheeks (Duchenne smile), 386/374 right eye (bilateral)
//
// Visualization: full contours from FACEMESH_NOSE, FACEMESH_LIPS, FACEMESH_FACE_OVAL

// Iris rings (468-472 left, 473-477 right)
const IRIS_CONNECTIONS: [number, number][] = [
  [468, 469], [469, 470], [470, 471], [471, 472], [472, 468],
  [473, 474], [474, 475], [475, 476], [476, 477], [477, 473],
];

// Eye boxes — the bounding region used for gaze ratio computation
const EYE_CONNECTIONS: [number, number][] = [
  [33, 159], [159, 133], [133, 145], [145, 33],
  [362, 386], [386, 263], [263, 374], [374, 362],
];

// Full lip contour (from FACEMESH_LIPS) — lip openness + smile width
const LIP_CONNECTIONS: [number, number][] = [
  // Outer upper lip: left corner → cupid's bow (0) → right corner
  [61, 185], [185, 40], [40, 39], [39, 37], [37, 0],
  [0, 267], [267, 269], [269, 270], [270, 409], [409, 291],
  // Outer lower lip: left corner → bottom center (17) → right corner
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17],
  [17, 314], [314, 405], [405, 321], [321, 375], [375, 291],
  // Inner upper lip
  [78, 191], [191, 80], [80, 81], [81, 82], [82, 13],
  [13, 312], [312, 311], [311, 310], [310, 415], [415, 308],
  // Inner lower lip
  [78, 95], [95, 88], [88, 178], [178, 87], [87, 14],
  [14, 317], [317, 402], [402, 318], [318, 324], [324, 308],
];

// Eyebrow outlines (from FACEMESH_LEFT/RIGHT_EYEBROW)
const BROW_CONNECTIONS: [number, number][] = [
  // Right eyebrow
  [46, 53], [53, 52], [52, 65], [65, 55],
  [70, 63], [63, 105], [105, 66], [66, 107],
  // Left eyebrow
  [276, 283], [283, 282], [282, 295], [295, 285],
  [300, 293], [293, 334], [334, 296], [296, 336],
];

// Nose structure (from FACEMESH_NOSE) — bridge, tip, nostrils
const NOSE_CONNECTIONS: [number, number][] = [
  // Bridge: nasion (between brows) → nose tip
  [168, 6], [6, 197], [197, 195], [195, 5], [5, 4], [4, 1],
  // Subnasal area
  [1, 19], [19, 94], [94, 2], [2, 97], [97, 98],
  [2, 326], [326, 327], [327, 294],
  // Right nostril wing
  [294, 278], [278, 344], [344, 440], [440, 275], [275, 4],
  // Left nostril wing
  [4, 45], [45, 220], [220, 115], [115, 48], [48, 64], [64, 98],
];

// Jawline — lower arc of FACEMESH_FACE_OVAL (ear to ear via chin)
const JAWLINE_CONNECTIONS: [number, number][] = [
  // Right jaw: ear → chin
  [454, 323], [323, 361], [361, 288], [288, 397], [397, 365],
  [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  // Left jaw: chin → ear
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136],
  [136, 172], [172, 58], [58, 132], [132, 93], [93, 234],
];

// Head pose reference — nose/chin (pitch) + ears (yaw)
const HEAD_POSE_CONNECTIONS: [number, number][] = [
  [1, 152],              // nose → chin (pitch axis)
  [234, 1], [1, 454],   // left ear → nose → right ear (yaw axis)
];

// Only landmarks that feed into pipeline computation get yellow dots.
// Connection lines (lips, nose, jawline, brows) still draw for anatomical context.
const PIPELINE_LANDMARKS = [
  468, 473,                 // iris centers (gaze)
  33, 133, 159, 145,        // left eye (gaze + expression)
  362, 263, 386, 374,       // right eye (gaze + expression)
  105, 334,                 // brows L/R (expression)
  0, 13, 14, 17, 61, 291,  // lips inner/outer/corners (expression)
  50, 280,                  // cheeks (Duchenne smile)
  1, 152, 234, 454,         // nose tip, chin, ears (head pose)
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
            ctx!.strokeStyle = color;
            ctx!.lineWidth = width;
            ctx!.beginPath();
            for (const [a, b] of conns) {
              if (a < lm.length && b < lm.length) {
                ctx!.moveTo(lm[a].x * w, lm[a].y * h);
                ctx!.lineTo(lm[b].x * w, lm[b].y * h);
              }
            }
            ctx!.stroke();
          }

          // Eye boxes (blue) — gaze ratio bounding regions
          draw(EYE_CONNECTIONS, 'rgba(66, 133, 244, 0.7)', 1.5);

          // Lip contour (blue) — inner + outer lip shape
          draw(LIP_CONNECTIONS, 'rgba(66, 133, 244, 0.7)', 1.5);

          // Brow (blue) — brow-eye distance
          draw(BROW_CONNECTIONS, 'rgba(66, 133, 244, 0.5)', 1);

          // Nose (blue) — bridge + nostrils
          draw(NOSE_CONNECTIONS, 'rgba(66, 133, 244, 0.5)', 1);

          // Jawline (faint red) — chin/jaw contour
          draw(JAWLINE_CONNECTIONS, 'rgba(220, 53, 69, 0.3)', 1);

          // Head pose axes (red/orange) — yaw + pitch reference
          draw(HEAD_POSE_CONNECTIONS, 'rgba(220, 53, 69, 0.6)', 1.5);

          // Iris rings (green)
          draw(IRIS_CONNECTIONS, 'rgba(52, 168, 83, 0.9)', 1.5);

          // Pipeline landmarks (yellow dots) — only points that feed into metrics
          ctx.fillStyle = 'rgba(251, 188, 4, 0.9)';
          for (const idx of PIPELINE_LANDMARKS) {
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
