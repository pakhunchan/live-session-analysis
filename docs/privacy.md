# Privacy Considerations

This document describes the data collection, processing, storage, and sharing practices of the Live Session Analysis platform. It is intended for developers, stakeholders, and participants who want to understand how personal and session data is handled throughout the system.

---

## 1. Data Collection

### What Is Captured

During an active tutoring session, the platform captures the following raw inputs from each participant's device:

- **Video frames** from the device camera, processed locally at approximately 2 frames per second.
- **Audio signal** from the device microphone, sampled at 20 Hz via the Web Audio API (`AnalyserNode`).
- **Facial landmarks** (478-point mesh) detected by MediaPipe FaceLandmarker running in the browser.
- **Facial blendshapes** (52 expression coefficients such as brow raise, eye blink, lip movement) output by MediaPipe.
- **Head pose** (pitch, yaw, roll) extracted from the facial transformation matrix.

### What Is NOT Captured

- **No video recording.** Video frames are consumed in-browser by the face detection model and immediately discarded. No images or video streams are transmitted to the server or stored anywhere.
- **No audio recording.** Raw audio waveform data is analyzed locally for voice activity, pitch, and spectral features. No audio samples, recordings, or buffers are sent to the server.
- **No screenshots or screen captures** are taken at any point.
- **No personally identifiable information (PII)** such as names, email addresses, or account credentials is collected by the analysis pipeline. Participant names entered during session setup are used only for display labels in the local UI and in LiveKit room tokens.

---

## 2. Processing Architecture

All biometric and media processing occurs **client-side in the participant's browser**. No raw video or audio data leaves the device.

### Video Processing Pipeline

1. The device camera feed is accessed via `getUserMedia`.
2. Each frame is passed to MediaPipe FaceLandmarker, which runs as a WASM module with GPU delegation in the browser.
3. The `VideoPipeline` extracts derived numeric scores from the detection result:
   - Eye contact score (0-1), computed from iris landmark gaze estimation.
   - Expression energy score (0-1), computed from blendshape variance over a sliding window.
   - Activity metrics: blink activity, brow activity, lip activity, genuine smile, head nod activity, eye wideness, lip tension, gaze variation.
   - Face detection confidence (0-1).
4. These numeric scores are emitted as a `MetricDataPoint` through the local `EventBus`. The raw landmarks, blendshapes, and video frames are not retained or transmitted.

### Audio Processing Pipeline

1. The device microphone feed is accessed via `getUserMedia` and routed through a `BiquadFilterNode` bandpass filter (85-3000 Hz speech band).
2. The `AudioPipeline` computes derived features from the filtered signal:
   - Voice activity detection (boolean `isSpeaking`), using either the ML-based `@ricky0123/vad-web` model or a fallback threshold-based detector.
   - RMS amplitude, spectral centroid, volume variance, spectral brightness, speech rate.
   - Pitch and pitch variance via autocorrelation-based tracking.
   - Voice energy score (0-1), a composite of volume variance, spectral brightness, and speech rate.
3. These numeric scores are emitted as a `MetricDataPoint`. No raw audio samples are transmitted or stored.

### WebRTC Audio/Video Streaming

Audio and video are streamed between participants via LiveKit (WebRTC). This is a standard peer-to-peer (via SFU) communication channel for the tutoring session itself and is separate from the analysis pipeline. The analysis pipeline does not record, intercept, or store these WebRTC streams.

---

## 3. Data in Transit

### WebSocket Metric Transport

Derived metrics are sent from each participant's browser to the backend server via a WebSocket connection (`MetricsTransport` on the frontend, `metricsRelay` on the backend) at the `/ws/metrics` endpoint.

**What is transmitted:**

Each WebSocket message is a JSON object containing only numeric scores and boolean flags. A typical metric payload includes fields such as:

- `source`: `"video"` or `"audio"`
- `participant`: `"tutor"` or `"student"`
- `timestamp`: Unix timestamp in milliseconds
- `faceDetected`: boolean
- `faceConfidence`: number (0-1)
- `eyeContact`: number (0-1)
- `expressionEnergy`: number (0-1)
- `isSpeaking`: boolean
- `voiceEnergy`: number (0-1)
- `amplitude`: number
- `volumeVariance`, `spectralBrightness`, `speechRate`, `pitch`, `pitchVariance`: numbers
- Activity scores: `blinkActivity`, `browActivity`, `lipActivity`, `genuineSmile`, `headNodActivity`, `eyeWideness`, `lipTension`, `gazeVariationX`: numbers (0-1)

**What is NOT transmitted:**

- No raw video frames, images, or pixel data.
- No raw audio samples, waveforms, or buffers.
- No facial landmark coordinates or blendshape arrays.
- No personally identifiable information.

### Encryption

- The WebSocket connection uses WSS (WebSocket Secure) over TLS in production. The backend is deployed behind an AWS ALB with an ACM TLS certificate at `https://lsa-api.pakhunchan.com`.
- The LiveKit WebRTC connection uses DTLS-SRTP encryption for all audio/video streams.

### Clock Synchronization

The WebSocket transport includes a clock-sync protocol that exchanges timestamps (`clientTs`, `serverTs`) to correct for clock drift between devices. These are Unix timestamps only and contain no personal data.

---

## 4. Server-Side Storage

### In-Memory Only

The backend server (Node.js on AWS ECS) stores all session data **exclusively in memory**. There is no database, no filesystem persistence, and no durable storage of session data.

The server maintains two in-memory structures per active room:

1. **InterruptionDetector**: A sliding-window buffer of recent speaking states used to detect conversational interruptions. Contains only participant role, speaking boolean, and corrected timestamp.

2. **SessionAccumulator**: Running aggregates computed from ingested metric data points, including:
   - Per-participant sums and counts for eye contact, energy, and speaking duration.
   - Key moment markers (e.g., "attention drop", "long silence") with timestamps and descriptions.
   - An overall engagement score.

   The accumulator does **not** store individual data points. It maintains only running statistical aggregates (sums, counts, min/max) needed to produce the session summary.

### Data Retention and Garbage Collection

- When all participants disconnect from a room, a **30-minute TTL timer** begins.
- If no participant reconnects within 30 minutes, the room and all its in-memory data (accumulator, interruption detector) are garbage collected and permanently deleted.
- If the post-session recommendations endpoint is called before TTL expiry, the room data is deleted immediately after the response is served.
- If a participant reconnects during the TTL window, the session data is **reset** (cleared and restarted fresh), not resumed.

### No Persistent Storage

- No session data is written to disk, a database, S3, or any other durable store.
- Server restarts or ECS task replacements result in complete loss of all in-memory session data.

---

## 5. Third-Party Data Sharing

### OpenAI (Post-Session Recommendations)

At the end of a session, the tutor can request AI-generated coaching recommendations. This triggers a call from the backend to the OpenAI API (`gpt-4o-mini` model).

**What is sent to OpenAI:**

A JSON summary of aggregated session statistics:

- Session duration in minutes.
- Overall engagement score (single number).
- Total interruption count.
- Talk-time ratio (tutor vs. student percentages).
- Average eye contact and energy scores per participant.
- Key moments (type and description, e.g., "attention drop", "long silence").
- Types of nudges triggered during the session.

**What is NOT sent to OpenAI:**

- No raw video, audio, or biometric data.
- No individual metric data points or time-series data.
- No facial landmarks, blendshapes, or expression coefficients.
- No participant names or identifying information.
- No real-time streaming data (the call happens only once, post-session).

### LangSmith (Observability)

The OpenAI API call is wrapped with LangSmith tracing (`langsmith/traceable`) for monitoring and debugging purposes. LangSmith receives:

- The prompt sent to OpenAI (aggregated session statistics as described above).
- The model's response (recommendation strings).
- Metadata such as latency, model name, and token usage.

LangSmith does not receive any raw media data or PII.

### LiveKit

LiveKit Cloud provides the WebRTC infrastructure for audio/video communication between participants. LiveKit processes audio and video streams through its Selective Forwarding Unit (SFU) for real-time delivery. LiveKit's own privacy practices govern the handling of these WebRTC streams. The analysis metrics pipeline is entirely separate from LiveKit's infrastructure.

### No Other Third-Party Sharing

No session data, metrics, or personal information is shared with any other third-party service, advertising network, or analytics platform.

---

## 6. Consent and Transparency

### Session Participation

- Both participants (tutor and student) must actively choose to join a session by entering a room code and their display name, then explicitly clicking to connect.
- There is no passive or background data collection. Analysis begins only when a participant joins a room and ends when they disconnect.

### Visibility and Asymmetry

- **Tutor view**: The tutor's dashboard displays real-time engagement metrics, energy scores, eye contact gauges, interruption counts, and engagement trends for both participants. The tutor also sees post-session recommendations.
- **Student view**: The student sees only their own video feed and basic connection controls. Students do not have access to the metrics dashboard, engagement scores, or any analysis results.
- Both participants can see each other's video and hear each other's audio through the standard WebRTC session (as expected in a video call).

### Camera and Microphone Permissions

- The browser's native permission dialogs are used for camera and microphone access. Participants must grant these permissions explicitly through their browser.
- Denying camera permission means face detection metrics will not be computed for that participant. Denying microphone permission means audio metrics will not be computed.

---

## 7. Access Control

### Room-Based Isolation

- Sessions are isolated by room name. Metric data points from one room are never relayed to or accessible from another room.
- The WebSocket relay (`metricsRelay`) enforces room-based routing: student metrics are forwarded only to tutor connections within the same room.

### Authentication

- The platform does not currently implement a formal authentication system.
- Room access is controlled by a shared room code. Any participant who knows the room code and selects a role (tutor or student) can join.
- LiveKit room tokens are generated server-side and scoped to a specific room name and participant identity.

### Infrastructure Access

- The backend runs on AWS ECS (EC2) behind an Application Load Balancer.
- The ECS task and EC2 instances are managed via AWS IAM with least-privilege roles.
- SSH access to compute instances is available through AWS Systems Manager (SSM) only.
- No public ports are exposed on the EC2 instances beyond the ALB-managed HTTP/HTTPS traffic.

---

## 8. Recommendations for Future Improvements

The following enhancements are recommended to strengthen privacy protections as the platform matures:

### Consent and Transparency

- **Explicit consent dialog**: Display a clear, dismissible consent screen before session start that explains what data is collected, how it is processed, and who can see the results. Require affirmative consent from both participants.
- **Student notification**: Inform the student that engagement analysis is active during the session and summarize what metrics are being computed.
- **Consent audit trail**: Log consent events (timestamp, participant, version of consent text accepted) for compliance purposes.

### Data Handling

- **Data retention policy UI**: Provide controls for the tutor to configure how long session summary data is retained before automatic deletion.
- **Export and deletion**: Allow participants to request export or deletion of any session data associated with them.
- **Opt-out for analysis**: Allow participants to join a session with video/audio communication but with the analysis pipeline disabled (no face detection, no audio metrics).

### Access Control

- **Authentication**: Implement a proper authentication system (e.g., OAuth, email/password) to prevent unauthorized room access.
- **Role verification**: Ensure that room roles (tutor/student) are assigned and verified server-side rather than self-selected by the participant.
- **Rate limiting**: Add rate limits on room creation and WebSocket connections to prevent abuse.

### Security

- **Penetration testing**: Conduct security testing on the WebSocket relay and API endpoints.
- **Content Security Policy**: Add CSP headers to the frontend to mitigate XSS risks.
- **Dependency auditing**: Regularly audit npm dependencies (especially MediaPipe WASM binaries and the VAD model) for known vulnerabilities.

### Compliance

- **Privacy policy**: Draft and publish a formal privacy policy accessible from the application UI.
- **GDPR/FERPA alignment**: If deployed in educational contexts, evaluate compliance with applicable regulations (GDPR for EU users, FERPA for US educational records, COPPA for minors).
- **Data Processing Agreement**: Establish DPAs with third-party providers (OpenAI, LangSmith, LiveKit) if processing data subject to regulatory requirements.
