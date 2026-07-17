/**
 * Scroll-driven WebGL hero: a live particle nebula rendered with Three.js,
 * scrubbed by scroll. This replaces the earlier image-sequence scrubber —
 * an image sequence is decode-bound (a 4K frame can never decode inside a
 * 16ms budget), while a live scene is just GPU compositing: the particles
 * are uploaded once and every scroll frame only moves a camera and a few
 * uniforms. Sharpness is resolution-independent — true 4K at 60fps — and
 * the hero ships zero image assets.
 *
 * The scene is the same procedural Spiral Nebula as the bundled sample
 * scene (same algorithm, same seed — see scripts/generate-scenes.mjs), so
 * the hero literally shows the product story: scattered points of light
 * assemble into the captured scene you can open in the viewer below.
 *
 * Engineering notes:
 * - ~62k particles in one Points draw call. Two position attributes per
 *   particle (scattered "chaos" + formed nebula); the vertex shader mixes
 *   them by a scroll-driven uniform with a per-particle stagger, so the
 *   cloud assembles in waves rather than as one rigid tween.
 * - The camera dollies along a Catmull-Rom path — the same CameraPath
 *   engine that powers the viewer's fly-through recorder.
 * - Point sprites are soft gaussian falloffs, additively blended with
 *   depth off: order-independent, so no sorting is needed.
 * - The rAF loop runs only while the hero is on screen (IntersectionObserver).
 * - Scroll velocity nudges the FOV outward for a subtle speed feel.
 * - The scrub eases toward the scroll target; callers pass ease=1 when
 *   Lenis already smooths page scroll so filters don't stack into lag.
 * - `prefers-reduced-motion` renders one static formed-nebula frame;
 *   if WebGL is unavailable the CSS static fallback carries the copy.
 */

import * as THREE from 'three';
import { CameraPath } from '../cameraPath.js';
import { smoothScrollTo } from '../smoothScroll.js';

const EASE = 0.22;
const RAMP = 0.05;          // stage fade in/out width, in progress units
const FOV = 55;
const FORM_START = 0.12;    // scroll progress window over which the nebula assembles
const FORM_END = 0.5;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------- deterministic nebula generation (mirrors generate-scenes.mjs) ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

function gradientAt(stops, t) {
  t = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const span = stops[i][0] - stops[i - 1][0] || 1;
      const u = (t - stops[i - 1][0]) / span;
      const c1 = stops[i - 1][1];
      const c2 = stops[i][1];
      return [lerp(c1[0], c2[0], u), lerp(c1[1], c2[1], u), lerp(c1[2], c2[2], u)];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Build the particle attribute arrays. `density` scales particle counts for
 * small/weak devices. Returns plain typed arrays ready for BufferGeometry.
 */
function buildNebulaAttributes(density = 1) {
  const rand = mulberry32(101); // same seed as the bundled nebula.splat
  const R = (lo = 0, hi = 1) => lo + rand() * (hi - lo);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const pos = [];
  const chaos = [];
  const col = [];
  const size = [];
  const alpha = [];
  const seed = [];

  const push = (p, s, rgb, a) => {
    pos.push(p[0], p[1], p[2]);
    // chaos state: a wide shell around the whole flight path
    const dx = gauss(); const dy = gauss(); const dz = gauss();
    const len = Math.hypot(dx, dy, dz) || 1;
    const r = 2 + 8.5 * Math.pow(rand(), 0.7);
    chaos.push((dx / len) * r, (dy / len) * r, (dz / len) * r);
    col.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    size.push(s);
    alpha.push(a);
    seed.push(rand());
  };
  const n = (count) => Math.round(count * density);

  // Hot core
  for (let i = 0; i < n(9000); i++) {
    const r = Math.abs(gauss()) * 0.42;
    const theta = R(0, Math.PI * 2);
    const y = gauss() * 0.13 * Math.exp(-r);
    const heat = Math.exp(-r * 2.2);
    const c = [
      lerp(255, 255, 1 - heat),
      lerp(236, 200, 1 - heat),
      lerp(205, 120, 1 - heat),
    ];
    push([r * Math.cos(theta), y, r * Math.sin(theta)], R(0.02, 0.07), c, (120 + heat * 135) / 255);
  }

  // Two logarithmic spiral arms
  const armGradient = [
    [0.0, [255, 224, 170]],
    [0.35, [236, 140, 255]],
    [0.7, [130, 150, 255]],
    [1.0, [90, 210, 255]],
  ];
  for (let arm = 0; arm < 2; arm++) {
    const offset = arm * Math.PI;
    for (let i = 0; i < n(19000); i++) {
      const t = Math.pow(rand(), 0.72);
      const theta = t * Math.PI * 3.1 + offset;
      const radius = 0.35 + 3.6 * t;
      const spread = 0.08 + 0.24 * t;
      const x = radius * Math.cos(theta) + gauss() * spread;
      const z = radius * Math.sin(theta) + gauss() * spread;
      const y = gauss() * 0.11 * (1 - t * 0.55);
      push([x, y, z], R(0.03, 0.12),
        gradientAt(armGradient, t + gauss() * 0.06),
        (R(45, 150) * (1 - t * 0.35)) / 255);
    }
  }

  // Dust lanes — dark in the splat scene; recolored to a faint violet haze
  // here because additive blending can only add light, never occlude it.
  for (let i = 0; i < n(8000); i++) {
    const t = rand();
    const theta = t * Math.PI * 3.1 + 0.35 + (rand() < 0.5 ? Math.PI : 0);
    const radius = 0.6 + 3.3 * t;
    push(
      [radius * Math.cos(theta) + gauss() * 0.2, gauss() * 0.07, radius * Math.sin(theta) + gauss() * 0.2],
      R(0.05, 0.1),
      [64 + R(0, 24), 42 + R(0, 16), 128 + R(0, 30)],
      R(0.04, 0.1),
    );
  }

  // Star field: distant shell + sparkle inside the disk
  for (let i = 0; i < n(6000); i++) {
    const r = R(3.5, 8);
    const phi = R(0, Math.PI * 2);
    const cosT = R(-1, 1);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const warm = rand() < 0.25;
    push(
      [r * sinT * Math.cos(phi), r * cosT, r * sinT * Math.sin(phi)],
      R(0.008, 0.018),
      warm ? [255, 226, 190] : [216, 228, 255],
      R(0.75, 1),
    );
  }
  for (let i = 0; i < n(1400); i++) {
    const radius = R(0.4, 4);
    const theta = R(0, Math.PI * 2);
    push(
      [radius * Math.cos(theta), gauss() * 0.12, radius * Math.sin(theta)],
      R(0.01, 0.02),
      [255, 250, 240],
      1,
    );
  }

  return {
    position: new Float32Array(pos),
    chaos: new Float32Array(chaos),
    color: new Float32Array(col),
    size: new Float32Array(size),
    alpha: new Float32Array(alpha),
    seed: new Float32Array(seed),
  };
}

// ---------- shaders ----------

const VERT = /* glsl */ `
  attribute vec3 aChaos;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  uniform float uForm;
  uniform float uTime;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    // staggered assembly: each particle starts forming at its own moment
    float f = smoothstep(0.0, 1.0, clamp(uForm * 1.45 - aSeed * 0.45, 0.0, 1.0));
    vec3 p = mix(aChaos, position, f);
    // slow drift while scattered, faint shimmer once formed
    p += (1.0 - f) * 0.35 * vec3(
      sin(uTime * 0.31 + aSeed * 17.0),
      sin(uTime * 0.23 + aSeed * 29.0),
      cos(uTime * 0.27 + aSeed * 23.0));
    p += f * 0.012 * vec3(
      sin(uTime * 0.7 + aSeed * 40.0),
      cos(uTime * 0.6 + aSeed * 31.0),
      sin(uTime * 0.5 + aSeed * 37.0));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(0.12, -mv.z);
    gl_PointSize = clamp(aSize * uScale / dist, 1.0, 48.0);
    vColor = aColor;
    vAlpha = aAlpha * (0.45 + 0.55 * f);
    vSeed = aSeed;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  uniform float uTime;
  uniform float uGain;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d2 = dot(uv, uv) * 4.0;              // 0 at center, 1 at sprite edge
    float fall = exp(-d2 * 4.5) * (1.0 - smoothstep(0.7, 1.0, d2));
    float tw = 0.82 + 0.18 * sin(uTime * (0.6 + vSeed * 2.4) + vSeed * 80.0);
    gl_FragColor = vec4(vColor, vAlpha * fall * tw * uGain);
  }
`;

// ---------- camera flight ----------

// Chapter beats: inside the scattered cloud → rising as it forms → the
// top-down spiral reveal → diving down an arm → skimming the hot core →
// pulling wide for the CTA. Smoothstep easing in CameraPath keeps the
// title and CTA shots near-stationary at the scroll extremes.
const FLIGHT = [
  { position: [0, 0.9, 8.5], target: [0, 0.4, 0] },
  { position: [3.4, 3.2, 4.2], target: [0, 0.2, 0] },
  { position: [3.0, 5.4, -0.9], target: [0, 0, 0] },
  { position: [1.6, 0.9, -2.6], target: [0, 0, 0] },
  { position: [0.5, 0.28, 0.9], target: [0, 0.05, -0.4] },
  { position: [0, 1.9, 6.2], target: [0, 0.2, 0] },
];

export class WebglHero {
  /**
   * @param {HTMLElement} mount
   * @param {object} opts {
   *   stages: [{ html, from, to, hold?, interactive? }],
   *   onAction(name), — clicks on [data-act] inside stages
   *   ease?           — per-frame scrub easing (1 when Lenis smooths scroll)
   * }
   */
  constructor(mount, { stages, onAction, ease }) {
    this.stages = stages;
    this.ease = ease ?? EASE;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.current = 0;        // eased scroll progress 0..1
    this.raf = 0;
    this.running = false;
    this.destroyed = false;
    this._fovBoost = 0;
    this._lastP = 0;
    this._lastT = 0;

    this.root = document.createElement('section');
    this.root.className = `scroll-hero${this.reduced ? ' sh-static' : ''}`;
    this.root.innerHTML = `
      <div class="sh-sticky">
        <canvas class="sh-canvas" aria-hidden="true"></canvas>
        <div class="sh-vignette"></div>
        <div class="sh-dim"></div>
        <div class="sh-grain" aria-hidden="true"></div>
        ${stages.map((s, i) => `<div class="sh-stage${s.interactive ? ' interactive' : ''}" data-stage="${i}">${s.html}</div>`).join('')}
        <div class="sh-cue"><span>Scroll</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>
        <nav class="sh-dots">${stages.map((s, i) => `<button class="sh-dot" data-dot="${i}" aria-label="Go to chapter ${i + 1}"></button>`).join('')}</nav>
      </div>
    `;
    mount.appendChild(this.root);

    this.sticky = this.root.querySelector('.sh-sticky');
    this.canvas = this.root.querySelector('.sh-canvas');
    this.dim = this.root.querySelector('.sh-dim');
    this.cue = this.root.querySelector('.sh-cue');
    this.stageEls = [...this.root.querySelectorAll('.sh-stage')];
    this.dotEls = [...this.root.querySelectorAll('.sh-dot')];
    this._activeDot = -2;

    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) { onAction?.(btn.dataset.act); return; }
      const dot = e.target.closest('[data-dot]');
      if (dot) this._seek(+dot.dataset.dot);
    });

    if (!this._initGL()) {
      // No WebGL: the CSS static fallback shows the copy over the gradient.
      this.root.classList.add('sh-static');
      return;
    }

    this._resize();
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(this.sticky);

    if (this.reduced) {
      // One static frame of the formed nebula at the wide closing shot.
      this.uniforms.uForm.value = 1;
      this._placeCamera(1);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this._onScroll = () => this._wake();
    window.addEventListener('scroll', this._onScroll, { passive: true });

    // Run the rAF loop only while the hero is on screen.
    this.io = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      if (this.visible) this._wake();
    });
    this.io.observe(this.root);

    this._wake();
  }

  // ---------- scene setup ----------

  _initGL() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,               // transparent over the CSS space gradient
        antialias: false,          // point sprites don't benefit from MSAA
        powerPreference: 'high-performance',
      });
    } catch {
      return false;
    }
    this.renderer = renderer;
    renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 60);
    this.path = new CameraPath(FLIGHT);

    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
    const a = buildNebulaAttributes(isSmall ? 0.55 : 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
    geo.setAttribute('aChaos', new THREE.BufferAttribute(a.chaos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(a.color, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(a.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(a.alpha, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(a.seed, 1));
    // chaos positions reach further than the formed nebula — bound them all
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    this.uniforms = {
      uForm: { value: 0 },
      uTime: { value: 0 },
      uScale: { value: 1 },
      uGain: { value: 0.75 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.geo = geo;
    this.mat = mat;

    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    return true;
  }

  _resize() {
    const rect = this.sticky.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // world-size → device-pixel projection factor for gl_PointSize
    this.uniforms.uScale.value = (h * dpr * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
    if (!this.running) this._render();
  }

  _placeCamera(p) {
    const pose = this.path.sample(p);
    this.camera.position.set(...pose.position);
    this.camera.lookAt(...pose.target);
  }

  _render() {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- scrub loop ----------

  progress() {
    const r = this.root.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    if (span <= 0) return 0;
    return clamp01(-r.top / span);
  }

  _wake() {
    if (this.running || this.reduced || this.destroyed || !this.renderer) return;
    this.running = true;
    this._lastT = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  _tick = () => {
    if (this.destroyed) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastT) / 1000) || 0.016;
    this._lastT = now;

    const target = this.progress();
    // Snap when the tab can't animate (hidden) so state never lags reality.
    this.current = document.hidden
      ? target
      : this.current + (target - this.current) * this.ease;
    if (Math.abs(target - this.current) < 0.0005) this.current = target;
    const p = this.current;

    // subtle FOV kick from scroll velocity — reads as speed, not zoom
    const v = Math.abs(p - this._lastP) / dt;
    this._lastP = p;
    this._fovBoost += (Math.min(9, v * 16) - this._fovBoost) * 0.08;
    this.camera.fov = FOV + this._fovBoost;
    this.camera.updateProjectionMatrix();

    const t = now / 1000;
    this.uniforms.uTime.value = t;
    this.uniforms.uForm.value = clamp01((p - FORM_START) / (FORM_END - FORM_START));
    this.points.rotation.y = t * 0.015;
    this._placeCamera(p);
    this._render();
    this._applyStages(p);

    if (this.visible || this.current !== target) {
      this.raf = requestAnimationFrame(this._tick);
    } else {
      this.running = false;
    }
  };

  /** Force a synchronous update (used by tests / non-rAF environments). */
  update() {
    const p = this.progress();
    this.current = p;
    if (this.renderer) {
      this.uniforms.uForm.value = clamp01((p - FORM_START) / (FORM_END - FORM_START));
      this._placeCamera(p);
      this._render();
    }
    this._applyStages(p);
    return p;
  }

  /** Chapter-dot navigation: glide to the midpoint of a stage's window. */
  _seek(i) {
    const s = this.stages[i];
    if (!s) return;
    const p = clamp01((Math.max(0, s.from) + Math.min(1, s.to)) / 2);
    const span = this.root.offsetHeight - window.innerHeight;
    smoothScrollTo(this.root.offsetTop + p * span);
  }

  _stageAlpha(stage, p) {
    const aIn = clamp01((p - stage.from) / RAMP);
    const aOut = stage.hold === 'end' ? 1 : clamp01((stage.to - p) / RAMP);
    return Math.min(aIn, aOut);
  }

  _applyStages(p) {
    let active = -1;
    let best = 0.5; // a dot lights up once its stage is at least half faded in
    this.stages.forEach((stage, i) => {
      const a = this._stageAlpha(stage, p);
      const el = this.stageEls[i];
      el.style.opacity = a.toFixed(3);
      // Children translate off --rise at different rates (CSS multipliers),
      // so headline, sub, and actions rise with a staggered parallax.
      el.style.setProperty('--rise', `${((1 - a) * 30).toFixed(1)}px`);
      el.style.pointerEvents = stage.interactive && a > 0.5 ? 'auto' : 'none';
      if (a > best) { best = a; active = i; }
    });
    if (active !== this._activeDot) {
      this._activeDot = active;
      this.dotEls.forEach((d, i) => d.classList.toggle('active', i === active));
    }
    this.cue.style.opacity = clamp01(1 - p / 0.06).toFixed(3);
    // Scrim: dim a touch whenever copy is up (skip the title, which owns the
    // top of the page), and harder over the busy closing shot for the CTA.
    const copyDim = active > 0 ? best * 0.28 : 0;
    const endDim = clamp01((p - 0.8) / 0.2) * 0.45;
    this.dim.style.opacity = Math.max(copyDim, endDim).toFixed(3);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('scroll', this._onScroll ?? (() => {}));
    this.io?.disconnect();
    this.ro?.disconnect();
    this.geo?.dispose();
    this.mat?.dispose();
    this.renderer?.dispose();
    this.root.remove();
  }
}
