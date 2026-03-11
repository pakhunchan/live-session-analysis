import { describe, it, expect } from 'vitest';
import { InterruptionDetector } from './interruptionDetector';

describe('InterruptionDetector', () => {
  it('no overlap produces no interruption', () => {
    const det = new InterruptionDetector();
    det.update(true, false, 0);
    det.update(true, false, 1000);
    det.update(false, true, 2000);
    det.update(false, true, 3000);
    expect(det.getCount()).toBe(0);
  });

  it('brief overlap below threshold produces no interruption', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, backchannelThresholdMs: 400 });
    det.update(true, false, 0);      // tutor speaking
    det.update(true, true, 1000);    // overlap starts
    det.update(true, false, 1300);   // overlap ends after 300ms < 400ms backchannel
    expect(det.getCount()).toBe(0);
  });

  it('long overlap triggers interruption', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, cooldownMs: 0, backchannelThresholdMs: 400 });
    det.update(true, false, 0);      // tutor speaking
    det.update(true, true, 1000);    // overlap starts
    det.update(false, true, 1600);   // overlap ends after 600ms > 500ms threshold
    expect(det.getCount()).toBe(1);
  });

  it('interrupter is correctly identified (second speaker)', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, cooldownMs: 0, backchannelThresholdMs: 0 });
    det.update(true, false, 0);      // tutor was speaking first
    det.update(true, true, 1000);    // student starts = student interrupts
    det.update(false, true, 1600);   // overlap ends

    const interruptions = det.getInterruptions();
    expect(interruptions).toHaveLength(1);
    expect(interruptions[0].interrupter).toBe('student');
  });

  it('cooldown suppresses rapid re-detection', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, cooldownMs: 2000, backchannelThresholdMs: 0 });
    det.update(true, false, 0);
    det.update(true, true, 1000);
    det.update(false, true, 1600);  // first interruption at 1600ms
    expect(det.getCount()).toBe(1);

    det.update(true, false, 2000);
    det.update(true, true, 2500);
    det.update(false, true, 3100);  // second overlap at 3100ms, but within 2000ms cooldown of 1600
    expect(det.getCount()).toBe(1); // still 1, suppressed
  });

  it('backchannel filter works', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 300, cooldownMs: 0, backchannelThresholdMs: 400 });
    det.update(true, false, 0);
    det.update(true, true, 1000);
    det.update(true, false, 1350); // 350ms overlap < 400ms backchannel
    expect(det.getCount()).toBe(0);
  });

  it('multiple interruptions accumulate', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, backchannelThresholdMs: 0 });
    // First interruption
    det.update(true, false, 0);
    det.update(true, true, 1000);
    det.update(false, true, 1300);
    // Second interruption
    det.update(false, true, 2000);
    det.update(true, true, 3000);
    det.update(true, false, 3300);

    expect(det.getCount()).toBe(2);
  });

  it('reset clears all state', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, backchannelThresholdMs: 0 });
    det.update(true, false, 0);
    det.update(true, true, 1000);
    det.update(false, true, 1300);
    expect(det.getCount()).toBe(1);

    det.reset();
    expect(det.getCount()).toBe(0);
  });

  it('timestamps are correct', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, backchannelThresholdMs: 0 });
    det.update(true, false, 0);
    det.update(true, true, 5000);
    det.update(false, true, 5500);

    const interruptions = det.getInterruptions();
    expect(interruptions[0].timestamp).toBe(5500);
    expect(interruptions[0].durationMs).toBe(500);
  });
});
