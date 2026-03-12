import type { LatencyTrace } from '../types';

export interface LatencyBreakdown {
  clientProcessing: number;   // t2 - t0 (same machine — exact)
  studentToServer: number;    // (t3 - clockOffset) - t2 (cross-machine — estimated)
  serverProcessing: number;   // t4 - t3 (same machine — exact)
  serverToTutor: number;      // (t5 + tutorOffset) - t4 (cross-machine — estimated)
  clientIngestion: number;    // t6 - t5 (same machine — exact)
  totalE2E: number;           // sum of all legs
  sampleCount: number;        // total traces ingested
}

const EMPTY_BREAKDOWN: LatencyBreakdown = {
  clientProcessing: 0,
  studentToServer: 0,
  serverProcessing: 0,
  serverToTutor: 0,
  clientIngestion: 0,
  totalE2E: 0,
  sampleCount: 0,
};

// EMA smoothing factor — higher = more responsive, lower = more stable
const ALPHA = 0.3;

function ema(prev: number, next: number): number {
  return prev === 0 ? next : prev * (1 - ALPHA) + next * ALPHA;
}

export class LatencyTracker {
  private breakdown: LatencyBreakdown = { ...EMPTY_BREAKDOWN };
  private tutorClockOffset = 0;

  setTutorClockOffset(offset: number): void {
    this.tutorClockOffset = offset;
  }

  ingestTrace(trace: LatencyTrace): void {
    // Only process complete remote traces (Student → Backend → Tutor)
    // Local-only traces (tutor processing student data locally) lack t3/t4/t5
    // and would show misleading 0ms network legs — skip them.
    if (
      trace.t3_serverRecv == null ||
      trace.t4_serverFwd == null ||
      trace.t5_clientRecv == null ||
      trace.t6_ingested == null
    ) {
      return;
    }

    const senderOffset = trace.clockOffset ?? 0;

    const clientProcessing = Math.max(0, trace.t2_sent - trace.t0_capture);
    const studentToServer = Math.max(0, (trace.t3_serverRecv - senderOffset) - trace.t2_sent);
    const serverProcessing = Math.max(0, trace.t4_serverFwd - trace.t3_serverRecv);
    const serverToTutor = Math.max(0, (trace.t5_clientRecv + this.tutorClockOffset) - trace.t4_serverFwd);
    const clientIngestion = Math.max(0, trace.t6_ingested - trace.t5_clientRecv);
    const totalE2E = clientProcessing + studentToServer + serverProcessing + serverToTutor + clientIngestion;

    this.breakdown = {
      clientProcessing: ema(this.breakdown.clientProcessing, clientProcessing),
      studentToServer: ema(this.breakdown.studentToServer, studentToServer),
      serverProcessing: ema(this.breakdown.serverProcessing, serverProcessing),
      serverToTutor: ema(this.breakdown.serverToTutor, serverToTutor),
      clientIngestion: ema(this.breakdown.clientIngestion, clientIngestion),
      totalE2E: ema(this.breakdown.totalE2E, totalE2E),
      sampleCount: this.breakdown.sampleCount + 1,
    };
  }

  getBreakdown(): LatencyBreakdown {
    return { ...this.breakdown };
  }
}
