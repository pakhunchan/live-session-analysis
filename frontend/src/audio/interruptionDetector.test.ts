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

  it('brief overlap below minOverlap produces no interruption', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500 });
    det.update(true, false, 0);      // tutor speaking
    det.update(true, true, 1000);    // overlap starts
    det.update(true, false, 1300);   // overlap ends after 300ms < 500ms
    expect(det.getCount()).toBe(0);
  });

  it('long overlap triggers interruption', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, cooldownMs: 0 });
    det.update(true, false, 0);      // tutor speaking
    det.update(true, true, 1000);    // overlap starts
    det.update(false, true, 1600);   // overlap ends after 600ms > 500ms threshold
    expect(det.getCount()).toBe(1);
  });

  it('interrupter is correctly identified (second speaker)', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, cooldownMs: 0 });
    det.update(true, false, 0);      // tutor was speaking first
    det.update(true, true, 1000);    // student starts = student interrupts
    det.update(false, true, 1600);   // overlap ends

    const interruptions = det.getInterruptions();
    expect(interruptions).toHaveLength(1);
    expect(interruptions[0].interrupter).toBe('student');
  });

  it('cooldown suppresses rapid re-detection', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, cooldownMs: 2000 });
    det.update(true, false, 0);
    det.update(true, true, 1000);
    det.update(false, true, 1600);  // first interruption at 1600ms
    expect(det.getCount()).toBe(1);

    det.update(true, false, 2000);
    det.update(true, true, 2500);
    det.update(false, true, 3100);  // second overlap at 3100ms, but within 2000ms cooldown of 1600
    expect(det.getCount()).toBe(1); // still 1, suppressed
  });

  it('second interruption fires after cooldown expires', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 500, cooldownMs: 2000 });
    det.update(true, false, 0);
    det.update(true, true, 1000);
    det.update(false, true, 1600);  // first interruption at 1600ms
    expect(det.getCount()).toBe(1);

    // New overlap ending at 4000ms — 2400ms after last interruption, past 2000ms cooldown
    det.update(true, false, 3000);
    det.update(true, true, 3400);
    det.update(false, true, 4000);  // 600ms overlap, ends 2400ms after cooldown started
    expect(det.getCount()).toBe(2);
  });

  it('multiple interruptions accumulate', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0 });
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
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0 });
    det.update(true, false, 0);
    det.update(true, true, 1000);
    det.update(false, true, 1300);
    expect(det.getCount()).toBe(1);

    det.reset();
    expect(det.getCount()).toBe(0);
  });

  it('timestamps are correct', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0 });
    det.update(true, false, 0);
    det.update(true, true, 5000);
    det.update(false, true, 5500);

    const interruptions = det.getInterruptions();
    expect(interruptions[0].timestamp).toBe(5500);
    expect(interruptions[0].durationMs).toBe(500);
  });
});

describe('InterruptionDetector categorization', () => {
  it('categorizes as student_interrupted when tutor spoke >1s before student interrupts', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, establishedSpeakerMs: 1000 });
    det.update(true, false, 0);       // tutor starts speaking at 0
    det.update(true, true, 1500);     // student starts at 1500 (tutor spoke for 1500ms > 1000)
    det.update(false, true, 1800);    // overlap ends

    const interruptions = det.getInterruptions();
    expect(interruptions).toHaveLength(1);
    expect(interruptions[0].category).toBe('student_interrupted');
    expect(interruptions[0].interrupter).toBe('student');
  });

  it('categorizes as tutor_interrupted when student spoke >1s before tutor interrupts', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, establishedSpeakerMs: 1000 });
    det.update(false, true, 0);       // student starts speaking at 0
    det.update(true, true, 1500);     // tutor starts at 1500 (student spoke for 1500ms > 1000)
    det.update(true, false, 1800);    // overlap ends

    const interruptions = det.getInterruptions();
    expect(interruptions).toHaveLength(1);
    expect(interruptions[0].category).toBe('tutor_interrupted');
    expect(interruptions[0].interrupter).toBe('tutor');
  });

  it('categorizes as accident when original speaker was talking <1s', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, establishedSpeakerMs: 1000 });
    det.update(true, false, 0);       // tutor starts at 0
    det.update(true, true, 500);      // student starts at 500 (tutor only spoke 500ms < 1000)
    det.update(false, true, 800);     // overlap ends

    const interruptions = det.getInterruptions();
    expect(interruptions).toHaveLength(1);
    expect(interruptions[0].category).toBe('accident');
  });

  it('categorizes as accident even when overlap is long (pre-overlap speaking <1s)', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, establishedSpeakerMs: 1000 });
    det.update(true, false, 0);       // tutor starts at 0
    det.update(true, true, 500);      // student starts at 500 (tutor spoke only 500ms)
    det.update(false, true, 2000);    // overlap lasts 1500ms — but tutor was NOT established

    const interruptions = det.getInterruptions();
    expect(interruptions).toHaveLength(1);
    expect(interruptions[0].category).toBe('accident');
  });

  it('getCounts() returns categorized counts', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, establishedSpeakerMs: 1000 });

    // student_interrupted: tutor spoke >1s, student interrupts
    det.update(true, false, 0);
    det.update(true, true, 1500);
    det.update(false, true, 1800);

    // accident: tutor spoke <1s, student interrupts
    det.update(true, false, 3000);
    det.update(true, true, 3500);
    det.update(false, true, 3800);

    // tutor_interrupted: student spoke >1s, tutor interrupts
    det.update(false, true, 5000);
    det.update(true, true, 6500);
    det.update(true, false, 6800);

    const counts = det.getCounts();
    expect(counts.student).toBe(1);
    expect(counts.tutor).toBe(1);
    expect(counts.accident).toBe(1);
    expect(det.getCount()).toBe(3);
  });

  it('reset clears speak start timestamps', () => {
    const det = new InterruptionDetector({ minOverlapDurationMs: 200, cooldownMs: 0, establishedSpeakerMs: 1000 });
    det.update(true, false, 0);
    det.update(true, true, 1500);
    det.update(false, true, 1800);
    expect(det.getCounts().student).toBe(1);

    det.reset();
    expect(det.getCounts()).toEqual({ student: 0, tutor: 0, accident: 0 });
  });
});
