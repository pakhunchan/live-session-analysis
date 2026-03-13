# Refactor: WebSocket relay is broken in production

## Problem

The WebSocket metrics relay (`/ws/metrics`) has never worked in production. `vercel.json` only rewrites `/api/:path*` to the backend ALB — there is no rewrite for WebSocket connections. Both tutor and student WebSocket connections hit Vercel, which doesn't support WebSocket proxying for static sites, so they silently fail and reconnect in a loop.

## Why it wasn't noticed

All metrics displayed on the tutor dashboard are produced **locally** on the tutor device:

| Metric | Source |
|---|---|
| Tutor video (face detection, eye contact) | Tutor's local camera → tutor's VideoPipeline |
| Student audio (talk time, energy, speaking) | Student's remote WebRTC audio stream → tutor's local AudioPipeline (via `StreamManager.setStream`) |
| Student video (face detection, eye contact) | Student's remote WebRTC video element → tutor's local VideoPipeline (via `StreamManager.setVideoElement`) |

Since the tutor processes everything locally, the WebSocket relay being broken had zero impact — until the "each device processes its own video" change (commit `7e01875`), which removed the tutor's local processing of student video and relied on the student sending video metrics via WebSocket.

## Current state (reverted)

The tutor still processes student video locally. The WebSocket relay remains broken but unused for any critical path.

## What needs to happen

### 1. Fix the WebSocket connection

Options (pick one):

- **Set `VITE_WS_URL` in `frontend/.env.production`** to point directly at the backend ALB with `wss://`. Requires TLS on the ALB (ACM cert + HTTPS listener). Current ALB URL: `http://LiveSe-Servi-QipAb0OQKBIb-2082207685.us-west-2.elb.amazonaws.com`
- **Add a custom domain with TLS for the backend** (e.g., `api.pakhunchan.com`) and set `VITE_WS_URL=wss://api.pakhunchan.com/ws/metrics`
- **Move to a hosting platform that supports WebSocket proxying** (e.g., self-hosted, CloudFront in front of ALB)

Note: Vercel does not support WebSocket rewrites for static sites, so adding a `/ws` rewrite to `vercel.json` will not work.

### 2. Verify the relay works end-to-end

Once WebSocket connectivity is fixed, verify:

1. Student device connects to `/ws/metrics` and sends `join` message
2. Student's VideoPipeline produces video metrics and sends them via `transport.send()`
3. Backend relay receives and forwards to tutor (relay code at `backend/server/ws/metricsRelay.ts` is correct — only student→tutor direction)
4. Tutor receives and ingests via `transport.onRemoteMetrics` → `metricsEngine.ingestDataPoint`

### 3. Then re-apply the "each device processes its own" architecture

Once WebSocket is verified working:

- **`useMetricsEngine.ts`**: Remove the `if (dp.source === 'video') return;` filter in `transport.onRemoteMetrics`
- **`Dashboard.tsx`**: Guard `handleStudentVideoElement` with `myRole === 'student'` so tutor doesn't register student video on its StreamManager

### 4. Secondary issue: student sends tutor video metrics

On the student device, `handleTutorVideoElement` registers the tutor's remote video element on `student.streamManager`. This causes `sampleVideoFrames` to produce frames for both participants. The student then sends VIDEO_METRICS with `participant: 'tutor'` via WebSocket, which the relay forwards to the tutor and **overwrites the tutor's own locally-computed video metrics**.

Fix: apply the same guard pattern — only register the tutor video element when `myRole === 'tutor'`:

```typescript
const handleTutorVideoElement = useCallback((el: HTMLVideoElement | null) => {
  if (el && myRole === 'tutor') streamManager.setVideoElement('tutor', el);
}, [streamManager, myRole]);
```

## Files involved

| File | Role |
|---|---|
| `vercel.json` | Missing WebSocket rewrite (root cause) |
| `frontend/.env.production` | Missing `VITE_WS_URL` |
| `frontend/src/core/MetricsTransport.ts` | Client WebSocket — constructs URL from `window.location` if no env var |
| `backend/server/ws/metricsRelay.ts` | Server relay — code is correct, just unreachable |
| `frontend/src/dashboard/hooks/useMetricsEngine.ts` | Tutor ingestion of remote metrics |
| `frontend/src/dashboard/Dashboard.tsx` | Video element registration on StreamManager |
