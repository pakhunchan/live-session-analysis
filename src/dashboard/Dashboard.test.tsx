import { describe, it, expect } from 'vitest';
import React from 'react';

// Basic smoke test — full rendering requires Chart.js canvas which jsdom doesn't support well
describe('Dashboard', () => {
  it('module exports a React component', async () => {
    const mod = await import('./Dashboard');
    expect(typeof mod.default).toBe('function');
  });

  it('MetricGauge module loads', async () => {
    const mod = await import('./MetricGauge');
    expect(typeof mod.default).toBe('function');
  });

  it('SessionStatusBar module loads', async () => {
    const mod = await import('./SessionStatusBar');
    expect(typeof mod.default).toBe('function');
  });
});
