import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

// Cropping reads splats out of a loaded SplatBuffer, keeps those inside an
// axis-aligned box, and rebuilds a new buffer. The library exposes position,
// scale, rotation and base RGBA per splat but no spherical-harmonics readback,
// so a cropped scene re-exports at SH0 (base colour) — documented in the UI.

const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));

/** Axis-aligned bounds of a SplatBuffer, sampled for speed on large scenes. */
export function computeBounds(splatBuffer, maxSamples = 40000) {
  const count = splatBuffer.getSplatCount();
  const stride = Math.max(1, Math.floor(count / maxSamples));
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (let i = 0; i < count; i += stride) {
    splatBuffer.getSplatCenter(i, c);
    box.expandByPoint(c);
  }
  return box;
}

/** Count splats inside `box` (cheap live feedback while dragging the crop box). */
export function countInBox(splatBuffer, box) {
  const count = splatBuffer.getSplatCount();
  const c = new THREE.Vector3();
  let inside = 0;
  for (let i = 0; i < count; i++) {
    splatBuffer.getSplatCenter(i, c);
    if (box.containsPoint(c)) inside++;
  }
  return inside;
}

/**
 * Keep splats whose centre is inside `box`; return a raw antimatter15 `.splat`
 * ArrayBuffer (32 bytes/splat) plus counts. Synchronous.
 */
export function cropSplats(splatBuffer, box) {
  const count = splatBuffer.getSplatCount();
  const center = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const color = new THREE.Vector4();

  // First pass: collect indices inside the box (so we can size the output buffer).
  const kept = [];
  for (let i = 0; i < count; i++) {
    splatBuffer.getSplatCenter(i, center);
    if (box.containsPoint(center)) kept.push(i);
  }

  const out = new ArrayBuffer(kept.length * 32);
  const dv = new DataView(out);
  let o = 0;
  for (const i of kept) {
    splatBuffer.getSplatCenter(i, center);
    splatBuffer.getSplatScaleAndRotation(i, scale, rot);
    splatBuffer.getSplatColor(i, color);
    rot.normalize();

    dv.setFloat32(o, center.x, true);
    dv.setFloat32(o + 4, center.y, true);
    dv.setFloat32(o + 8, center.z, true);
    dv.setFloat32(o + 12, scale.x, true);
    dv.setFloat32(o + 16, scale.y, true);
    dv.setFloat32(o + 20, scale.z, true);
    dv.setUint8(o + 24, clamp255(color.x));
    dv.setUint8(o + 25, clamp255(color.y));
    dv.setUint8(o + 26, clamp255(color.z));
    dv.setUint8(o + 27, clamp255(color.w));
    // quaternion stored [w,x,y,z] as (q*128)+128
    dv.setUint8(o + 28, clamp255(rot.w * 128 + 128));
    dv.setUint8(o + 29, clamp255(rot.x * 128 + 128));
    dv.setUint8(o + 30, clamp255(rot.y * 128 + 128));
    dv.setUint8(o + 31, clamp255(rot.z * 128 + 128));
    o += 32;
  }

  return { splatArrayBuffer: out, kept: kept.length, total: count };
}

/** Parse a raw .splat buffer into a compressed SplatBuffer for .ksplat download. */
export async function splatToKSplatBuffer(splatArrayBuffer) {
  return GaussianSplats3D.SplatLoader.loadFromFileData(
    splatArrayBuffer,
    /* minimumAlpha */ 1,
    /* compressionLevel */ 1,
    /* optimizeSplatData */ true,
  );
}

/** Download a cropped scene as .ksplat. */
export async function downloadCroppedKSplat(splatArrayBuffer, fileName) {
  const splatBuffer = await splatToKSplatBuffer(splatArrayBuffer);
  GaussianSplats3D.KSplatLoader.downloadFile(splatBuffer, fileName);
}
