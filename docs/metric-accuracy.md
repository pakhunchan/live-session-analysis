# Metric Accuracy & Validation

This document describes how each metric in the Live Session Analysis system is measured, the accuracy considerations for each, and the validation methodology used to verify correctness.

---

## 1. Eye Contact Detection

### Pipeline

Eye contact detection follows a multi-stage pipeline:

1. **Face Detection** -- MediaPipe FaceLandmarker runs on each video frame, producing 478 facial landmarks (including iris landmarks at indices 468-477) and 52 blendshape coefficients.
2. **Gaze Estimation** (`gazeEstimation.ts`) -- Iris position is computed as a ratio within each eye's bounding box. The horizontal ratio (0 = left, 0.5 = center, 1 = right) is derived from iris center position relative to the outer and inner eye corners. Vertical ratio is computed similarly using top and bottom eyelid landmarks. Head pose is estimated from nose-tip, chin, and cheek-boundary landmarks.
3. **Eye Contact Classification** (`eyeContactClassifier.ts`) -- The gaze estimate is converted to a smooth 0-1 eye contact score using a weighted combination of gaze deviation and head pose attenuation.

### Scoring Formula

The classifier produces a continuous score rather than a binary classification:

- **Gaze score**: `hScore * vScore`, where each dimension is linearly interpolated from 1.0 (at center) to 0.0 (at threshold). Horizontal threshold is 0.35 deviation from 0.5; vertical threshold is 0.40 deviation from a configurable center (default 0.45, shifted down to compensate for top-mounted webcams).
- **Head pose multiplier**: Average of yaw and pitch attenuation factors, `(yawAtten + pitchAtten) / 2`. This avoids the "multiplication penalty" where individually reasonable factors compound into unreasonably low scores. Hard cutoffs apply at 45 degrees yaw and 35 degrees pitch.
- **Final score**: `gazeScore * poseMultiplier`.

### Blink Gate

During blinks, iris landmark positions become unreliable as the eyelids close. The VideoPipeline implements a blink gate:

- When `eyeOpenness < 0.7` or `blinkActivity >= 0.15`, the eye contact score is only allowed to increase, never decrease. This prevents blink-induced iris noise from dragging the score down.
- The `eyeOpenness` value is derived from the average of `eyeBlinkLeft` and `eyeBlinkRight` blendshapes (inverted: 1.0 = fully open).

### Gaze History and Variation

The gaze history buffer (100 frames) is only updated when `eyeOpenness > 0.6`, filtering out blink artifacts. Gaze variation is computed as an EMA of frame-to-frame horizontal deltas, with per-frame deltas clamped to 0.15 to reject residual blink artifacts.

### Accuracy Considerations

- **Webcam position bias**: The vertical center is set to 0.45 (not 0.5) to account for webcams mounted above the screen. Users looking at the center of their screen will have a slight downward gaze relative to the camera.
- **Head pose estimation noise**: MediaPipe z-values are noisy, so the pitch multiplier uses a conservative factor of 35 (not 60). Yaw uses a factor of 25 to prevent forward-facing users from registering excessive yaw.
- **Bilateral averaging**: Both eyes are used for horizontal and vertical ratios, reducing noise from asymmetric lighting or partial occlusion.
- **Face confidence threshold**: Frames with face detection confidence below 0.7 are discarded entirely and counted as degraded frames.

---

## 2. Speaking Time Measurement

### Voice Activity Detection (VAD)

The system uses a two-tier VAD approach:

#### Primary: ML-based VAD (vad-web)

The `VadManager` wraps `@ricky0123/vad-web`, a neural-network-based voice activity detector that runs in-browser via WebAssembly. Configuration:

- **Positive speech threshold**: 0.35 (probability above which a frame is classified as speech).
- **Redemption period**: 600ms grace period before ending a speech segment, bridging brief pauses within an utterance.

The ML model is initialized per-participant using their individual `MediaStream` from LiveKit, ensuring clean per-speaker audio without crosstalk.

#### Fallback: Threshold-based VAD

When the ML VAD is unavailable (initialization failure, unsupported browser), a threshold-based `VoiceActivityDetector` activates:

- **RMS silence threshold**: 0.01 (below this = silence).
- **Speech band filter**: Energy in 85-3000 Hz must exceed 30% of total energy, filtering non-speech noise (keyboard clicks, fan hum).
- **Onset**: 2 consecutive active frames required to trigger speech (100ms at 20 Hz).
- **Offset**: 15 consecutive silent frames to end speech (750ms at 20 Hz), holding through natural inter-word pauses.

The fallback VAD stays warm even when the ML VAD is active, ensuring seamless degradation.

### Speech Hold Debounce

A client-side speech hold of 800ms (`SPEECH_HOLD_MS`) keeps `isSpeaking = true` after the last active VAD frame. This bridges brief drops in the VAD output during natural speech pauses (e.g., between sentences), preventing talk-time fragmentation.

### Talk Time Accumulation

The `TalkTimeAccumulator` tracks speaking milliseconds for each participant independently:

- On each audio processing cycle (~50ms at 20 Hz), if `isSpeaking` is true, the time delta since the last update is added to that participant's speaking total.
- Talk time percentage is computed as `speakingMs / totalSpeakingMs` (ratio of each participant's speaking time to total speaking time).
- In the `MetricsEngine`, talk time percentage is computed as `speakingMs / sessionElapsedMs` (fraction of session duration spent speaking).

### Speaker Separation Accuracy

Speaker separation relies on LiveKit's per-participant audio tracks rather than diarization. Each participant's microphone stream is published as a separate WebRTC track, and audio processing (RMS, VAD, spectral features) runs independently per track. This approach avoids the error-prone speaker diarization problem entirely -- there is no algorithmic confusion about who is speaking, since each audio stream corresponds to exactly one physical microphone.

### Accuracy Considerations

- **VAD latency**: The ML VAD introduces a small processing delay. The 800ms speech hold compensates for this.
- **Background noise**: The threshold fallback requires both RMS above silence threshold and speech-band energy dominance, reducing false positives from ambient noise.
- **RMS history gating**: RMS values are only added to history during speaking frames, keeping the history clean of ambient noise for downstream feature computation.

---

## 3. Interruption Detection

### Architecture

Interruption detection runs on the backend (`interruptionDetector.ts`) rather than client-side. This ensures both participants' audio data is processed with a single clock reference, eliminating cross-device timing issues.

### Watermark-based Processing

The `InterruptionDetector` uses a watermark algorithm to handle out-of-order and differently-delayed audio data:

1. **Buffering**: Incoming audio data points from both participants are buffered with clock-corrected timestamps (`correctedTs = timestamp + clockOffset`).
2. **Watermark advance**: The watermark is set to `min(latestTutorTs, latestStudentTs)`. Data points are only processed up to the watermark, ensuring both participants' data is available before making overlap decisions.
3. **Ordered processing**: Buffered points are sorted by corrected timestamp and processed sequentially.

### Overlap Detection Rules

An interruption is registered when all of the following conditions are met:

- **Established speaker**: The original speaker must have been talking for at least **1000ms** before the second speaker starts (`ESTABLISHED_SPEAKER_MS`). This filters out simultaneous speech starts.
- **Minimum overlap**: Both participants must overlap for at least **500ms** (`MIN_OVERLAP_MS`). Brief overlaps (backchanneling, "uh-huh") are excluded.
- **First speaker identification**: The speaker with the earlier `speakStartMs` is considered the established speaker; the later entrant is the interrupter.

### False Positive Mitigation

Several mechanisms reduce false positives:

- **Speech gap debounce** (500ms): Brief silence gaps shorter than `SPEECH_GAP_DEBOUNCE_MS` do not reset a speaker's "established" status. This prevents natural inter-sentence pauses from resetting the speaker's start time, which would otherwise cause a legitimate turn-take to be misclassified as an interruption.
- **Cooldown after interruption**: After an interruption is recorded:
  - **3000ms cooldown** if the interrupted speaker continued talking nonstop (`COOLDOWN_CONTINUOUS_MS`).
  - **2000ms cooldown** if the interrupted speaker paused since the last interruption (`COOLDOWN_PAUSED_MS`).
  This prevents a single prolonged overlap from generating multiple interruption events.
- **Clock offset correction**: Each participant's timestamps are adjusted to server time, eliminating false overlaps caused by clock skew between devices.

### Interruption Categorization

Interruptions are counted per "interrupted" participant (i.e., who was interrupted, not who interrupted). The `getCounts()` method returns `{ student: N, tutor: N, accident: N }`, where the count indicates how many times that participant was interrupted.

---

## 4. Energy Level

Energy level uses separate formulas for voice energy (when speaking) and expression energy (when not speaking).

### Voice Energy

Voice energy is computed from three sub-metrics, each normalized to 0-1:

- **Volume variance**: Variance of RMS amplitude over the speaking history window (~5 seconds at 20 Hz), scaled by 100. Captures dynamic speaking (loud-soft variation) vs. monotone delivery. Only computed during speech (gated by VAD).
- **Spectral brightness**: Spectral centroid (via Meyda) normalized to `centroidHz / 4000`. Higher values indicate brighter, more energetic speech. Meyda performs its own FFT internally from time-domain data.
- **Speech rate**: Estimated from amplitude peak counting in the RMS history. Peaks are local maxima at least 20% above the mean with minimum 100ms separation. Syllable rate is normalized as `syllablesPerSec / 8` (4 syl/s = 0.5, 8+ syl/s = 1.0).

The composite voice energy score is `min(1, volumeVariance + spectralBrightness + speechRate)`.

### Expression Energy

Expression energy captures non-verbal engagement through facial movement analysis:

- **Genuine smile**: Derived from `mouthSmileLeft`/`mouthSmileRight` blendshapes with an optional cheekSquint bonus (up to 20%, for Duchenne smile detection). A `sqrt` curve is applied so subtle smiles contribute meaningfully: `sqrt(0.25) = 0.50`.
- **Head nod activity**: EMA (exponentially-weighted moving average) of frame-to-frame head pitch deltas. Pitch is in radians with small absolute values, so a scale factor of 15 is applied. Decay of 0.2 means activity drops to near-zero within ~1 second of stillness.
- **Eye wideness** (AU5): Average of `eyeWideLeft`/`eyeWideRight` blendshapes, scaled by 15x to compensate for MediaPipe's low dynamic range on webcams (typically 0-0.08 raw).

The instantaneous expression energy is `min(1, genuineSmile + headNodActivity + eyeWideness)`. A slow decay is applied: `energy = max(instantEnergy, prevEnergy * 0.84)`, giving a half-life of approximately 2 seconds at ~2 FPS. This smooths the energy signal and prevents jarring drops.

### Energy Selection

The `MetricsEngine` selects which energy score to display:

- When the participant **is speaking**: voice energy is used.
- When the participant **is not speaking** and face is detected: expression energy is used.
- Otherwise: 0.

### Additional Expression Signals (Diagnostic)

Several signals are computed and exposed in the energy breakdown for diagnostic purposes but do not directly feed into the energy score:

- **Blink activity**: EMA of eyeOpenness deltas (captures active blinking patterns).
- **Brow activity**: Maximum of left/right brow position, scaled by 2. Brow position combines raise (AU1+AU2) and furrow (AU4) blendshapes.
- **Lip activity**: Instantaneous jaw openness (speech proxy).
- **Lip tension**: `max(mouthPress, mouthRollLower) * 2`, gated by jaw closure. Captures silent concentration.
- **Gaze variation**: Horizontal gaze movement, used for eye-wandering detection.

---

## 5. Engagement Score

### Composite Formula

The engagement score is a 0-1 composite that adapts based on whether the participant is currently speaking:

**When speaking:**
```
engagement = 0.80 + voiceEnergy * 0.20
```
A speaking participant receives a base score of 0.80 (speaking inherently indicates engagement), with voice energy contributing up to an additional 0.20.

**When not speaking:**
```
eyeGate = eyeContactScore >= 0.50 ? 1 : 0
engagement = eyeGate * 0.80 + expressionEnergy * 0.20
```
A non-speaking participant's engagement depends primarily on eye contact (binary gate at the 0.50 threshold), with expression energy providing a secondary signal.

**Unavailable data:**
- Returns `null` when `isSpeaking` is `null` (cannot determine which branch to use).
- Returns `null` when not speaking and `eyeContactScore` is `null` (video data required but unavailable).

### Design Rationale

- The **binary eye gate** (rather than continuous) reflects the observation that partial eye contact (e.g., 0.30) typically indicates distraction, not partial engagement. The threshold of 0.50 was chosen as the midpoint of the classifier's output range.
- The **speaking branch baseline of 0.80** acknowledges that talking is a strong engagement signal regardless of vocal energy level.
- The **20% weight for energy** in both branches keeps the score dominated by the primary signal (speaking or eye contact) while allowing animated participation to differentiate within engaged states.

### Trend Calculation

The `MetricsEngine` computes an engagement trend (`rising`, `stable`, `declining`) over a sliding window of recent snapshots using linear regression:

- The average engagement of both participants is computed per snapshot.
- A simple linear regression slope is fitted over the window (default 10 snapshots = 5 seconds at 2 Hz).
- Slope magnitude must exceed 0.02 to register as trending; otherwise the trend is `stable`.

---

## 6. Validation Methodology

### Unit Test Coverage

The following modules have dedicated test files covering core logic:

| Module | Test File | Coverage Focus |
|--------|-----------|----------------|
| Eye contact classifier | `eyeContactClassifier.test.ts` | Threshold boundaries, head pose cutoffs, smooth gradient behavior |
| Gaze estimation | `gazeEstimation.test.ts` | Landmark-to-ratio conversion, head pose calculation |
| Expression analysis | `expressionAnalysis.test.ts` | Blendshape extraction, EMA activity computation, energy formula |
| Voice energy | `voiceEnergy.test.ts` | RMS, spectral centroid, composite energy |
| VAD (threshold) | `vad.test.ts` | Onset/offset timing, speech band filtering |
| VAD (ML wrapper) | `VadManager.test.ts` | Initialization, speaking state management |
| Speech rate | `speechRate.test.ts` | Peak counting, syllable rate normalization |
| Talk time | `talkTime.test.ts` | Accumulation accuracy, silence tracking |
| Audio pipeline | `AudioPipeline.test.ts` | End-to-end audio processing, speech hold behavior |
| Video pipeline | `VideoPipeline.test.ts` | End-to-end video processing, blink gate, confidence filtering |
| Metrics engine | `MetricsEngine.test.ts` | Snapshot computation, trend calculation, stale data handling |
| Interruption detector | `interruptionDetector.test.ts` | Overlap detection, cooldowns, debounce, watermark ordering |
| Pitch tracker | `pitchTracker.test.ts` | Pitch extraction, variance computation |
| Nudge engine | `NudgeEngine.test.ts` | Coaching rule triggers, cooldown behavior |

### Live Testing with Ground Truth

Metrics were validated through iterative live testing sessions where a human observer served as ground truth:

- **Eye contact**: Observer noted when the participant was visibly looking at the camera vs. looking away. The classifier output was compared against these observations, and thresholds were adjusted to minimize false negatives (looking at camera but scored low) and false positives (looking away but scored high).
- **Speaking time**: VAD output was compared against manual annotation of speech segments. The 800ms speech hold and 600ms ML VAD redemption period were tuned to minimize fragmentation of continuous speech.
- **Interruptions**: Two-person sessions with scripted interruption patterns were used to verify detection accuracy. The 500ms overlap threshold and 1000ms established-speaker requirement were calibrated to exclude backchanneling while catching genuine interruptions.
- **Energy**: Expression energy was validated by having participants perform known actions (smiling, nodding, raising eyebrows) and verifying the corresponding sub-metric response. Voice energy was validated against perceived vocal dynamics.

### Iterative Threshold Tuning

All thresholds were established through empirical observation across multiple webcam setups, lighting conditions, and participant demographics, then refined through iterative adjustment:

- Initial values were set based on published research on facial action unit activation ranges and speech signal processing conventions.
- Each threshold was stress-tested under degraded conditions (low light, off-angle webcam, noisy environment) to find the point where the metric failed gracefully rather than producing misleading values.
- The blink gate, speech hold, and interruption cooldowns were all added in response to specific false-positive patterns observed during live testing.

---

## 7. Calibration Reference

### Eye Contact

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Horizontal threshold | 0.35 | Maximum horizontal gaze deviation from center before score drops to 0 |
| Vertical threshold | 0.40 | Maximum vertical deviation; slightly wider than horizontal to accommodate reading |
| Vertical center | 0.45 | Shifted down from 0.50 to compensate for top-mounted webcams |
| Max head yaw | 45 deg | Hard cutoff for head rotation; beyond this, eye contact is impossible |
| Max head pitch | 35 deg | Hard cutoff for head tilt |
| Eye contact gate (engagement) | 0.50 | Binary threshold for engagement score: above = engaged, below = not |
| Face confidence threshold | 0.70 | Minimum face detection confidence to use frame data |

### Voice Activity Detection

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| ML VAD positive speech threshold | 0.35 | Probability threshold for speech classification |
| ML VAD redemption period | 600ms | Grace period before ending a speech segment |
| Fallback RMS silence threshold | 0.01 | RMS below this is considered silence |
| Fallback speech band | 85-3000 Hz | Frequency range for speech energy ratio |
| Fallback speech band ratio | 0.30 | Minimum speech-band energy proportion |
| Fallback onset frames | 2 (100ms) | Consecutive active frames to start speech |
| Fallback offset frames | 15 (750ms) | Consecutive silent frames to end speech |
| Client-side speech hold | 800ms | Debounce to bridge brief VAD drops |

### Interruption Detection

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Minimum overlap | 500ms | Excludes backchanneling and brief simultaneous starts |
| Established speaker time | 1000ms | Original speaker must be talking this long before interruption can be detected |
| Speech gap debounce | 500ms | Brief pauses do not reset speaker status |
| Cooldown (continuous) | 3000ms | Minimum time between interruptions if interrupted speaker kept talking |
| Cooldown (paused) | 2000ms | Minimum time between interruptions if interrupted speaker paused |

### Expression Energy

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Energy decay | 0.84 | Half-life of ~2 seconds at ~2 FPS; smooths energy transitions |
| EMA decay (nod activity) | 0.20 | Fast decay for head nod detection; activity vanishes in ~1 second |
| Eye wideness scale | 15x | Compensates for MediaPipe's low dynamic range (0-0.08) on webcams |
| Head nod pitch scale | 15 | Scales small radian deltas to 0-1 range |
| Smile curve | sqrt | Boosts subtle smiles: sqrt(0.25) = 0.50, sqrt(0.50) = 0.71 |

### Voice Energy

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Volume variance scale | 100x | Scales RMS variance to 0-1 range |
| Spectral brightness normalization | /4000 Hz | Maps spectral centroid to 0-1; 4 kHz = maximum brightness |
| Speech rate normalization | /8 syl/s | Maps syllable rate to 0-1; 8 syllables/sec = maximum |
| RMS history size | 100 samples | ~5 seconds at 20 Hz sample rate |
| Peak minimum distance | sampleRate/10 | ~100ms between amplitude peaks (syllable boundaries) |

### Stale Data Handling

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Stale threshold | 3000ms | Data older than 3 seconds is considered stale |
| Stale behavior | Null/zero | Stale video: eyeContact = null, faceDetected = false. Stale audio: talkTime = null, isSpeaking = null |
