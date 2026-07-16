import { describe, it, expect } from 'vitest';
import { RollingWindow, formatMs } from '../src/perfStats.js';

describe('RollingWindow', () => {
  it('returns null quantiles until a sample exists', () => {
    const w = new RollingWindow();
    expect(w.quantile(0.5)).toBeNull();
    expect(w.count).toBe(0);
  });

  it('computes median and p95 over the window', () => {
    const w = new RollingWindow();
    for (let ms = 1; ms <= 100; ms++) w.push(ms);
    expect(w.quantile(0.5)).toBe(50);
    expect(w.quantile(0.95)).toBe(95);
  });

  it('a single GC-pause outlier barely moves the median', () => {
    const w = new RollingWindow();
    for (let i = 0; i < 99; i++) w.push(16.7);
    w.push(400);
    expect(w.quantile(0.5)).toBe(16.7);
  });

  it('slides: old samples fall out at capacity', () => {
    const w = new RollingWindow(10);
    for (let i = 0; i < 10; i++) w.push(100);
    for (let i = 0; i < 10; i++) w.push(5);
    expect(w.count).toBe(10);
    expect(w.quantile(0.5)).toBe(5);
  });
});

describe('formatMs', () => {
  it('formats one decimal, dashes for null', () => {
    expect(formatMs(16.666)).toBe('16.7ms');
    expect(formatMs(null)).toBe('—');
  });
});
