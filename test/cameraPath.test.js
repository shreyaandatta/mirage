import { describe, it, expect } from 'vitest';
import { CameraPath } from '../src/cameraPath.js';

const KEYFRAMES = [
  { position: [0, 0, 0], target: [0, 0, -1] },
  { position: [5, 0, 0], target: [5, 0, -1] },
  { position: [10, 0, 0], target: [10, 0, -1] },
];

describe('CameraPath.sample', () => {
  it('passes exactly through the first and last keyframes', () => {
    const path = new CameraPath(KEYFRAMES, 6);
    const start = path.sample(0);
    const end = path.sample(1);
    expect(start.position[0]).toBeCloseTo(0, 5);
    expect(end.position[0]).toBeCloseTo(10, 5);
    expect(end.target[0]).toBeCloseTo(10, 5);
  });

  it('clamps progress outside [0,1]', () => {
    const path = new CameraPath(KEYFRAMES, 6);
    expect(path.sample(-1).position[0]).toBeCloseTo(0, 5);
    expect(path.sample(2).position[0]).toBeCloseTo(10, 5);
  });

  it('moves monotonically along a straight-line path (eased, no backtracking)', () => {
    const path = new CameraPath(KEYFRAMES, 6);
    let prev = -Infinity;
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const x = path.sample(u).position[0];
      expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = x;
    }
  });

  it('eases in and out: early progress is slower than mid progress', () => {
    const path = new CameraPath(KEYFRAMES, 6);
    const early = path.sample(0.1).position[0] - path.sample(0).position[0];
    const mid = path.sample(0.55).position[0] - path.sample(0.45).position[0];
    expect(mid).toBeGreaterThan(early);
  });

  it('with a single keyframe, always returns that pose', () => {
    const path = new CameraPath([KEYFRAMES[0]], 6);
    expect(path.sample(0.5).position).toEqual([0, 0, 0]);
  });

  it('with no keyframes, returns null', () => {
    const path = new CameraPath([], 6);
    expect(path.sample(0.5)).toBeNull();
  });
});

describe('CameraPath URL round-trip', () => {
  it('survives encode → decode with keyframes and duration intact', () => {
    const path = new CameraPath(KEYFRAMES, 4.5);
    const restored = CameraPath.fromURLValue(path.toURLValue());
    expect(restored.durationSec).toBe(4.5);
    expect(restored.length).toBe(3);
    expect(restored.sample(1).position[0]).toBeCloseTo(10, 3);
  });

  it('refuses to encode an unplayable (<2 keyframe) path', () => {
    expect(new CameraPath([KEYFRAMES[0]], 6).toURLValue()).toBe('');
    expect(CameraPath.fromURLValue('')).toBeNull();
  });

  it('keyframes are copied, not aliased — later mutation of input does not leak in', () => {
    const input = [{ position: [1, 1, 1], target: [0, 0, 0] }, { position: [2, 2, 2], target: [0, 0, 0] }];
    const path = new CameraPath(input, 6);
    input[0].position[0] = 999;
    expect(path.sample(0).position[0]).toBeCloseTo(1, 5);
  });
});
