import { describe, it, expect } from 'vitest';
import {
  encodePose,
  decodePose,
  encodePath,
  decodePath,
  parseHash,
  buildHash,
} from '../src/urlState.js';

const POSE = { position: [1.2345, -2.5, 3], target: [0, 0.001, -4.9999] };

describe('pose encoding', () => {
  it('round-trips a pose to 3-decimal precision', () => {
    const decoded = decodePose(encodePose(POSE));
    expect(decoded.position[0]).toBeCloseTo(1.235, 3); // rounded, not truncated
    expect(decoded.position[1]).toBe(-2.5);
    expect(decoded.target[2]).toBeCloseTo(-5, 3);
  });

  it('rejects garbage instead of producing NaN poses', () => {
    expect(decodePose('')).toBeNull();
    expect(decodePose(null)).toBeNull();
    expect(decodePose('1,2,3')).toBeNull(); // too few numbers
    expect(decodePose('1,2,3,4,5,banana')).toBeNull();
  });
});

describe('path encoding', () => {
  const KEYFRAMES = [
    { position: [1, 2, 3], target: [0, 0, 0] },
    { position: [2, 1, 4], target: [0, 1, 0] },
    { position: [-3, 0.5, 2], target: [1, 1, 1] },
  ];

  it('round-trips keyframes and duration', () => {
    const decoded = decodePath(encodePath(KEYFRAMES, 4.5));
    expect(decoded.durationSec).toBe(4.5);
    expect(decoded.keyframes).toHaveLength(3);
    expect(decoded.keyframes[2].position).toEqual([-3, 0.5, 2]);
  });

  it('needs at least two valid keyframes', () => {
    expect(decodePath('d5~1,2,3,0,0,0')).toBeNull();
    expect(decodePath('')).toBeNull();
    expect(decodePath('not-a-path')).toBeNull();
  });

  it('drops malformed keyframes but keeps the valid ones', () => {
    const decoded = decodePath('d2~1,2,3,0,0,0~broken~2,2,2,1,1,1');
    expect(decoded.keyframes).toHaveLength(2);
  });
});

describe('hash routing helpers', () => {
  it('splits route from params', () => {
    const { route, params } = parseHash('#/scene/nebula?view=1,2,3,0,0,0');
    expect(route).toBe('/scene/nebula');
    expect(params.get('view')).toBe('1,2,3,0,0,0');
  });

  it('defaults to the root route', () => {
    expect(parseHash('').route).toBe('/');
    expect(parseHash('#').route).toBe('/');
  });

  it('buildHash omits empty params and round-trips through parseHash', () => {
    const hash = buildHash('/scene/bonsai', { view: '1,2,3,4,5,6', path: '', skip: null });
    const { route, params } = parseHash(hash);
    expect(route).toBe('/scene/bonsai');
    expect(params.get('view')).toBe('1,2,3,4,5,6');
    expect(params.has('path')).toBe(false);
    expect(params.has('skip')).toBe(false);
  });
});
