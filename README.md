# Live Session Analysis

Real-time tutoring session analytics platform. A tutor and student connect via LiveKit WebRTC video/audio. Each device runs local MediaPipe face detection and Web Audio API analysis pipelines, producing per-frame metrics. These are relayed through a WebSocket backend that performs interruption detection and session accumulation. The tutor's dashboard renders engagement/energy scores, coaching nudges, and a session timeline in real time. On session end, an LLM generates coaching recommendations.

**Live:** [live-session-analysis.pakhunchan.com](https://live-session-analysis.pakhunchan.com)

---

## Install & Setup Guide

### Prerequisites

- **Node.js 20+** (matches the Docker production image)
- **npm**
- **AWS CLI + AWS CDK** (`npm install -g aws-cdk`) — only needed for backend deployment
- **Docker** — only needed for backend deployment (ECS runs a Docker container)

### Clone

```bash
git clone https://github.com/<your-org>/live-session-analysis.git
cd live-session-analysis
```

### Install All Dependencies

```bash
npm run install:all
```

Or install each package individually:

```bash
cd frontend && npm install
cd ../backend && npm install
```

### Environment Variables

#### Frontend (`frontend/`)

Create a `.env.local` in the `frontend/` directory (Vite picks up `VITE_*` vars automatically):

| Variable | Description | Example (local dev) |
|----------|-------------|---------------------|
| `VITE_LIVEKIT_URL` | LiveKit SFU WebSocket URL | `wss://livekit.pakhunchan.com` |
| `VITE_API_BASE_URL` | Backend REST API base URL | `http://localhost:3001` |
| `VITE_WS_URL` | Backend WebSocket URL | `ws://localhost:3001/ws/metrics` |

Production values are in `frontend/.env.production`.

#### Backend (`.env.local` at repo root)

Create a `.env.local` in the **repo root** (the backend dev script reads `../.env.local`):

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (used for LLM recommendations) |
| `LANGCHAIN_API_KEY` | LangSmith API key (used for tracing) |
| `LIVEKIT_API_KEY` | LiveKit API key (used for token generation) |
| `LIVEKIT_API_SECRET` | LiveKit API secret (used for token generation) |

The backend also sets `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_PROJECT=live-session-analysis` in production (see `infra/lib/backend-stack.ts`).

### Run Locally

```bash
# Start both frontend and backend concurrently
npm run dev

# Or start them individually:
npm run dev:frontend   # Vite dev server (frontend/)
npm run dev:backend    # tsx with .env.local (backend/)
```

The frontend runs on Vite's default port (usually `http://localhost:5173`).
The backend listens on port `3001`.

### Run Tests

```bash
# Frontend unit tests (Vitest)
npm test

# Watch mode
cd frontend && npm run test:watch
```

### Run LLM Evals

```bash
npm run eval
```

This runs `backend/evals/run.ts` using the env vars from `.env.local`.

### Production Deploy

```bash
# Frontend — auto-deploys on push to main (Vercel)
git push origin main

# Backend — manual CDK deploy (AWS ECS)
export $(grep -v '^#' .env.local | xargs)
cd infra && npx cdk deploy
```

---

## Architecture

```mermaid
graph TB
    subgraph "Student Device (Browser)"
        S_CAM[Camera + Mic]
        S_LK[LiveKit SDK]
        S_VP[VideoPipeline<br/>2 Hz]
        S_AP[AudioPipeline<br/>20 Hz]
        S_MT[MetricsTransport<br/>WebSocket Client]

        S_CAM --> S_LK
        S_CAM --> S_VP
        S_CAM --> S_AP
        S_VP --> S_MT
        S_AP --> S_MT
    end

    subgraph "Tutor Device (Browser)"
        T_CAM[Camera + Mic]
        T_LK[LiveKit SDK]
        T_VP[VideoPipeline<br/>2 Hz]
        T_AP[AudioPipeline<br/>20 Hz]
        T_ME[MetricsEngine<br/>500ms snapshots]
        T_NE[NudgeEngine]
        T_DASH[Dashboard UI]
        T_MT[MetricsTransport<br/>WebSocket Client]

        T_CAM --> T_LK
        T_CAM --> T_VP
        T_CAM --> T_AP
        T_VP --> T_ME
        T_AP --> T_ME
        T_MT -->|student metrics| T_ME
        T_ME --> T_NE
        T_ME --> T_DASH
        T_NE --> T_DASH
    end

    subgraph "LiveKit Cloud"
        LK_SFU[LiveKit SFU<br/>livekit.pakhunchan.com]
    end

    subgraph "AWS ECS – us-west-2"
        ALB[ALB + HTTPS<br/>lsa-api.pakhunchan.com]
        subgraph "ECS Task – t3.small"
            WS[WebSocket Relay<br/>/ws/metrics]
            ID[InterruptionDetector]
            SA[SessionAccumulator]
            API[REST API<br/>Express]
        end
        WS --> ID
        WS --> SA
        ALB --> WS
        ALB --> API
    end

    subgraph "External Services"
        OAI[OpenAI gpt-4o-mini]
        LS[LangSmith Tracing]
    end

    S_LK <-->|WebRTC| LK_SFU
    T_LK <-->|WebRTC| LK_SFU
    S_MT -->|wss://| ALB
    T_MT <-->|wss://| ALB
    WS -->|relay student metrics| T_MT
    API -->|POST /api/recommendations| OAI
    API -.->|trace| LS

    subgraph "Vercel"
        FE[Frontend Build<br/>live-session-analysis.pakhunchan.com]
    end
```

---

## Real-Time Metrics Pipeline

```mermaid
flowchart LR
    subgraph "Video Pipeline – Browser, 2 Hz"
        V1[Camera Frame] --> V2[MediaPipe<br/>FaceLandmarker<br/>WASM]
        V2 --> V3[Gaze Estimation<br/>iris position + head pose]
        V3 --> V4[Eye Contact<br/>Classifier<br/>0-1 score]
        V2 --> V5[Blendshape<br/>Feature Extraction]
        V5 --> V6[Expression Energy<br/>smile + nod + wideness<br/>exponential decay]
        V5 --> V7[Blink Gate<br/>holds score during blinks]
    end

    subgraph "Audio Pipeline – Browser, 20 Hz"
        A1[Mic Samples] --> A0[Biquad Bandpass<br/>85-3000 Hz]
        A0 --> A2[Meyda<br/>RMS + Spectral Centroid]
        A0 --> A3[VAD<br/>vad-web ML / fallback]
        A0 --> A4[PitchTracker<br/>YIN algorithm]
        A2 --> A5[Volume Variance]
        A2 --> A6[Spectral Brightness<br/>centroid / 4000 Hz]
        A2 --> A7[Speech Rate<br/>amplitude peak counting]
        A5 --> A8[Voice Energy<br/>min 1, volVar + bright + speechRate]
        A6 --> A8
        A7 --> A8
    end

    subgraph "MetricsEngine – Tutor Browser, 2 Hz"
        ME1[Ingest Data Points]
        ME2[Produce Snapshot]
        ME3[Engagement Score]
        ME4[Energy Score]
        ME5[Trend Analysis]
        ME1 --> ME2 --> ME3
        ME2 --> ME4
        ME2 --> ME5
    end

    V4 --> ME1
    V6 --> ME1
    A3 --> ME1
    A8 --> ME1
```

---

## Scoring Formulas

### Engagement Score

```mermaid
graph TD
    IS{isSpeaking?}
    IS -->|Yes| SPEAK["0.8 + voiceEnergy x 0.2<br/><i>Range: 0.80 - 1.00</i>"]
    IS -->|No| EYE{"eyeContact >= 0.50?"}
    EYE -->|Yes| GATE1["eyeGate = 1"]
    EYE -->|No| GATE0["eyeGate = 0"]
    GATE1 --> SILENT["eyeGate x 0.8 + videoEnergy x 0.2<br/><i>Range: 0.00 - 1.00</i>"]
    GATE0 --> SILENT
```

### Energy Score (Dashboard Display)

| State | Displayed Value | Source |
|-------|----------------|--------|
| Speaking | `voiceEnergy` | `min(1, volumeVariance + spectralBrightness + speechRate)` |
| Not speaking | `expressionEnergy` | `min(1, genuineSmile + headNodActivity + eyeWideness)` with exponential decay |

---

## Backend Flow

```mermaid
sequenceDiagram
    participant S as Student Browser
    participant WS as WebSocket Relay<br/>(AWS ECS)
    participant ID as InterruptionDetector
    participant SA as SessionAccumulator
    participant T as Tutor Browser
    participant OAI as OpenAI<br/>(External)

    S->>WS: join { roomName, role: 'student' }
    T->>WS: join { roomName, role: 'tutor' }

    loop Clock Sync (every 10s)
        S->>WS: clock-sync { clientTs }
        WS-->>S: clock-sync-ack { clientTs, serverTs }
    end

    loop Metrics Stream
        S->>WS: metrics { dataPoint }
        WS->>ID: push(audio data, corrected timestamp)
        WS->>SA: ingest(dataPoint)
        WS->>T: relay { dataPoint }
    end

    loop Every 1s
        ID-->>T: interruptions { student: N, tutor: N }
    end

    T->>WS: POST /api/recommendations { roomName }
    WS->>SA: getSessionSummary()
    WS->>OAI: generateRecommendations(summary)
    OAI-->>WS: recommendations[]
    WS-->>T: { recommendations, summary }
```

---

## Interruption Detection (Backend – AWS ECS)

Watermark-based processor running on corrected timestamps (NTP-style clock offset):

| Parameter | Value |
|-----------|-------|
| Established speaker threshold | 1000 ms |
| Minimum overlap for interruption | 500 ms |
| Speech gap debounce | 500 ms |
| Cooldown (speaker continues) | 3000 ms |
| Cooldown (speaker paused) | 2000 ms |

---

## Coaching Nudges (Client-side – Tutor Browser)

Evaluated on every metric snapshot, suppressed while tutor is speaking:

| Rule | Trigger | Cooldown |
|------|---------|----------|
| `student_silent` | Silence > 3 min | 2 min |
| `low_eye_contact` | Distraction > 4 s (face detected) | 90 s |
| `tutor_talk_dominant` | Tutor talk > 80% (after 60 s) | 2 min |
| `energy_drop` | Declining trend + low energy both sides | 3 min |
| `interruption_spike` | Total interruptions >= 3 | 3 min |

Rate limit: max 3 nudges/minute.

---

## Deployment

```mermaid
graph LR
    subgraph "Vercel – Auto-deploy on push to main"
        FE["Frontend<br/>Vite + React<br/>live-session-analysis.pakhunchan.com"]
    end

    subgraph "AWS us-west-2 – Manual cdk deploy"
        R53["Route53<br/>lsa-api.pakhunchan.com"]
        ACM["ACM Certificate<br/>HTTPS"]
        ALB2["Application Load Balancer<br/>idle timeout 120s<br/>sticky sessions 24h"]
        VPC["VPC – 2 public subnets"]
        ASG["Auto Scaling Group<br/>t3.small x 1"]
        ECS2["ECS Service<br/>Docker container<br/>port 3001, 896 MiB"]

        R53 --> ALB2
        ACM --> ALB2
        VPC --> ASG --> ECS2
        ALB2 --> ECS2
    end

    subgraph "LiveKit Cloud"
        LK2["LiveKit SFU<br/>livekit.pakhunchan.com"]
    end

    subgraph "External APIs"
        OAI2["OpenAI API<br/>gpt-4o-mini"]
        LS2["LangSmith<br/>Tracing"]
    end

    FE -->|"wss://"| ALB2
    FE -->|"WebRTC"| LK2
    ECS2 -->|"HTTPS"| OAI2
    ECS2 -.->|"trace"| LS2
```

### Deploy Commands

```bash
# Frontend — auto-deploys on push to main (Vercel)
git push origin main

# Backend — manual CDK deploy (AWS ECS)
export $(grep -v '^#' .env.local | xargs)
cd infra && npx cdk deploy
```

---

## Project Structure

```
live-session-analysis/
├── frontend/                    # Vite + React — deployed on Vercel
│   └── src/
│       ├── audio/               # AudioPipeline, VAD, pitch, speech rate, voice energy
│       ├── video/               # VideoPipeline, FaceDetector, gaze, expression analysis
│       ├── core/                # MetricsEngine, EventBus, StreamManager, engagement
│       ├── coaching/            # NudgeEngine, default rules, AmbientBar
│       ├── dashboard/           # React UI — Sidebar, donuts, timeline, session setup
│       │   └── hooks/           # useMetricsEngine (tutor), useStudentPipeline (student)
│       ├── inputs/              # LiveKit adapter, file/live input adapters
│       └── types/               # TypeScript interfaces
├── backend/                     # Node.js Express + WS — deployed on AWS ECS
│   └── server/
│       ├── ws/                  # metricsRelay, interruptionDetector, sessionAccumulator
│       ├── routes/              # recommendations, livekit-token, health
│       └── langsmith/           # OpenAI call with LangSmith tracing
├── shared/                      # Shared types (frontend + backend)
└── infra/                       # AWS CDK stack (VPC, ECS, ALB, Route53, ACM)
```

---

## Tech Stack

| Layer | Technology | Runs On |
|-------|-----------|---------|
| Frontend framework | React + Vite + TypeScript | Vercel |
| Video/audio streaming | LiveKit (WebRTC SFU) | LiveKit Cloud |
| Face detection | MediaPipe FaceLandmarker (WASM) | Browser |
| Audio features | Meyda (RMS, spectral centroid) | Browser |
| Pitch detection | pitchfinder (YIN algorithm) | Browser |
| Voice activity | @ricky0123/vad-web (ML) + threshold fallback | Browser |
| Raw audio capture | Web Audio API (AnalyserNode + BiquadFilter) | Browser |
| Backend runtime | Node.js + Express + ws | AWS ECS |
| LLM recommendations | OpenAI gpt-4o-mini | OpenAI API |
| Observability | LangSmith tracing | LangSmith Cloud |
| Frontend hosting | Vercel (auto-deploy) | Vercel |
| Backend hosting | ECS on EC2 (t3.small) | AWS us-west-2 |
| Infrastructure-as-code | AWS CDK | AWS CloudFormation |
