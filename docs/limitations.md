# Known Limitations

This document catalogs known limitations of the Live Session Analysis platform, organized by subsystem. Understanding these constraints is important for setting appropriate expectations and planning future improvements.

---

## 1. Video Analysis Limitations

### Camera Angle Sensitivity

Gaze estimation relies on iris position relative to eye corners (landmarks 468, 473, 33, 133, 362, 263) and head pose derived from nose-to-ear geometry. Webcams mounted at non-standard positions (e.g., far off to the side, below the screen) shift the baseline gaze ratios. The `verticalCenter` parameter in `eyeContactClassifier.ts` is set to 0.45 to compensate for top-mounted webcams, but this is a fixed offset that does not adapt to arbitrary camera placements.

### Multi-Monitor Setups

When a student looks at a second monitor, shared content on another screen, or physical notes beside their computer, the system registers this as disengagement (low eye contact score). The gaze estimator cannot distinguish "looking at relevant content on a second display" from "looking away." This is a fundamental limitation of single-camera gaze estimation without knowledge of the user's screen layout.

### Lighting Conditions (Fundamentally Unhandleable)

Low light and darkness represent a fundamental limitation that cannot be solved with the current approach. MediaPipe FaceLandmarker requires sufficient lighting to identify facial landmarks. When lighting is poor, the model cannot locate enough landmarks to produce a reliable detection, so confidence drops below the 0.7 threshold (`VideoPipeline.confidenceThreshold`) and the frame is treated as a missed detection (`faceDetected: false`). The critical issue is that this produces the same signal as a user who has looked away or left the frame entirely. There is no reliable way to differentiate "face present but too dark to detect" from "face not present" with the current face detection model. Backlighting (e.g., window behind the user) causes similar degradation. There is no automatic exposure or gain compensation at the analysis layer.

### Glasses and Sunglasses

Reflective or tinted lenses interfere with iris landmark tracking. Dark sunglasses can cause iris landmarks (468, 473) to lock to inaccurate positions, producing unreliable gaze ratios. The system has no glasses-detection mode and does not adjust thresholds based on eyewear.

### Single Face Only

The MediaPipe FaceLandmarker is configured with `numFaces: 1`. If multiple faces appear in the frame (e.g., someone walks behind the student), only the first detected face is processed. There is no multi-face support and no mechanism to track a specific identity across frames.

### 2 Hz Video Sampling Rate

Video frames are sampled at approximately 2 FPS to manage CPU load alongside MediaPipe WASM inference. This rate is sufficient for tracking sustained gaze direction and slow expression changes but misses rapid micro-expressions (which occur in 40-500ms windows). Brief glances away and back within a 500ms frame interval may go undetected.

### Looking at Shared Content vs. Looking Away

When a tutor shares their screen and the student looks at the shared content (typically displayed in a window below or beside the video feed), the gaze estimator reads this as the student looking away from the camera. The system has no awareness of what content is being displayed or where on the screen it appears, so it cannot distinguish productive screen-reading from genuine disengagement.

### Head Pose Estimation Noise

Head yaw is estimated from nose-tip displacement relative to cheek-boundary landmarks (234, 454). Because these landmarks span a narrow baseline (not actual ear tips), the yaw scaling factor is capped at 25 degrees to prevent inflated readings. Pitch estimation uses nose-to-chin depth ratios from MediaPipe's noisy z-values, scaled conservatively at 35 degrees. Both estimates are approximate and can drift across sessions.

### Blink Interference with Gaze

During blinks, iris landmarks become unreliable. The system mitigates this with a blink gate (eye openness > 0.7 and blink activity < 15%), holding the last known eye contact score when a blink is detected. However, rapid-fire blinks or partially closed eyes can still introduce transient noise into eye contact readings.

### Damaged or Malfunctioning Webcam

A physically damaged webcam (e.g., cracked lens, stuck autofocus, color distortion) can degrade face detection quality in ways that are difficult to distinguish from environmental conditions. The system does not perform any webcam health checks or image quality validation before running face detection. This edge case was not addressed due to its low incidence rate and the disproportionate implementation cost of reliable camera diagnostics.

---

## 2. Audio Analysis Limitations

### Background Noise Sensitivity

Voice Activity Detection (VAD) can trigger on environmental sounds such as keyboard typing, door closing, pet noise, or TV audio. The ML-based VAD (`@ricky0123/vad-web`) is more robust than the threshold fallback, but neither is immune to sustained non-speech sounds that fall within the speech frequency band (85-3000 Hz). The 800ms client-side speech hold (`SPEECH_HOLD_MS`) extends detected speech through brief pauses but also extends false positives.

### Speaker Diarization Relies on Separate Tracks

Speaker identification depends entirely on each participant having a separate LiveKit audio track. The system cannot perform speaker diarization on mixed or single-channel audio. If both participants share a physical space (e.g., in-person tutoring with one device), all speech is attributed to whoever owns the microphone.

### Voice Energy Metrics Only Computed While Speaking

Voice energy (volume variance, spectral brightness, speech rate) is only calculated during detected speech segments. Silent periods produce zero values for all voice metrics. This means the voice energy score cannot reflect engagement during listening periods; engagement during silence relies entirely on video-based expression energy.

### Speech Rate Estimation Is Approximate

Speech rate is estimated from amplitude envelope fluctuations in the RMS history, not from phoneme or syllable detection. This amplitude-based approach captures the rhythm of speech but does not correspond to actual words-per-minute or syllables-per-second. Monotone speech at a constant volume registers as low speech rate even if the person is speaking rapidly.

### Pitch Tracking Limitations

The autocorrelation-based pitch tracker operates on short audio frames and is susceptible to octave errors (detecting the fundamental frequency's harmonic instead). Pitch and pitch variance metrics should be considered approximate indicators of vocal expressiveness rather than precise measurements.

### Damaged or Malfunctioning Microphone

A physically damaged microphone (e.g., loose connection causing intermittent signal, hardware noise floor issues, partial frequency response failure) can produce misleading audio metrics. The system does not validate microphone health or signal quality before computing voice features. As with the webcam equivalent, this edge case was deprioritized due to its rarity and the high cost of reliable hardware diagnostics.

---

## 3. Engagement Scoring Limitations

### Binary Eye Contact Gate

The engagement formula for non-speaking participants uses a hard binary threshold: eye contact score >= 0.50 contributes 0.8 to engagement, while anything below contributes 0. There is no partial credit. A student with an eye contact score of 0.49 receives the same engagement reading as one who is completely looking away. This coarse gating was chosen for simplicity but does not reflect the spectrum of attentiveness.

### Manually Tuned Weights

All engagement formula weights (80/20 split for speaking vs. silent, voice energy weights of 0.35/0.30/0.35, expression energy composition) are manually tuned based on qualitative observation. They have not been empirically validated against measured learning outcomes, student self-reports, or expert observer ratings. The weights may not generalize across different tutoring styles, subjects, or student populations.

### "Looking at Camera" Does Not Equal "Engaged"

Eye contact with the camera is used as a proxy for attention, but a student can maintain eye contact while mentally disengaged (zoning out, daydreaming). Conversely, a student looking down while taking notes may be highly engaged. The system conflates visual attention direction with cognitive engagement.

### Expression Energy Decay Lag

Expression energy uses an exponential decay with a half-life of approximately 2 seconds (`ENERGY_DECAY = 0.84` at ~2 FPS). After a genuine smile or head nod, the energy score remains elevated for several seconds even if the student's expression has returned to neutral. This smoothing prevents flicker but creates a lag in reflecting actual state changes.

### Engagement Trend Sensitivity

The engagement trend (rising/stable/declining) is computed via linear regression over a configurable window of recent snapshots. The slope threshold of 0.02 determines when a trend is classified as non-stable. Short sessions or sessions with highly variable engagement may produce misleading trend indicators.

---

## 4. Infrastructure Limitations

### Single ECS Instance

The backend runs on a single `t3.small` EC2 instance (`minCapacity: 1, maxCapacity: 1`) with no auto-scaling. This is a single point of failure: if the instance fails health checks or is terminated, all active sessions lose their WebSocket connections and in-memory data. There is no redundancy or failover mechanism.

### In-Memory Session Storage

All session state (metrics accumulator, interruption detector, room connections) is held in a JavaScript `Map` in the Node.js process. If the container restarts, crashes, or is redeployed, all active session data is permanently lost. There is no persistence layer (no database, no Redis, no disk-based storage).

### No Authentication

Room access is controlled solely by room name codes. Anyone who knows or guesses a room code can join as either tutor or student. There is no user authentication, no JWT validation, and no role verification beyond the self-declared `role` field in the WebSocket `join` message.

### No Persistent Session History

Session data exists only while the room is active (plus a 30-minute TTL after all participants disconnect). Once the TTL expires or recommendations are fetched and the room is deleted, all metrics, interruption events, and accumulator data are gone. There is no cross-session trend analysis, no historical dashboards, and no ability to compare sessions over time.

### 30-Minute TTL for Session Data

After all participants leave a room, a 30-minute timer begins. If no one rejoins and the post-session recommendations endpoint is not called within that window, the session data is silently deleted. If the tutor's browser crashes and they reopen it after 30 minutes, the session summary is unrecoverable.

### Memory Constraint

The ECS task is allocated 896 MiB of memory. This is sufficient for a small number of concurrent sessions, but high concurrency (many rooms with frequent metric ingestion) could approach this limit, especially given that each room retains up to 3600 metric snapshots (30 minutes at 2 Hz) plus interruption event buffers.

---

## 5. Coaching Limitations

### Fixed Rule Thresholds

All five coaching rules use hardcoded thresholds (e.g., silence > 3 minutes, talk-time > 80%, distraction > 4 seconds, energy < 0.3/0.4, interruptions >= 3). These thresholds do not adapt to session context, subject matter, grade level, or individual student behavior patterns. A math tutoring session where the student is silently working problems has different norms than a language practice session.

### Limited Nudge Types

The coaching engine has exactly five rules: student silence, low eye contact, tutor talk-time dominance, energy drop, and interruption spike. There are no rules for positive reinforcement, pacing, question quality, content coverage, or other pedagogical dimensions.

### No Learning or Adaptation Over Time

The coaching engine does not learn from past sessions. It cannot identify that a particular student typically has lower baseline eye contact, or that a tutor's teaching style naturally involves longer lecture segments. Every session starts from the same fixed thresholds.

### Nudges Are Text-Only

Coaching nudges are displayed as text chips in the tutor's sidebar. There are no audio cues, haptic feedback, or visual overlays on the video feed. A tutor focused on the student's video may miss a nudge appearing in the sidebar.

### Cooldown Limitations

Each rule has a fixed cooldown period (90 seconds to 3 minutes) that prevents re-firing. If a condition persists beyond the cooldown, the same nudge fires again, but there is no escalation mechanism and no variation in messaging. Repeated identical nudges may cause the tutor to ignore them.

---

## 6. Browser and Platform Limitations

### Modern Browser Requirements

The application requires a browser that supports WebRTC (for LiveKit), WebAssembly (for MediaPipe and VAD), Web Audio API (for audio analysis), and ES2020+ JavaScript features. This effectively limits support to recent versions of Chrome, Edge, Firefox, and Safari. Older browsers and most embedded WebViews will fail.

### MediaPipe WASM Model Loaded from CDN

The FaceLandmarker WASM runtime is loaded from `cdn.jsdelivr.net` and the model from `storage.googleapis.com` at runtime. This requires an active internet connection during initialization. If either CDN is unavailable or blocked by network policies, face detection will not initialize. There is no offline fallback or bundled model.

### CPU-Intensive Processing

The client simultaneously runs MediaPipe face detection (WASM + GPU delegate), ML-based voice activity detection (ONNX via `@ricky0123/vad-web`), 20 Hz audio feature extraction (RMS, spectral centroid, pitch tracking via Meyda), and WebRTC encoding/decoding. On lower-end hardware, this can cause frame drops, audio glitches, or UI lag. The GPU delegate for MediaPipe helps but is not available on all systems.

### Mobile Browser Performance

While technically functional on mobile browsers, the combined CPU and memory load of face detection, audio analysis, and WebRTC is likely to cause performance issues on mobile devices. Battery drain will be significant during extended sessions. The UI is not optimized for mobile screen sizes.

### WebRTC Dependency on LiveKit Cloud

All audio/video streaming passes through LiveKit's cloud infrastructure. If LiveKit's service experiences downtime or network issues, sessions cannot be established. There is no peer-to-peer fallback.

---

## 7. Privacy and Compliance Limitations

### No Explicit Consent Dialog

The application begins face detection and audio analysis as soon as the session starts. There is no consent dialog, terms-of-service acknowledgment, or opt-in mechanism presented to participants before their video and audio are analyzed. The browser's standard camera/microphone permission prompt is the only gate.

### No GDPR or FERPA Compliance Features

The platform lacks features required for regulatory compliance in educational contexts:

- No data subject access request (DSAR) workflow
- No right-to-deletion mechanism (data auto-deletes via TTL, but there is no on-demand deletion)
- No data processing agreements or audit logs
- No parental consent mechanism for minors (relevant for K-12 tutoring under COPPA/FERPA)
- No data residency controls (backend runs in `us-west-2`, LiveKit routing is provider-managed)

### Third-Party Data Processing

Post-session summaries are sent to OpenAI's API (via LangSmith tracing) for generating recommendations. This means aggregated session metrics (eye contact averages, talk-time ratios, energy scores, interruption counts, and key moment descriptions) are transmitted to a third-party AI provider. There is no opt-out for this feature, no data processing agreement surfaced to users, and no on-premise LLM alternative configured.

### No Data Encryption at Rest

Session data stored in memory is not encrypted. While this is somewhat mitigated by the ephemeral nature of the data (in-memory only, 30-minute TTL), any memory dump or debugging snapshot would expose raw session metrics.

---

## 8. Interruption Detection Limitations

### Clock Synchronization Dependency

Interruption detection runs on the backend using corrected timestamps from both participants. Clock synchronization relies on a single `clock-sync` round-trip that estimates a rough offset without RTT correction. Clock drift between participants can cause the watermark-based ordering to misclassify the sequence of speech events, leading to false positives or missed interruptions.

### Debounce and Cooldown Trade-offs

The detector uses a 500ms speech gap debounce, 500ms minimum overlap duration, 1000ms established-speaker requirement, and 2-3 second cooldowns between interruption events. These thresholds were tuned for typical conversational patterns but may not suit all interaction styles. Fast-paced discussions with natural back-and-forth can trigger false interruption counts, while soft-spoken interruptions may not meet the minimum overlap threshold.

### No Semantic Awareness

The detector operates purely on speech timing (who is talking when). It cannot distinguish between a rude interruption, an enthusiastic agreement ("Yes! Exactly!"), a clarifying question, or collaborative co-construction of ideas. All simultaneous speech that meets the timing criteria is classified the same way.
