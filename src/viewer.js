import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

// Quality profiles (DESIGN.md §10). SH degree and alpha threshold are load-time
// parameters in the underlying library, so changing them reloads the scene.
export const QUALITY_PRESETS = {
  high:        { shDegree: 2, alphaThreshold: 1,  ignoreDevicePixelRatio: false },
  balanced:    { shDegree: 1, alphaThreshold: 5,  ignoreDevicePixelRatio: false },
  performance: { shDegree: 0, alphaThreshold: 20, ignoreDevicePixelRatio: true },
};

export function detectPresetName() {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile) return 'performance';
  return 'balanced';
}

const FORMAT_BY_EXT = {
  ply: GaussianSplats3D.SceneFormat.Ply,
  splat: GaussianSplats3D.SceneFormat.Splat,
  ksplat: GaussianSplats3D.SceneFormat.KSplat,
  spz: GaussianSplats3D.SceneFormat.Spz,
};

export function formatForFilename(name) {
  const ext = name.split('.').pop().toLowerCase();
  return FORMAT_BY_EXT[ext];
}

export function isSupportedFilename(name) {
  return formatForFilename(name) !== undefined;
}

// The library's LoaderStatus enum isn't exported; these are its wire values.
const LOADER_PHASE = { 0: 'Downloading', 1: 'Processing', 2: 'Done' };

// Every iPhone/iPad browser is WebKit (iPadOS reports itself as a Mac with
// touch). WebKit's SharedArrayBuffer-in-worker path is the classic cause of
// splat loads hanging after download on iOS, and the library only guards
// against it on iOS < 16 — so keep the zero-copy sort path desktop-only.
// Sorting our ~70k-splat scenes through copied memory is still trivially fast.
const IS_IOS_WEBKIT = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function isAbortError(err) {
  if (!err) return false;
  return /abort/i.test(err.name || '') || /abort/i.test(err.message || '');
}

/**
 * Wraps GaussianSplats3D.Viewer with Mirage's lifecycle:
 * one scene at a time, full dispose between loads (no GPU memory leaks),
 * camera reset, screenshots, and stats. Knows nothing about the UI —
 * callers subscribe via the callbacks passed to load().
 */
export class MirageViewer {
  constructor(rootElement) {
    this.root = rootElement;
    this.viewer = null;
    this.renderer = null;
    this.resizeObserver = null;
    this.loadPromise = null;
    this.loadToken = 0;
    this.camera = { up: [0, 1, 0], position: [0, 0, 5], lookAt: [0, 0, 0] };
  }

  // Build our own renderer with preserveDrawingBuffer so the canvas can be both
  // screenshotted and captured to video (captureStream reads empty frames from a
  // WebGL canvas that clears its drawing buffer each frame). The library skips
  // sizing/append/resize for an external renderer, so we own all of that here.
  // For an XR session we drop preserveDrawingBuffer — it can degrade the XR
  // compositor and video capture is irrelevant inside a headset.
  _createRenderer(ignoreDevicePixelRatio, forXR = false) {
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      precision: 'highp',
      preserveDrawingBuffer: !forXR,
      alpha: true,
    });
    renderer.setPixelRatio(ignoreDevicePixelRatio ? 1 : (window.devicePixelRatio || 1));
    renderer.autoClear = true;
    renderer.setClearColor(new THREE.Color(0x000000), 0.0);
    renderer.setSize(this.root.clientWidth || 1, this.root.clientHeight || 1);
    this.root.appendChild(renderer.domElement);
    return renderer;
  }

  _observeResize() {
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.renderer) return;
      const w = this.root.clientWidth || 1;
      const h = this.root.clientHeight || 1;
      this.renderer.setSize(w, h);
      const cam = this.viewer?.camera;
      if (cam?.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      this.viewer?.forceRenderNextFrame?.();
    });
    this.resizeObserver.observe(this.root);
  }

  /**
   * Load a scene, tearing down any previous one first.
   * @param {object} source  { url, format, name, camera? }
   * @param {object} opts    { quality: {shDegree, alphaThreshold, ignoreDevicePixelRatio},
   *                           progressive: boolean, onProgress(pct, label, phase) }
   * @returns {Promise<boolean>} true if the scene finished loading, false if superseded/aborted
   */
  async load(source, { quality, progressive = true, onProgress, webXRMode = 'None' } = {}) {
    const token = ++this.loadToken;
    await this.dispose();
    if (token !== this.loadToken) return false;

    this.camera = {
      up: source.camera?.up ?? [0, 1, 0],
      position: source.camera?.position ?? [0, 0, 5],
      lookAt: source.camera?.lookAt ?? [0, 0, 0],
    };
    this.webXRMode = webXRMode;
    const xr = webXRMode && webXRMode !== 'None';

    this.renderer = this._createRenderer(quality?.ignoreDevicePixelRatio ?? false, xr);
    this.viewer = new GaussianSplats3D.Viewer({
      rootElement: this.root,
      renderer: this.renderer,
      cameraUp: this.camera.up,
      initialCameraPosition: this.camera.position,
      initialCameraLookAt: this.camera.lookAt,
      sphericalHarmonicsDegree: quality?.shDegree ?? 1,
      ignoreDevicePixelRatio: quality?.ignoreDevicePixelRatio ?? false,
      webXRMode: GaussianSplats3D.WebXRMode[webXRMode] ?? GaussianSplats3D.WebXRMode.None,
      // SharedArrayBuffer needs cross-origin isolation (COOP/COEP). Fall back
      // to copying memory into the sort worker when the host doesn't send
      // them — and never use it on iOS WebKit (see IS_IOS_WEBKIT).
      sharedMemoryForWorkers: window.crossOriginIsolated === true && !IS_IOS_WEBKIT,
      logLevel: GaussianSplats3D.LogLevel.None,
    });
    this._observeResize();

    this.loadPromise = this.viewer.addSplatScene(source.url, {
      format: source.format,
      splatAlphaRemovalThreshold: quality?.alphaThreshold ?? 5,
      progressiveLoad: progressive,
      showLoadingUI: false,
      onProgress: (pct, label, status) => {
        if (token !== this.loadToken) return;
        onProgress?.(pct, label, LOADER_PHASE[status] ?? 'Loading');
      },
    });

    // With progressive loading the scene should appear as sections stream in,
    // so start the render loop immediately rather than on resolve.
    this.viewer.start();

    try {
      await this.loadPromise;
    } catch (err) {
      if (isAbortError(err) || token !== this.loadToken) return false;
      throw err;
    } finally {
      if (token === this.loadToken) this.loadPromise = null;
    }
    return token === this.loadToken;
  }

  resetView() {
    if (!this.viewer) return;
    const { up, position, lookAt } = this.camera;
    this.viewer.camera.up.fromArray(up).normalize();
    this.viewer.camera.position.fromArray(position);
    if (this.viewer.controls) {
      this.viewer.controls.target.fromArray(lookAt);
      this.viewer.controls.update();
    } else {
      this.viewer.camera.lookAt(...lookAt);
    }
  }

  /** Current orbit view as plain arrays: { position, target, up }. */
  getCameraPose() {
    if (!this.viewer) return null;
    const cam = this.viewer.camera;
    const target = this.viewer.controls?.target;
    return {
      position: cam.position.toArray(),
      target: target ? target.toArray() : this.camera.lookAt.slice(),
      up: cam.up.toArray(),
    };
  }

  /** Apply an orbit view. `up` is optional (scenes keep a fixed up otherwise). */
  setCameraPose({ position, target, up } = {}) {
    if (!this.viewer) return;
    const cam = this.viewer.camera;
    if (up) cam.up.fromArray(up).normalize();
    if (position) cam.position.fromArray(position);
    if (target && this.viewer.controls) {
      this.viewer.controls.target.fromArray(target);
      this.viewer.controls.update();
    } else if (target) {
      cam.lookAt(...target);
    }
    this.viewer.forceRenderNextFrame?.();
  }

  /** Enable/disable user camera control (for scripted playback, compare, crop). */
  setControlsEnabled(enabled) {
    if (this.viewer?.controls) this.viewer.controls.enabled = enabled;
  }

  /** The loaded SplatBuffer (for cropping/re-export), or null. */
  getSplatBuffer() {
    try {
      return this.viewer?.getSplatMesh()?.getSplatBuffer?.()
        ?? this.viewer?.getSplatScene?.(0)?.splatBuffer
        ?? null;
    } catch {
      return null;
    }
  }

  /** Add/remove an auxiliary THREE object (e.g. a crop wireframe) to the scene. */
  addSceneObject(obj) { this.viewer?.threeScene?.add(obj); }
  removeSceneObject(obj) { this.viewer?.threeScene?.remove(obj); }

  /** Render one frame and read the canvas back as a PNG blob. */
  async screenshot() {
    if (!this.viewer) return null;
    this.viewer.update();
    this.viewer.render();
    const canvas = this.root.querySelector('canvas');
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  getSplatCount() {
    try {
      return this.viewer?.getSplatMesh()?.getSplatCount() ?? 0;
    } catch {
      return 0;
    }
  }

  /** Abort any in-flight download and free all GPU/worker resources. */
  async dispose() {
    if (this.loadPromise) {
      try { this.loadPromise.abort('scene change'); } catch { /* already settled */ }
      this.loadPromise = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.viewer) {
      const v = this.viewer;
      this.viewer = null;
      try { await v.dispose(); } catch { /* tolerate double-dispose during teardown */ }
    }
    if (this.renderer) {
      try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch { /* best effort */ }
      this.renderer = null;
    }
    this.root.replaceChildren();
  }
}
