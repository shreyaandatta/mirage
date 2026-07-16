import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeBounds, countInBox, cropSplats } from '../src/crop.js';

// A minimal stand-in for the library's SplatBuffer: fixed-position splats
// with unit scale, identity rotation, and opaque white colour.
function fakeSplatBuffer(centers) {
  return {
    getSplatCount: () => centers.length,
    getSplatCenter: (i, out) => out.set(...centers[i]),
    getSplatScaleAndRotation: (i, scale, rot) => {
      scale.set(1, 1, 1);
      rot.set(0, 0, 0, 1);
    },
    getSplatColor: (i, out) => out.set(255, 255, 255, 255),
  };
}

const CENTERS = [
  [0, 0, 0],
  [1, 1, 1],
  [5, 5, 5],
  [-3, 0, 2],
];

describe('computeBounds', () => {
  it('bounds every splat center', () => {
    const box = computeBounds(fakeSplatBuffer(CENTERS));
    expect(box.min.toArray()).toEqual([-3, 0, 0]);
    expect(box.max.toArray()).toEqual([5, 5, 5]);
  });
});

describe('countInBox', () => {
  it('counts only centers inside the box', () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(2, 2, 2));
    expect(countInBox(fakeSplatBuffer(CENTERS), box)).toBe(2); // origin + (1,1,1)
  });

  it('returns 0 for a box that misses everything', () => {
    const box = new THREE.Box3(new THREE.Vector3(100, 100, 100), new THREE.Vector3(101, 101, 101));
    expect(countInBox(fakeSplatBuffer(CENTERS), box)).toBe(0);
  });
});

describe('cropSplats', () => {
  const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(2, 2, 2));

  it('keeps only in-box splats and reports counts', () => {
    const { splatArrayBuffer, kept, total } = cropSplats(fakeSplatBuffer(CENTERS), box);
    expect(kept).toBe(2);
    expect(total).toBe(4);
    expect(splatArrayBuffer.byteLength).toBe(kept * 32); // antimatter15 layout
  });

  it('writes valid .splat records (position floats, colour bytes, packed quaternion)', () => {
    const { splatArrayBuffer } = cropSplats(fakeSplatBuffer(CENTERS), box);
    const dv = new DataView(splatArrayBuffer);
    // First kept splat is the origin.
    expect(dv.getFloat32(0, true)).toBe(0);
    expect(dv.getFloat32(12, true)).toBe(1); // scale.x
    expect(dv.getUint8(24)).toBe(255); // r
    expect(dv.getUint8(27)).toBe(255); // alpha
    // Identity quaternion packs to [w,x,y,z] = [255, 128, 128, 128] via (q*128)+128.
    expect(dv.getUint8(28)).toBe(255);
    expect(dv.getUint8(29)).toBe(128);
    // Second kept splat's position starts at byte 32.
    expect(dv.getFloat32(32, true)).toBe(1);
  });

  it('returns an empty buffer when nothing is inside', () => {
    const empty = new THREE.Box3(new THREE.Vector3(50, 50, 50), new THREE.Vector3(51, 51, 51));
    const { splatArrayBuffer, kept } = cropSplats(fakeSplatBuffer(CENTERS), empty);
    expect(kept).toBe(0);
    expect(splatArrayBuffer.byteLength).toBe(0);
  });
});
