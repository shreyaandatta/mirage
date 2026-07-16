import * as THREE from 'three';
import { encodePath, decodePath } from './urlState.js';

const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * A cinematic camera path: an ordered list of view keyframes ({position, target})
 * interpolated with Catmull-Rom splines for smooth, dolly-like motion. Global
 * progress is eased so the move accelerates in and decelerates out.
 *
 * Interpolating position and look-at target (rather than a quaternion) keeps the
 * camera aimed coherently and matches how the orbit controls think about a view.
 */
export class CameraPath {
  constructor(keyframes = [], durationSec = 6) {
    this.keyframes = keyframes.map((k) => ({
      position: [...k.position],
      target: [...k.target],
    }));
    this.durationSec = durationSec;
    this._rebuild();
  }

  get length() {
    return this.keyframes.length;
  }

  addKeyframe(pose) {
    this.keyframes.push({ position: [...pose.position], target: [...pose.target] });
    this._rebuild();
  }

  clear() {
    this.keyframes = [];
    this._rebuild();
  }

  _rebuild() {
    if (this.keyframes.length < 2) {
      this._posCurve = this._targetCurve = null;
      return;
    }
    // `catmullrom` with no closing gives a natural open spline through all points.
    this._posCurve = new THREE.CatmullRomCurve3(
      this.keyframes.map((k) => new THREE.Vector3(...k.position)), false, 'catmullrom', 0.5);
    this._targetCurve = new THREE.CatmullRomCurve3(
      this.keyframes.map((k) => new THREE.Vector3(...k.target)), false, 'catmullrom', 0.5);
  }

  /**
   * Sample the eased path at normalized progress u ∈ [0,1].
   * @returns {{position:number[], target:number[]}|null}
   */
  sample(u) {
    if (!this._posCurve) {
      const k = this.keyframes[0];
      return k ? { position: [...k.position], target: [...k.target] } : null;
    }
    const t = smoothstep(Math.min(1, Math.max(0, u)));
    return {
      position: this._posCurve.getPoint(t).toArray(),
      target: this._targetCurve.getPoint(t).toArray(),
    };
  }

  toURLValue() {
    return this.keyframes.length >= 2 ? encodePath(this.keyframes, this.durationSec) : '';
  }

  static fromURLValue(str) {
    const parsed = decodePath(str);
    return parsed ? new CameraPath(parsed.keyframes, parsed.durationSec) : null;
  }
}

/**
 * Drive a MirageViewer camera along a CameraPath. Disables user controls for the
 * duration, restores them (and the pre-playback view) when done or cancelled.
 * @returns {{cancel: () => void, promise: Promise<boolean>}}  promise resolves true if it ran to completion
 */
export function playPath(mirage, path, { onFrame } = {}) {
  const startPose = mirage.getCameraPose();
  mirage.setControlsEnabled(false);
  let raf = 0;
  let cancelled = false;

  const promise = new Promise((resolve) => {
    const startedAt = performance.now();
    const durationMs = Math.max(500, path.durationSec * 1000);
    const tick = (now) => {
      if (cancelled) { resolve(false); return; }
      const u = Math.min(1, (now - startedAt) / durationMs);
      const pose = path.sample(u);
      if (pose) mirage.setCameraPose(pose);
      onFrame?.(u);
      if (u >= 1) { finish(); resolve(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  function finish() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    mirage.setControlsEnabled(true);
  }

  return {
    promise,
    cancel: () => {
      cancelled = true;
      finish();
      if (startPose) mirage.setCameraPose(startPose);
    },
  };
}
