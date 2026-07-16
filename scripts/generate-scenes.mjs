/**
 * Procedurally generates the bundled sample scenes as .splat files
 * (antimatter15 layout, 32 bytes per splat), so the repo ships small,
 * license-clean demo content that still shows off gaussian rendering:
 * translucency, soft blending, and anisotropic (stretched) splats.
 *
 *   position  float32 × 3
 *   scale     float32 × 3   (linear)
 *   color     uint8   × 4   (RGBA)
 *   rotation  uint8   × 4   (quaternion [w,x,y,z], each (q*128)+128)
 *
 * Usage: node scripts/generate-scenes.mjs   →  public/scenes/*.splat
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'scenes');

// ---------- utilities ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(1337);
const R = (lo = 0, hi = 1) => lo + rand() * (hi - lo);
const gauss = () => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

/** Multi-stop gradient: stops = [[t, color], ...] sorted by t. */
function gradient(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const span = stops[i][0] - stops[i - 1][0] || 1;
      return lerpColor(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / span);
    }
  }
  return stops[stops.length - 1][1];
}

// Value noise + fbm for terrain
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}
function fbm(x, z, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq);
    amp *= 0.5; freq *= 2;
  }
  return sum; // ~[0, 1)
}

const IDENTITY_Q = [0, 0, 0, 1];
const yawQ = (angle) => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];

class SplatWriter {
  constructor() { this.splats = []; }

  /**
   * @param {number[]} p     position [x,y,z]
   * @param {number|number[]} s  scale (uniform number or [sx,sy,sz])
   * @param {number[]} rgb   color 0–255
   * @param {number} alpha   0–255
   * @param {number[]} q     quaternion [x,y,z,w]
   */
  add(p, s, rgb, alpha, q = IDENTITY_Q) {
    const scale = typeof s === 'number' ? [s, s, s] : s;
    this.splats.push({ p, scale, rgb, alpha, q });
  }

  write(file) {
    const buf = Buffer.alloc(this.splats.length * 32);
    let o = 0;
    for (const { p, scale, rgb, alpha, q } of this.splats) {
      buf.writeFloatLE(p[0], o); buf.writeFloatLE(p[1], o + 4); buf.writeFloatLE(p[2], o + 8);
      buf.writeFloatLE(scale[0], o + 12); buf.writeFloatLE(scale[1], o + 16); buf.writeFloatLE(scale[2], o + 20);
      buf[o + 24] = clamp(Math.round(rgb[0]), 0, 255);
      buf[o + 25] = clamp(Math.round(rgb[1]), 0, 255);
      buf[o + 26] = clamp(Math.round(rgb[2]), 0, 255);
      buf[o + 27] = clamp(Math.round(alpha), 0, 255);
      // quaternion, normalized, stored [w,x,y,z]
      const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      const enc = (c) => clamp(Math.round((c / len) * 128) + 128, 0, 255);
      buf[o + 28] = enc(q[3]); buf[o + 29] = enc(q[0]); buf[o + 30] = enc(q[1]); buf[o + 31] = enc(q[2]);
      o += 32;
    }
    writeFileSync(join(OUT_DIR, file), buf);
    console.log(`  ${file}: ${this.splats.length.toLocaleString()} splats, ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  }
}

// ---------- Scene 1: Spiral Nebula ----------

function buildNebula() {
  rand = mulberry32(101);
  const w = new SplatWriter();

  const armGradient = [
    [0.0, [255, 224, 170]],
    [0.35, [236, 140, 255]],
    [0.7, [130, 150, 255]],
    [1.0, [90, 210, 255]],
  ];

  // Hot core
  for (let i = 0; i < 9000; i++) {
    const r = Math.abs(gauss()) * 0.42;
    const theta = R(0, Math.PI * 2);
    const y = gauss() * 0.13 * Math.exp(-r);
    const heat = Math.exp(-r * 2.2);
    const color = lerpColor([255, 236, 205], [255, 200, 120], 1 - heat);
    w.add(
      [r * Math.cos(theta), y, r * Math.sin(theta)],
      R(0.02, 0.07),
      color,
      120 + heat * 135,
    );
  }

  // Two logarithmic spiral arms
  for (let arm = 0; arm < 2; arm++) {
    const offset = arm * Math.PI;
    for (let i = 0; i < 19000; i++) {
      const t = Math.pow(rand(), 0.72);           // bias splats toward the core
      const theta = t * Math.PI * 3.1 + offset;
      const radius = 0.35 + 3.6 * t;
      const spread = 0.08 + 0.24 * t;
      const x = radius * Math.cos(theta) + gauss() * spread;
      const z = radius * Math.sin(theta) + gauss() * spread;
      const y = gauss() * 0.11 * (1 - t * 0.55);
      // stretch splats along the arm's tangent direction
      const tangent = theta + Math.PI / 2;
      const s = R(0.03, 0.12);
      w.add(
        [x, y, z],
        [s * R(1.2, 2.2), s * 0.7, s * 0.7],
        gradient(armGradient, t + gauss() * 0.06),
        R(45, 150) * (1 - t * 0.35),
        yawQ(-tangent),
      );
    }
  }

  // Dark dust lanes
  for (let i = 0; i < 13000; i++) {
    const t = rand();
    const theta = t * Math.PI * 3.1 + 0.35 + (rand() < 0.5 ? Math.PI : 0);
    const radius = 0.6 + 3.3 * t;
    w.add(
      [radius * Math.cos(theta) + gauss() * 0.2, gauss() * 0.07, radius * Math.sin(theta) + gauss() * 0.2],
      R(0.07, 0.15),
      [28 + R(0, 14), 18 + R(0, 10), 48 + R(0, 18)],
      R(25, 60),
    );
  }

  // Star field: a distant shell plus sparkle inside the disk
  for (let i = 0; i < 6000; i++) {
    const r = R(3.5, 8);
    const phi = R(0, Math.PI * 2);
    const cosT = R(-1, 1);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const warm = rand() < 0.25;
    w.add(
      [r * sinT * Math.cos(phi), r * cosT, r * sinT * Math.sin(phi)],
      R(0.006, 0.016),
      warm ? [255, 226, 190] : [216, 228, 255],
      R(190, 255),
    );
  }
  for (let i = 0; i < 1400; i++) {
    const radius = R(0.4, 4);
    const theta = R(0, Math.PI * 2);
    w.add(
      [radius * Math.cos(theta), gauss() * 0.12, radius * Math.sin(theta)],
      R(0.008, 0.018),
      [255, 250, 240],
      255,
    );
  }

  w.write('nebula.splat');
}

// ---------- Scene 2: Bonsai ----------

function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
  ];
}

function buildBonsai() {
  rand = mulberry32(202);
  const w = new SplatWriter();

  // Terracotta pot: wall + rim
  for (let i = 0; i < 5200; i++) {
    const y = R(0, 0.34);
    const r = 0.42 + y * 0.35 + gauss() * 0.008;   // slight outward taper
    const theta = R(0, Math.PI * 2);
    const shade = R(-18, 18);
    w.add(
      [r * Math.cos(theta), y, r * Math.sin(theta)],
      R(0.028, 0.05),
      [158 + shade, 84 + shade * 0.6, 60 + shade * 0.4],
      R(235, 255),
    );
  }
  for (let i = 0; i < 1600; i++) {
    const theta = R(0, Math.PI * 2);
    const r = 0.54 + gauss() * 0.015;
    w.add(
      [r * Math.cos(theta), 0.34 + gauss() * 0.012, r * Math.sin(theta)],
      R(0.03, 0.05),
      [186, 110, 82],
      255,
    );
  }

  // Mossy soil
  for (let i = 0; i < 3200; i++) {
    const radius = 0.5 * Math.sqrt(rand());
    const theta = R(0, Math.PI * 2);
    const mossy = rand() < 0.65;
    w.add(
      [radius * Math.cos(theta), 0.35 + R(0, 0.025), radius * Math.sin(theta)],
      R(0.03, 0.055),
      mossy ? [70 + R(0, 30), 110 + R(0, 35), 50 + R(0, 20)] : [88, 66, 48],
      255,
    );
  }

  // Trunk + two branches as tapered bezier tubes
  const limbs = [
    { p0: [0, 0.35, 0], p1: [0.16, 0.92, 0.05], p2: [0.45, 1.3, 0.1], r0: 0.095, r1: 0.03, n: 6200 },
    { p0: [0.1, 0.82, 0.03], p1: [-0.15, 1.1, -0.08], p2: [-0.42, 1.42, -0.16], r0: 0.045, r1: 0.018, n: 2000 },
    { p0: [0.2, 1.0, 0.06], p1: [0.18, 1.35, 0.22], p2: [0.14, 1.68, 0.36], r0: 0.04, r1: 0.016, n: 1800 },
  ];
  for (const limb of limbs) {
    for (let i = 0; i < limb.n; i++) {
      const t = rand();
      const c = bezier(limb.p0, limb.p1, limb.p2, t);
      const radius = lerp(limb.r0, limb.r1, t) * Math.sqrt(rand());
      const theta = R(0, Math.PI * 2);
      const bark = R(-16, 16);
      w.add(
        [c[0] + radius * Math.cos(theta), c[1] + gauss() * 0.01, c[2] + radius * Math.sin(theta)],
        R(0.018, 0.038),
        [98 + bark, 66 + bark * 0.7, 42 + bark * 0.5],
        R(235, 255),
      );
    }
  }

  // Canopy: overlapping foliage puffs (squashed ellipsoids)
  const puffs = [
    { c: [0.45, 1.52, 0.1], r: 0.4 },
    { c: [-0.42, 1.5, -0.16], r: 0.32 },
    { c: [0.14, 1.76, 0.36], r: 0.28 },
    { c: [0.05, 1.66, -0.02], r: 0.3 },
    { c: [0.55, 1.32, 0.38], r: 0.22 },
  ];
  const totalCanopy = 30000;
  const rSum = puffs.reduce((acc, p) => acc + p.r ** 3, 0);
  for (const puff of puffs) {
    const n = Math.round((totalCanopy * puff.r ** 3) / rSum);
    for (let i = 0; i < n; i++) {
      // point in ellipsoid, biased to the surface for a fluffy shell
      const dir = [gauss(), gauss(), gauss()];
      const len = Math.hypot(...dir) || 1;
      const rr = puff.r * Math.pow(rand(), 0.32);
      const px = puff.c[0] + (dir[0] / len) * rr;
      const py = puff.c[1] + (dir[1] / len) * rr * 0.72;   // squash vertically
      const pz = puff.c[2] + (dir[2] / len) * rr;
      // top-lit: brighter green when the surface normal points up
      const upness = (dir[1] / len + 1) / 2;
      const t = clamp(upness + gauss() * 0.12, 0, 1);
      const color = gradient([
        [0, [38, 82, 44]],
        [0.55, [78, 138, 58]],
        [1, [148, 198, 88]],
      ], t);
      w.add([px, py, pz], R(0.025, 0.06), color, R(140, 225));
    }
  }

  // Blossoms on the canopy surface + petals drifting down
  for (let i = 0; i < 2300; i++) {
    const puff = puffs[Math.floor(rand() * puffs.length)];
    const dir = [gauss(), gauss(), gauss()];
    const len = Math.hypot(...dir) || 1;
    const rr = puff.r * R(0.95, 1.06);
    w.add(
      [puff.c[0] + (dir[0] / len) * rr, puff.c[1] + (dir[1] / len) * rr * 0.72, puff.c[2] + (dir[2] / len) * rr],
      R(0.015, 0.032),
      [244 + R(-10, 10), 158 + R(-20, 20), 190 + R(-15, 15)],
      R(200, 255),
    );
  }
  for (let i = 0; i < 70; i++) {
    const radius = R(0.25, 0.75);
    const theta = R(0, Math.PI * 2);
    w.add(
      [radius * Math.cos(theta), R(0.45, 1.35), radius * Math.sin(theta)],
      R(0.01, 0.018),
      [246, 170, 198],
      R(40, 90),
    );
  }

  w.write('bonsai.splat');
}

// ---------- Scene 3: Aurora Ridge ----------

function buildAurora() {
  rand = mulberry32(303);
  const w = new SplatWriter();

  // Snowy terrain: fbm hills plus a mountain ridge across the back
  const height = (x, z) => {
    const rolling = fbm(x * 0.28 + 10, z * 0.28 + 10) * 1.15;
    const ridgeLine = Math.exp(-(((z + 2.6) / 2.0) ** 2));
    const ridge = ridgeLine * (0.9 + fbm(x * 0.5 + 40, 3) * 1.8);
    return rolling + ridge - 0.35;
  };
  for (let i = 0; i < 50000; i++) {
    const x = R(-6.5, 6.5);
    const z = R(-5.5, 4.5);
    const y = height(x, z);
    // slope-shade via finite differences; aurora casts a faint green key light
    const e = 0.09;
    const nx = height(x - e, z) - height(x + e, z);
    const nz = height(x, z - e) - height(x, z + e);
    const ny = 2 * e;
    const nlen = Math.hypot(nx, ny, nz);
    const light = clamp(Math.pow(0.5 + 0.5 * (ny / nlen) + 0.15 * (nz / nlen), 1.8), 0.12, 1);
    const snow = lerpColor([48, 62, 105], [215, 228, 246], light);
    const glow = clamp((y + 0.2) / 2.4, 0, 1) * 0.22;
    const color = lerpColor(snow, [150, 255, 200], glow);
    const s = R(0.05, 0.1);
    w.add([x, y, z], [s, s * 0.55, s], color, 255);
  }

  // Aurora curtains: tall thin gaussians make the "curtain" effect
  const curtains = [
    { phase: 0, zBase: -4.2, yBase: 2.3, height: 2.5, n: 950 },
    { phase: 2.1, zBase: -2.9, yBase: 2.7, height: 2.1, n: 750 },
  ];
  const auroraGradient = [
    [0, [90, 255, 150]],
    [0.45, [60, 215, 205]],
    [1, [160, 95, 235]],
  ];
  for (const curtain of curtains) {
    for (let i = 0; i < curtain.n; i++) {
      const s = rand();
      const x = lerp(-6, 6, s) + Math.sin(s * 12.5 + curtain.phase) * 0.7;
      const z = curtain.zBase + Math.cos(s * 7.3 + curtain.phase) * 0.9;
      const tangent = Math.atan2(
        Math.cos(s * 7.3 + curtain.phase) * -0.9 * 7.3,
        12 + Math.cos(s * 12.5 + curtain.phase) * 0.7 * 12.5,
      );
      const columnSplats = 9;
      for (let k = 0; k < columnSplats; k++) {
        const u = (k + rand()) / columnSplats;
        w.add(
          [x + gauss() * 0.06, curtain.yBase + u * curtain.height, z + gauss() * 0.06],
          [R(0.04, 0.08), R(0.3, 0.55), R(0.035, 0.06)],
          gradient(auroraGradient, u + gauss() * 0.08),
          (Math.pow(1 - u, 1.4) * 130 + 18) * R(0.75, 1.15),
          yawQ(tangent),
        );
      }
    }
  }

  // Star dome — low-elevation stars only behind the ridge (camera looks toward -z),
  // so nothing twinkles in front of the foreground snow.
  let stars = 0;
  while (stars < 6500) {
    const r = R(8, 11);
    const phi = R(0, Math.PI * 2);
    const cosT = R(0.05, 0.95);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const x = r * sinT * Math.cos(phi);
    const y = r * cosT;
    const z = r * sinT * Math.sin(phi);
    if (y < 3.5 && z > -2) continue;                       // over the foreground snow
    if (Math.hypot(x, y - 4.4, z - 10.8) < 6.5) continue;  // too close to the home camera
    w.add(
      [x, y, z],
      R(0.008, 0.02),
      rand() < 0.2 ? [255, 228, 195] : [220, 230, 255],
      R(180, 255),
    );
    stars++;
  }

  // Moon with a soft halo
  const moon = [3.6, 4.8, -5.5];
  for (let i = 0; i < 700; i++) {
    const dir = [gauss(), gauss(), gauss()];
    const len = Math.hypot(...dir) || 1;
    const rr = 0.3 * Math.pow(rand(), 0.4);
    w.add(
      [moon[0] + (dir[0] / len) * rr, moon[1] + (dir[1] / len) * rr, moon[2] + (dir[2] / len) * rr],
      R(0.02, 0.045),
      [240, 238, 222],
      255,
    );
  }
  for (let i = 0; i < 260; i++) {
    const dir = [gauss(), gauss(), gauss()];
    const len = Math.hypot(...dir) || 1;
    const rr = R(0.32, 0.75);
    w.add(
      [moon[0] + (dir[0] / len) * rr, moon[1] + (dir[1] / len) * rr, moon[2] + (dir[2] / len) * rr],
      R(0.1, 0.2),
      [225, 228, 215],
      R(18, 45),
    );
  }

  w.write('aurora.splat');
}

// ---------- run ----------

mkdirSync(OUT_DIR, { recursive: true });
console.log('Generating sample scenes into public/scenes/ …');
buildNebula();
buildBonsai();
buildAurora();
console.log('Done.');
