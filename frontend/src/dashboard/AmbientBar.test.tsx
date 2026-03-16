import { describe, it, expect } from 'vitest';

describe('AmbientBar', () => {
  it('module exports a React component', async () => {
    const mod = await import('./AmbientBar');
    expect(typeof mod.default).toBe('function');
  });
});

describe('NudgeEngine module', () => {
  it('module exports NudgeEngine class', async () => {
    const mod = await import('../coaching/NudgeEngine');
    expect(typeof mod.NudgeEngine).toBe('function');
  });
});
