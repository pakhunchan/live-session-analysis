# Decision Log

Architectural decisions for the Live Session Analysis platform. Each entry documents the decision, alternatives evaluated, rationale, and known trade-offs.

---

## ADR-001: Client-Side Face Detection with MediaPipe

**Decision:** Run MediaPipe FaceLandmarker (WASM, GPU-delegated) in each participant's browser rather than on the server.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) Server-side face detection via LiveKit Egress piped to a GPU instance running Python/OpenCV. (B) Cloud vision API (Google Vision, AWS Rekognition) called per frame. |
| **Rationale** | Privacy is paramount in an educational context -- video frames never leave the participant's device. Latency is also critical: a round trip to a server for each frame at 2 FPS would add 100-300 ms per frame and create a dependency on network quality. Client-side processing eliminates that entirely. MediaPipe's WASM+GPU delegate runs at sub-50 ms per frame on modern hardware, well within the 500 ms snapshot budget. |
| **Trade-offs** | Relies on client hardware (older devices may struggle). The WASM model is ~20 MB on first load. GPU texture access is unreliable for remote WebRTC video elements, which led to the ImageBitmap workaround in `FaceDetector.ts` (see ADR-003). Cannot process the remote participant's video on the tutor's device due to GPU texture issues -- each device must process its own stream. |

**Key files:** `frontend/src/video/FaceDetector.ts`, `frontend/src/video/VideoPipeline.ts`

---

## ADR-002: LiveKit WebRTC for Video/Audio Streaming

**Decision:** Use LiveKit Cloud (SFU architecture) for all real-time video and audio transport between tutor and student.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) Peer-to-peer WebRTC using raw `RTCPeerConnection` with a STUN/TURN server. (B) Daily.co or Twilio Video managed SDKs. (C) Self-hosted Jitsi or mediasoup SFU. |
| **Rationale** | LiveKit provides a managed SFU with built-in simulcast, echo cancellation, noise suppression, and auto-gain control -- all configured declaratively in `LiveKitInputAdapter.ts`. Peer-to-peer WebRTC requires building signaling, TURN fallback, and connectivity negotiation from scratch, and scales poorly beyond 2 participants if the product ever expands. LiveKit's `livekit-client` SDK (v2.17.2) integrates cleanly with React and exposes `MediaStream` objects that can be fed directly into `StreamManager` for metrics analysis. Self-hosted SFU options add operational burden without meaningful benefit at this scale. |
| **Trade-offs** | Vendor dependency on LiveKit Cloud. Monthly cost scales with usage (though minimal for 1:1 sessions). The LiveKit SDK is ~200 KB gzipped. If LiveKit Cloud has an outage, the entire session is blocked -- there is no peer-to-peer fallback. |

**Key files:** `frontend/src/inputs/LiveKitInputAdapter.ts`, `backend/server/routes/` (token generation)

---

## ADR-003: Each Device Processes Its Own Metrics

**Decision:** Each participant's browser runs its own face detection and audio analysis pipelines locally, then sends computed metrics (not raw media) to the backend via WebSocket.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) Tutor device processes both local and remote video/audio streams. (B) Server-side processing of all streams. |
| **Rationale** | The original design had the tutor's browser processing the remote student's video stream via MediaPipe. This failed in practice: MediaPipe's GPU delegate cannot reliably access the GPU texture backing a remote WebRTC `<video>` element. The decoded frames are not synchronously available to `detect()`, causing intermittent empty results. Converting every frame to `ImageBitmap` on the tutor side is too expensive at scale (requires a full pixel readback per frame for both local and remote). The solution: each device runs its own pipeline and sends lightweight metric JSON (~500 bytes per data point) over the existing WebSocket relay. The tutor's `MetricsEngine` fuses local and remote metrics into unified snapshots. |
| **Trade-offs** | Requires the student device to run face detection (additional CPU/GPU load on the student's machine). Adds WebSocket relay latency (~20-80 ms) for student metrics to reach the tutor. Clock synchronization is needed to align timestamps across devices (see ADR-006). |

**Key files:** `frontend/src/core/MetricsEngine.ts`, `frontend/src/core/MetricsTransport.ts`, `backend/server/ws/metricsRelay.ts`

---

## ADR-004: WebSocket Relay for Metrics Transport

**Decision:** Use a persistent WebSocket connection (`/ws/metrics`) between each client and the backend for all real-time metric data, interruption counts, and clock synchronization.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) REST polling (POST metrics every N seconds, GET interruptions). (B) Server-Sent Events (SSE) for server-to-client, REST for client-to-server. (C) LiveKit data channels for metrics transport. |
| **Rationale** | The audio pipeline emits data at 20 Hz and the video pipeline at 2 Hz. REST polling at these rates would create excessive HTTP overhead and add latency from connection setup. SSE is unidirectional and would require a separate REST channel for uploads. LiveKit data channels could work but would couple metrics transport to the video call lifecycle (if the LiveKit connection drops, metrics would also stop). A dedicated WebSocket provides bidirectional, low-latency transport with independent lifecycle, reconnection logic with exponential backoff, and multiplexed message types (`metrics`, `interruptions`, `clock-sync`, `join`). |
| **Trade-offs** | Requires maintaining WebSocket infrastructure on the backend (heartbeat pings, room-based routing, connection lifecycle management). The ALB idle timeout must be set to 120 seconds to accommodate WebSocket keepalive. Sticky sessions (24-hour cookie) are needed because the backend is stateful (in-memory rooms). |

**Key files:** `frontend/src/core/MetricsTransport.ts`, `backend/server/ws/metricsRelay.ts`

---

## ADR-005: Backend-Authoritative Interruption Detection

**Decision:** Detect interruptions on the backend using a watermark-based processor operating on clock-corrected timestamps, rather than on either client.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) Client-side interruption detection on the tutor device using local and remote VAD signals. (B) Client-side detection on each device independently. |
| **Rationale** | Interruption detection requires comparing speech timestamps from two different devices. Client clocks can drift by hundreds of milliseconds. Detecting on the tutor side using relayed VAD signals introduces relay latency that skews overlap measurements. The backend receives audio data points from both participants, applies NTP-style clock offset correction (see ADR-006), and processes events in corrected-timestamp order using a watermark algorithm. This ensures consistent, fair detection regardless of network conditions. The watermark ensures events are processed in order: the detector only processes up to `min(latest_tutor_ts, latest_student_ts)`, buffering out-of-order arrivals. |
| **Trade-offs** | Adds ~1 second of detection latency (the backend broadcasts interruption counts every 1 second). The backend becomes stateful per room (interruption state, speech onset tracking, cooldown timers). Cannot detect interruptions if the WebSocket connection drops. |

**Key files:** `backend/server/ws/interruptionDetector.ts`, `backend/server/ws/metricsRelay.ts`

---

## ADR-006: NTP-Style Clock Synchronization

**Decision:** Implement clock offset estimation between each client and the backend using periodic ping/pong messages with round-trip time compensation.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) Ignore clock differences and use server receive timestamps only. (B) Use LiveKit's synchronized timestamps. (C) Require NTP-synchronized clients. |
| **Rationale** | Cross-device timestamp comparison is required for interruption detection (ADR-005). Client clocks can differ by 100-500 ms. The `MetricsTransport` sends a `clock-sync` message with `clientTs = Date.now()` every 10 seconds. The server responds immediately with `{ clientTs, serverTs }`. The client computes `offset = serverTs - clientTs - rtt/2` and stores the median of the last 5 samples for stability. The backend applies this offset to correct audio timestamps before feeding them into the `InterruptionDetector`. Using server receive timestamps alone would conflate network jitter with actual speech timing. LiveKit timestamps are tied to media frames, not our custom metric pipeline. Requiring NTP on all clients is impractical for a browser application. |
| **Trade-offs** | The offset estimate assumes symmetric network latency (RTT/2 for each direction), which is approximate. Accuracy degrades on asymmetric connections. The 10-second sync interval means offset corrections lag behind sudden clock drift. Five samples provide stability but slow initial convergence to ~50 seconds. |

**Key files:** `frontend/src/core/MetricsTransport.ts` (client-side offset calculation), `backend/server/ws/metricsRelay.ts` (server-side clock-sync-ack and offset application)

---

## ADR-007: Meyda + pitchfinder + vad-web for Audio Analysis

**Decision:** Use Meyda for spectral features (RMS, spectral centroid), pitchfinder's YIN algorithm for pitch tracking, and `@ricky0123/vad-web` for ML-based voice activity detection -- all running in the browser.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) pyAudioAnalysis or librosa on a Python backend. (B) SpeechBrain ONNX models in the browser. (C) TensorFlow.js audio models. (D) Web Audio API `AnalyserNode` only (FFT-based features without libraries). |
| **Rationale** | The "each device processes its own metrics" architecture (ADR-003) requires browser-native audio analysis. Meyda is the most mature browser audio feature extraction library, providing standardized RMS and spectral centroid extraction with correct FFT handling (power-of-two buffer enforcement). pitchfinder's YIN algorithm is lightweight and well-suited for monophonic speech pitch detection. `vad-web` provides ML-based VAD using a Silero ONNX model that outperforms simple RMS thresholding for speech/silence discrimination. Server-side Python libraries would require streaming raw audio to the backend, adding bandwidth (~32 KB/s per participant at 16 kHz mono) and latency. TensorFlow.js audio models are heavier and less focused on the specific features needed. |
| **Trade-offs** | Three separate audio libraries increase bundle size. Meyda requires power-of-two buffer sizes (handled by zero-padding in `voiceEnergy.ts`). `vad-web` loads a ~2 MB ONNX model. The YIN pitch detector can produce false positives on noise (mitigated by RMS gating in `PitchTracker` with a silence threshold of 0.01). A threshold-based fallback VAD runs in parallel in case `vad-web` initialization fails. |

**Key files:** `frontend/src/audio/voiceEnergy.ts`, `frontend/src/audio/pitchTracker.ts`, `frontend/src/audio/AudioPipeline.ts`, `frontend/src/audio/VadManager.ts`

---

## ADR-008: In-Memory Session Storage

**Decision:** Store all session state (metric accumulators, interruption events, key moments) in-memory on the backend Node.js process, with no database.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) Redis for ephemeral session state. (B) PostgreSQL/DynamoDB for persistent storage. (C) SQLite embedded in the container. |
| **Rationale** | The platform runs a single ECS task (t3.small). Sessions are ephemeral -- data is only needed during the session and for up to 30 minutes after (TTL for fetching post-session recommendations). A database would add infrastructure cost, operational complexity, and latency for every metric ingest (thousands per second across video and audio pipelines). In-memory storage with the `SessionAccumulator` class provides sub-millisecond access. The 30-minute TTL timer on empty rooms prevents unbounded memory growth. After recommendations are fetched, the room is deleted via `deleteRoom()`. |
| **Trade-offs** | All session data is lost if the process crashes or restarts. Cannot horizontally scale to multiple instances (rooms are pinned to a single process; the ALB uses sticky sessions to ensure this). No historical session data for trend analysis across sessions. Memory is bounded by the 896 MiB container limit, which accommodates dozens of concurrent sessions given the small per-session footprint (~50 KB for a 30-minute session). |

**Key files:** `backend/server/ws/sessionAccumulator.ts`, `backend/server/ws/metricsRelay.ts`

---

## ADR-009: OpenAI gpt-4o-mini for Post-Session Recommendations

**Decision:** Use OpenAI's `gpt-4o-mini` model for generating post-session coaching recommendations, called via direct API with LangSmith tracing.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) GPT-4o (full model). (B) Claude 3.5 Sonnet. (C) Local LLM (Llama 3, Mistral) on a GPU instance. (D) Rule-based recommendation engine (no LLM). |
| **Rationale** | `gpt-4o-mini` provides the best cost/speed/quality balance for this use case. Recommendations are generated once per session (not real-time), so latency tolerance is high (~2-5 seconds is acceptable). The input is a structured JSON summary of session metrics (~500 tokens), and the output is 3-5 short recommendations (~200 tokens). At these token volumes, `gpt-4o-mini` costs fractions of a cent per session. GPT-4o would cost 10x more with marginal quality improvement for this structured task. A local LLM would require a GPU instance ($100+/month). Rule-based systems cannot produce the nuanced, context-aware recommendations that make the feature valuable. LangSmith tracing is integrated via the `traceable` wrapper for observability and prompt iteration. |
| **Trade-offs** | External API dependency -- if OpenAI is down, recommendations fail (the session itself continues unaffected). Response quality varies with prompt engineering. The 300-token `max_tokens` limit on recommendations may truncate verbose responses. No fine-tuning on tutoring-specific data (relies on general instruction following). |

**Key files:** `backend/server/langsmith/tracing.ts`, `shared/types.ts`

---

## ADR-010: AWS ECS on EC2 over Fargate or Lambda

**Decision:** Deploy the backend on ECS with EC2 capacity (t3.small) rather than Fargate or Lambda.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) AWS Fargate (serverless containers). (B) AWS Lambda with API Gateway WebSocket API. (C) A single EC2 instance without ECS. (D) Railway, Fly.io, or other PaaS. |
| **Rationale** | The backend maintains persistent WebSocket connections and in-memory session state, which rules out Lambda (15-minute execution limit, no persistent connections without API Gateway WebSocket API complexity). Fargate charges per vCPU-hour and is 2-3x more expensive than a reserved t3.small for always-on workloads. ECS on EC2 provides container orchestration (health checks, rolling deploys, log aggregation via CloudWatch) while keeping costs low with a single t3.small instance (~$15/month). The CDK stack manages the full infrastructure: VPC with public subnets only (no NAT gateway, saving ~$32/month), ALB with HTTPS (ACM certificate), Route53 A record, and sticky sessions for WebSocket affinity. |
| **Trade-offs** | Single instance means zero redundancy -- if the instance fails, all active sessions are lost. No auto-scaling (min=max=1). The EC2 instance must be in a public subnet with a public IP (no NAT gateway). Manual `cdk deploy` required for backend updates (no CI/CD pipeline). |

**Key files:** `infra/lib/backend-stack.ts`

---

## ADR-011: Engagement Scoring Formula

**Decision:** Use a binary eye-contact gate with weighted energy components for the engagement score, branching on speaking state.

| Aspect | Detail |
|--------|--------|
| **Formula** | **Speaking:** `0.8 + voiceEnergy * 0.2` (range: 0.80-1.00). **Not speaking:** `eyeGate * 0.8 + expressionEnergy * 0.2` where `eyeGate = 1 if eyeContact >= 0.50, else 0` (range: 0.00-1.00). |
| **Alternatives considered** | (A) Continuous weighted average of all signals (eye contact * 0.4 + expression * 0.3 + voice * 0.3). (B) ML model trained on annotated engagement data. (C) Simple heuristic: speaking = engaged, not speaking = use eye contact only. |
| **Rationale** | When someone is speaking, they are inherently engaged -- the 0.8 base score reflects this, with voice energy providing a small modulation for expressiveness. When silent, eye contact is the strongest engagement signal. A continuous score (alternative A) dilutes the eye contact signal: someone looking directly at the camera with a neutral expression would score only 0.4, which feels wrong. The binary gate captures the intuition that "looking at the screen = paying attention" decisively. The 0.50 threshold was calibrated empirically to account for natural gaze variation around the camera area. Expression energy (smile, nod, eye wideness) adds a secondary signal for participants who are visibly reacting even while listening. An ML model (alternative B) would require labeled training data that does not exist for this specific webcam tutoring context. |
| **Trade-offs** | The binary gate creates a discontinuity at 0.50 eye contact (0.49 = 0 engagement, 0.51 = 0.80). Participants who are genuinely engaged but looking at notes or a shared screen will show zero engagement. The formula does not account for typing, writing, or other non-visual engagement signals. |

**Key files:** `frontend/src/core/engagement.ts`, `frontend/src/core/MetricsEngine.ts`

---

## ADR-012: Expression Energy with Exponential Decay

**Decision:** Compute expression energy as `min(1, genuineSmile + headNodActivity + eyeWideness)` with an exponential decay (half-life of 2 seconds) that prevents the score from dropping instantly.

| Aspect | Detail |
|--------|--------|
| **Formula** | `energy = max(instantEnergy, prevEnergy * 0.84)` where decay constant 0.84 gives a half-life of ~2 seconds at 2 FPS (4 frames). |
| **Alternatives considered** | (A) Raw instantaneous value with no smoothing. (B) Simple moving average over a fixed window. (C) Low-pass Butterworth filter. |
| **Rationale** | Facial expressions are inherently transient -- a smile or nod lasts 0.5-2 seconds, then the face returns to neutral. Without decay, the energy score would spike briefly then drop to zero, creating visual flickering on the dashboard. A moving average (alternative B) would also work but creates a delayed response: the score takes the full window duration to rise, making reactions feel sluggish. Exponential decay is asymmetric by design: the score rises instantly (via `max(instantEnergy, ...)`) but falls slowly. This matches the perceptual reality -- a tutor who sees a student smile and nod should see that reflected immediately and have it linger for a moment, not flash and vanish. The `emaActivity` function for sub-signals (blink, brow, gaze variation) uses a decay of 0.2 for faster response on those per-component metrics. |
| **Trade-offs** | The decay can create a "ghost" effect where the score remains elevated briefly after the expression ends. A 2-second half-life means that after 4 seconds, only 25% of the peak remains. The `max()` formulation means the score can never decrease faster than the decay rate, even if a strong negative signal appears. |

**Key files:** `frontend/src/video/expressionAnalysis.ts`

---

## ADR-013: Blink Gate on Eye Contact Scoring

**Decision:** When blink activity is high (>= 15%) or eye openness is low (< 0.7), the eye contact score can only increase, never decrease. The last open-eye score is held through the blink.

| Aspect | Detail |
|--------|--------|
| **Mechanism** | `eyeContact = eyesReliable ? rawEyeContact : Math.max(rawEyeContact, lastEyeContact)` where `eyesReliable = eyeOpenness >= 0.7 && blinkActivity < 0.15`. |
| **Alternatives considered** | (A) Skip eye contact computation entirely during blinks and interpolate. (B) Low-pass filter on the eye contact score. (C) Exclude blink frames from the score and average only open-eye frames. |
| **Rationale** | During a blink, the iris landmarks in MediaPipe become unreliable -- the iris is partially or fully occluded by the eyelid, causing the gaze estimate to jump erratically. Without the gate, a normal blink rate of 15-20 per minute would introduce 15-20 momentary score drops per minute, making the eye contact display noisy and misleading. The hold-through-blink approach assumes that a person's gaze direction does not change during a 100-300 ms blink, which is physiologically accurate. The gate is one-directional: if the raw score during a blink happens to be higher than the held value (rare but possible with noisy landmarks), it is allowed through. This prevents the gate from artificially suppressing genuine upward movements. |
| **Trade-offs** | If someone closes their eyes for an extended period (thinking, resting), the score will remain frozen at the last open-eye value rather than dropping. The 0.7 openness threshold and 0.15 blink activity threshold were empirically tuned and may not generalize to all face shapes or lighting conditions. |

**Key files:** `frontend/src/video/VideoPipeline.ts`, `frontend/src/video/expressionAnalysis.ts`

---

## ADR-014: Audio Bandpass Filter (85-3000 Hz)

**Decision:** Apply a cascaded highpass (85 Hz) and lowpass (3000 Hz) biquad filter to the audio signal before all analysis (RMS, spectral centroid, pitch detection, VAD).

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) No filtering -- analyze raw microphone input. (B) Wider band (50-8000 Hz) to capture harmonics. (C) Adaptive noise gate instead of fixed bandpass. |
| **Rationale** | The speech fundamental frequency range is approximately 85 Hz (deep male voice) to 300 Hz (high female voice), with significant harmonic energy up to 3000 Hz. Below 85 Hz: HVAC hum (60 Hz), room rumble, microphone handling noise. Above 3000 Hz: keyboard clicks, sibilance, background music, and environmental noise. The bandpass filter removes these out-of-band noise sources before they contaminate RMS calculations, spectral centroid measurements, and pitch detection. Without filtering, the RMS-based VAD would trigger on mechanical keyboard typing (broadband transient) and the spectral centroid would be pulled upward by high-frequency ambient noise. The Web Audio API's `BiquadFilterNode` provides efficient, real-time filtering with no additional dependencies. |
| **Trade-offs** | Cuts off speech harmonics above 3000 Hz, which slightly reduces spectral centroid accuracy for high-pitched voices. The fixed cutoffs may not be optimal for all environments (e.g., a tutor with a particularly deep voice near 85 Hz). The filter introduces a small phase delay, though this is negligible for the 20 Hz audio sampling rate. |

**Key files:** `frontend/src/core/StreamManager.ts` (filter chain setup)

---

## ADR-015: Coaching Nudges Suppressed While Tutor Is Speaking

**Decision:** The `NudgeEngine` evaluates rules on every metric snapshot but suppresses all nudge emissions when the tutor is currently speaking.

| Aspect | Detail |
|--------|--------|
| **Alternatives considered** | (A) Show nudges at all times regardless of tutor state. (B) Queue nudges during speech and deliver when the tutor pauses. (C) Show nudges but with reduced visual prominence during speech. |
| **Rationale** | A coaching nudge appearing mid-sentence is disruptive -- it breaks the tutor's flow and diverts attention from the student. The tutor cannot act on a nudge while speaking (e.g., "ask an open-ended question" requires finishing the current thought first). Suppression ensures nudges only appear during natural pauses when the tutor can actually read and act on them. The per-rule cooldown timers continue to tick during suppression, so a condition that resolves while the tutor is speaking will not fire immediately after they stop -- it must still meet the cooldown threshold. A maximum rate of 3 nudges per minute prevents notification fatigue even during silent observation periods. |
| **Trade-offs** | If the tutor talks continuously for several minutes, important nudges (e.g., "student has been silent for 3 minutes") will be delayed until the tutor pauses. Queuing (alternative B) was rejected because stale nudges may no longer be relevant by the time they are delivered. The condition is re-evaluated on the next snapshot after speech ends, ensuring relevance. |

**Key files:** `frontend/src/coaching/NudgeEngine.ts`, `frontend/src/coaching/defaultRules.ts`
