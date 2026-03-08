import { describe, it, expect } from 'vitest';
import { TalkTimeAccumulator } from './talkTime';

describe('TalkTimeAccumulator', () => {
  it('both silent returns 0%', () => {
    const tt = new TalkTimeAccumulator();
    tt.update(false, false, 0);
    tt.update(false, false, 1000);
    const pct = tt.getTalkTimePercent();
    expect(pct.tutor).toBe(0);
    expect(pct.student).toBe(0);
  });

  it('tutor only speaking returns ~100% tutor', () => {
    const tt = new TalkTimeAccumulator();
    tt.update(true, false, 0);
    tt.update(true, false, 1000);
    const pct = tt.getTalkTimePercent();
    expect(pct.tutor).toBe(1);
    expect(pct.student).toBe(0);
  });

  it('50/50 split', () => {
    const tt = new TalkTimeAccumulator();
    tt.update(true, false, 0);
    tt.update(true, false, 500);
    tt.update(false, true, 500);
    tt.update(false, true, 1000);
    const pct = tt.getTalkTimePercent();
    expect(pct.tutor).toBeCloseTo(0.5, 1);
    expect(pct.student).toBeCloseTo(0.5, 1);
  });

  it('silence duration is 0 when someone is speaking', () => {
    const tt = new TalkTimeAccumulator();
    tt.update(true, false, 0);
    tt.update(true, false, 1000);
    expect(tt.getCurrentSilenceDurationMs()).toBe(0);
  });

  it('silence accumulates when neither speaks', () => {
    const tt = new TalkTimeAccumulator();
    tt.update(false, false, 0);
    tt.update(false, false, 500);
    tt.update(false, false, 1000);
    expect(tt.getCurrentSilenceDurationMs()).toBe(1000);
  });

  it('reset zeroes all state', () => {
    const tt = new TalkTimeAccumulator();
    tt.update(true, false, 0);
    tt.update(true, false, 1000);
    tt.reset();
    const pct = tt.getTalkTimePercent();
    expect(pct.tutor).toBe(0);
    expect(tt.getCurrentSilenceDurationMs()).toBe(0);
  });
});
