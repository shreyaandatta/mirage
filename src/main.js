import './style.css';
import { MirageViewer, QUALITY_PRESETS, detectPresetName, formatForFilename } from './viewer.js';
import { SCENES, renderGallery, installDragAndDrop } from './gallery.js';
import { convertPlyToKSplat } from './convert.js';
import { LoadingOverlay } from './ui/loading.js';
import { Hud, ICONS } from './ui/hud.js';
import { toast } from './ui/toast.js';
import { SceneRecorder, recordingSupported } from './ui/recorder.js';
import { openPhotoConverter } from './ui/photoModal.js';
import { openCameraCapture } from './ui/cameraCapture.js';
import { CameraPath, playPath } from './cameraPath.js';
import { PathPanel } from './ui/pathPanel.js';
import { openCaptureGuide } from './ui/guide.js';
import { CompareSlider } from './ui/compareSlider.js';
import { runTour, tourWasSeen } from './ui/tour.js';
import { CropPanel } from './ui/cropPanel.js';
import { cropSplats, downloadCroppedKSplat } from './crop.js';
import { parseHash, buildHash, encodePose, decodePose } from './urlState.js';
import { librarySupported, saveScene, getScene } from './sceneLibrary.js';
import { initSmoothScroll, pauseSmoothScroll, resumeSmoothScroll } from './smoothScroll.js';
import { RollingWindow } from './perfStats.js';
import { PerfHud, perfHudEnabled } from './ui/perfHud.js';

const app = document.getElementById('app');

// ---------- Settings (persisted) ----------

const SETTINGS_KEY = 'mirage-settings-v1';

function defaultSettings() {
  const preset = detectPresetName();
  return { preset, progressive: true, ...QUALITY_PRESETS[preset] };
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && typeof saved === 'object') return { ...defaultSettings(), ...saved };
  } catch { /* corrupted storage — fall through to defaults */ }
  return defaultSettings();
}

let settings = loadSettings();

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function qualityFromSettings() {
  const base = QUALITY_PRESETS[settings.preset] ?? {};
  return {
    shDegree: settings.shDegree,
    alphaThreshold: settings.alphaThreshold,
    ignoreDevicePixelRatio: base.ignoreDevicePixelRatio ?? false,
  };
}

// ---------- Viewer page state ----------

let mirage = null;          // MirageViewer for the active viewer page
let hud = null;
let statsRaf = 0;
let localUrl = null;        // object URL of the most recent dropped file
let currentSource = null;   // what's loaded now (for reload on settings change)
let navToken = 0;           // guards against stale async navigation
let recorder = null;        // SceneRecorder while a fly-through is being captured
let recTimer = 0;
let currentPath = null;     // CameraPath being built for the active session
let pathPanel = null;
let pathPlayback = null;    // { cancel } while a path is previewing/recording
let compareSlider = null;   // active photo-vs-splat comparison
let compareRefUrl = null;   // object URL of a user-picked reference photo
let cropPanel = null;       // active crop tool
let croppedUrl = null;      // object URL of a cropped scene being viewed
let currentXRMode = 'None'; // 'None' | 'VR' | 'AR'
let perfHud = null;         // ?hud=1 diagnostics overlay

function teardownViewerPage() {
  cancelAnimationFrame(statsRaf);
  statsRaf = 0;
  pathPlayback?.cancel();
  pathPlayback = null;
  currentPath = null;
  pathPanel = null;
  compareSlider?.destroy();
  compareSlider = null;
  cropPanel?.destroy();
  cropPanel = null;
  // Finalize an in-progress recording so leaving the page doesn't discard it.
  if (recorder?.isRecording) finishRecording();
  else recorder?.cancel();
  recorder = null;
  clearInterval(recTimer);
  recTimer = 0;
  hud = null;
  perfHud?.destroy();
  perfHud = null;
  if (mirage) {
    const m = mirage;
    mirage = null;
    m.dispose(); // async; safe to let it finish in the background
  }
  currentSource = null;
}

function startStatsLoop() {
  let frames = 0;
  let last = performance.now();
  let prevFrame = last;
  const frameTimes = new RollingWindow(240);
  const tick = (now) => {
    frames++;
    frameTimes.push(now - prevFrame);
    prevFrame = now;
    if (now - last >= 500) {
      const fps = Math.round((frames * 1000) / (now - last));
      const splats = mirage?.getSplatCount() ?? 0;
      hud?.setStats(fps, splats);
      perfHud?.update({
        fps,
        frameMedian: frameTimes.quantile(0.5),
        frameP95: frameTimes.quantile(0.95),
        splats,
        rendererInfo: mirage?.renderer?.info,
      });
      frames = 0;
      last = now;
    }
    statsRaf = requestAnimationFrame(tick);
  };
  statsRaf = requestAnimationFrame(tick);
}

// ---------- Pages ----------

let galleryHero = null;     // ScrollHero instance while the gallery is shown
let tourObserver = null;    // arms first-visit tour when the gallery scrolls into view

function teardownGalleryPage() {
  galleryHero?.destroy();
  galleryHero = null;
  tourObserver?.disconnect();
  tourObserver = null;
}

function showGallery() {
  teardownViewerPage();
  teardownGalleryPage();
  resumeSmoothScroll();
  document.title = 'Mirage — real-time Gaussian Splatting in the browser';
  galleryHero = renderGallery(app, {
    onOpenScene: (scene) => { location.hash = `#/scene/${scene.id}`; },
    onOpenFile: openLocalFile,
    onConvertPhotos: openPhotoConverter,
    onCaptureLive: openCameraCapture,
    onOpenGuide: openCaptureGuide,
    onStartTour: startTour,
  });
  if (import.meta.env.DEV) window.__hero = galleryHero;
  maybeAutoStartTour();
}

// ---------- Guided tour ----------

const TOUR_STEPS = [
  { title: 'Welcome to Mirage', body: 'Capture real objects and spaces with a phone, then explore them as photorealistic 3D scenes right here in your browser. Here’s the 20-second tour.' },
  { selector: '[data-tour="scenes"]', title: 'Sample scenes', body: 'Start with a bundled scene — each is tens of thousands of gaussians, sorted and rendered live every frame.' },
  { selector: '[data-tour="upload"]', title: 'Bring your own capture', body: 'Drop a .ply / .splat / .ksplat / .spz anywhere on the page. It’s processed entirely in your browser — nothing is uploaded.' },
  { selector: '[data-tour="prep"]', title: 'Capture prep', body: 'iPhone photos are HEIC; COLMAP wants JPG. Convert a whole shoot to JPG here before you reconstruct.' },
  {
    title: 'Inside a scene',
    body: 'Opening the nebula… you can orbit, screenshot, record an MP4 fly-through, build a cinematic camera path, compare against a reference photo, and share a link to any view.',
    navigate: () => { if (parseHash(location.hash).route !== '/scene/nebula') location.hash = '#/scene/nebula'; },
    selector: '.toolbar',
  },
  { selector: '.toolbar-extra', title: 'Path · compare · share', body: 'These are the fly-through path recorder, the photo-vs-splat compare slider, and “copy a link to this exact view.” That’s the whole loop — go explore!' },
];

function startTour() {
  runTour(TOUR_STEPS);
}

// The scroll hero is now the landing experience, so the first-visit tour waits
// until the user actually reaches the gallery content instead of covering it.
function maybeAutoStartTour() {
  if (tourWasSeen()) return;
  const target = app.querySelector('[data-tour="scenes"]');
  if (!target) return;
  tourObserver = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    tourObserver.disconnect();
    tourObserver = null;
    if (!tourWasSeen()) startTour();
  }, { threshold: 0.25 });
  tourObserver.observe(target);
}

async function showViewer(source, { initialView, initialPath, webXRMode = 'None' } = {}) {
  const token = ++navToken;
  teardownViewerPage();
  teardownGalleryPage();
  // The viewer is a fixed full-viewport page — hand the wheel back to
  // OrbitControls zoom instead of Lenis.
  pauseSmoothScroll();
  currentSource = source;
  currentXRMode = webXRMode;
  document.title = `${source.name} — Mirage`;

  app.innerHTML = '<div class="viewer-page"><div class="viewer-canvas-host"></div></div>';
  const page = app.querySelector('.viewer-page');
  const host = app.querySelector('.viewer-canvas-host');

  const overlay = new LoadingOverlay(page);
  hud = new Hud(page, {
    sceneName: source.name,
    canConvert: source.isLocal && /\.ply$/i.test(source.fileName ?? ''),
    canRecord: recordingSupported(),
    settings: { ...settings },
    onBack: () => { location.hash = '#/'; },
    onReset: () => mirage?.resetView(),
    onScreenshot: takeScreenshot,
    onRecordToggle: toggleRecording,
    onFullscreen: () => toggleFullscreen(page),
    onConvert: () => runConversion(source),
    onPresetPicked: (name, h) => {
      if (QUALITY_PRESETS[name]) h.applyPresetValues(QUALITY_PRESETS[name]);
    },
    onApplySettings: (next) => {
      settings = { ...settings, ...next };
      saveSettings();
      toast('Reloading scene with new quality settings…');
      showViewer(source);
    },
  });

  mirage = new MirageViewer(host);
  if (import.meta.env.DEV) window.__mirage = mirage; // dev-only inspection hook
  if (perfHudEnabled()) perfHud = new PerfHud(page);
  setupViewerTools();
  startStatsLoop();
  overlay.show(source.name);

  try {
    const completed = await mirage.load(source, {
      quality: qualityFromSettings(),
      progressive: settings.progressive,
      webXRMode,
      onProgress: (pct, label, phase) => {
        if (token === navToken) overlay.update(pct, label, phase);
      },
    });
    if (token !== navToken) return;
    overlay.hide();
    if (!completed) return;
    // Apply a shared path or pose once the camera exists.
    if (initialPath instanceof CameraPath) {
      currentPath = initialPath;
      pathPanel?.setCount(currentPath.length);
      toast('Loaded a shared fly-through path — open the path panel to play it.', 'info', 5000);
    }
    if (initialView) mirage.setCameraPose(initialView);
  } catch (err) {
    if (token !== navToken) return;
    overlay.hide();
    console.error('Scene load failed:', err);
    toast(
      `Couldn't load "${source.name}" — ${friendlyLoadError(err)}`,
      'error',
      8000,
    );
    location.hash = '#/';
  }
}

function friendlyLoadError(err) {
  const msg = err?.message ?? String(err);
  if (/fetch|network|404|failed to load/i.test(msg)) return 'the file could not be fetched.';
  if (/parse|invalid|unexpected|format/i.test(msg)) return 'the file does not look like a valid splat scene.';
  return msg;
}

// ---------- Actions ----------

async function openLocalFile(file) {
  const format = formatForFilename(file.name);
  if (format === undefined) {
    toast(`"${file.name}" isn't a supported format — try .ply, .splat, .ksplat, or .spz.`, 'error');
    return;
  }

  // Persist to the IndexedDB library first: the scene gets a #/lib/<id>
  // URL that still works after a reload. If storage fails (quota,
  // private mode), fall back to the session-only object-URL flow.
  if (librarySupported()) {
    try {
      const meta = await saveScene(file);
      toast(`Saved to your library — "${file.name}" will still be here after a reload.`, 'success', 4000);
      location.hash = `#/lib/${meta.id}`; // the router loads it from the library
      return;
    } catch (err) {
      console.warn('Library save failed, opening session-only:', err);
      toast('Could not save to your library (storage full or blocked) — opening without saving.', 'info', 5000);
    }
  }

  if (localUrl) URL.revokeObjectURL(localUrl);
  localUrl = URL.createObjectURL(file);
  location.hash = '#/local';
  showViewer(localFileSource(file.name, localUrl, format));
}

function localFileSource(fileName, url, format) {
  return {
    url,
    format,
    name: fileName,
    isLocal: true,
    fileName,
    // Captured scenes (COLMAP / Inria pipeline) are usually -Y up.
    camera: { up: [0, -1, 0], position: [0, 0, 5], lookAt: [0, 0, 0] },
  };
}

async function openLibraryScene(id, extras = {}) {
  let record = null;
  try {
    record = await getScene(id);
  } catch (err) {
    console.error('Library read failed:', err);
  }
  if (!record) {
    toast('That scene is no longer in your library.', 'error');
    location.hash = '#/';
    return;
  }
  if (localUrl) URL.revokeObjectURL(localUrl);
  localUrl = URL.createObjectURL(record.blob);
  showViewer({
    ...localFileSource(record.name, localUrl, formatForFilename(record.name)),
    libraryId: id,
  }, extras);
}

async function takeScreenshot() {
  const blob = await mirage?.screenshot();
  if (!blob) {
    toast('Screenshot failed — no scene is rendering yet.', 'error');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mirage-${(currentSource?.name ?? 'scene').replace(/[^\w-]+/g, '-').toLowerCase()}-${Date.now()}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Screenshot saved.', 'success', 2500);
}

// ---------- Viewer tools (path recorder, share) ----------

function setupViewerTools() {
  currentPath = new CameraPath([], 6);
  pathPanel = new PathPanel({
    onAdd: () => { currentPath.addKeyframe(mirage.getCameraPose()); pathPanel.setCount(currentPath.length); },
    onClear: () => { currentPath.clear(); pathPanel.setCount(0); },
    onDuration: (v) => { currentPath.durationSec = v; },
    onPreview: previewPath,
    onRecord: recordPath,
    onShare: sharePath,
  });
  pathPanel.setCount(0);
  hud.addPanel(pathPanel.el);

  const pathBtn = hud.addToolbarButton({
    icon: ICONS.path,
    title: 'Fly-through path recorder',
    onClick: () => pathBtn.classList.toggle('active', pathPanel.toggle()),
  });

  const compareBtn = hud.addToolbarButton({
    icon: ICONS.compare,
    title: 'Compare with a reference photo',
    onClick: () => toggleCompare(compareBtn),
  });

  const cropBtn = hud.addToolbarButton({
    icon: ICONS.crop,
    title: 'Crop / clean up floaters',
    onClick: () => toggleCrop(cropBtn),
  });

  hud.addToolbarButton({
    icon: ICONS.share,
    title: 'Copy a link to this exact view',
    onClick: shareView,
  });

  // WebXR button appears only on devices that actually support a session
  // (Quest / WebXR-capable Android). Hidden on iOS Safari and plain desktops.
  const hudAtSetup = hud;
  xrSupport().then(({ vr, ar }) => {
    if (hud !== hudAtSetup || (!vr && !ar)) return; // navigated away, or unsupported
    const mode = vr ? 'VR' : 'AR';
    const xrBtn = hud.addToolbarButton({
      icon: ICONS.xr,
      title: currentXRMode !== 'None' ? 'Exit XR' : `View in ${mode}`,
      onClick: () => enterXR(mode, xrBtn),
      active: currentXRMode !== 'None',
    });
  });
}

async function xrSupport() {
  if (!navigator.xr?.isSessionSupported) return { vr: false, ar: false };
  const check = (m) => navigator.xr.isSessionSupported(m).catch(() => false);
  const [vr, ar] = await Promise.all([check('immersive-vr'), check('immersive-ar')]);
  return { vr, ar };
}

function enterXR(mode) {
  if (!currentSource) return;
  if (currentXRMode !== 'None') {
    toast('Exiting XR mode.', 'info', 2000);
    showViewer(currentSource, { webXRMode: 'None' });
  } else {
    toast(`Loading ${mode} mode — tap the “${mode}” button that appears to enter the session.`, 'info', 7000);
    showViewer(currentSource, { webXRMode: mode });
  }
}

function toggleCrop(btn) {
  if (cropPanel) { cropPanel.destroy(); cropPanel = null; btn?.classList.remove('active'); return; }
  const sb = mirage?.getSplatBuffer();
  if (!sb) { toast('The scene is still loading — try again in a moment.', 'error'); return; }
  cropPanel = new CropPanel(mirage, {
    onExport: exportCropped,
    onView: viewCropped,
    onExit: () => { cropPanel = null; btn?.classList.remove('active'); },
  });
  hud.addPanel(cropPanel.el);
  btn?.classList.add('active');
}

async function exportCropped(box) {
  const sb = mirage?.getSplatBuffer();
  if (!sb) return;
  const { splatArrayBuffer, kept, total } = cropSplats(sb, box);
  if (!kept) { toast('The crop box is empty — nothing to export.', 'error'); return; }
  toast(`Building cropped .ksplat (${kept.toLocaleString()} splats)…`);
  try {
    const base = (currentSource?.name ?? 'scene').replace(/[^\w-]+/g, '-').toLowerCase();
    await downloadCroppedKSplat(splatArrayBuffer, `${base}-cropped.ksplat`);
    toast(`Saved ${base}-cropped.ksplat — kept ${kept.toLocaleString()} of ${total.toLocaleString()} splats.`, 'success', 6000);
  } catch (err) {
    console.error('Crop export failed:', err);
    toast(`Crop export failed: ${err?.message ?? err}`, 'error', 7000);
  }
}

function viewCropped(box) {
  const sb = mirage?.getSplatBuffer();
  if (!sb) return;
  const { splatArrayBuffer, kept } = cropSplats(sb, box);
  if (!kept) { toast('The crop box is empty.', 'error'); return; }
  if (croppedUrl) URL.revokeObjectURL(croppedUrl);
  croppedUrl = URL.createObjectURL(new Blob([splatArrayBuffer]));
  cropPanel?.destroy();
  cropPanel = null;
  const src = {
    url: croppedUrl,
    format: formatForFilename('x.splat'),
    name: `${currentSource?.name ?? 'Scene'} (cropped)`,
    isLocal: true,
    fileName: 'cropped.splat',
    camera: currentSource?.camera,
  };
  location.hash = '#/local';
  showViewer(src);
}

function openCompare(imageUrl, pose, btn) {
  const host = app.querySelector('.viewer-canvas-host');
  if (!host) return;
  if (pose) mirage.setCameraPose(pose);
  compareSlider = new CompareSlider(host, imageUrl, {
    onClose: () => { compareSlider = null; btn?.classList.remove('active'); },
  });
  btn?.classList.add('active');
}

function toggleCompare(btn) {
  if (compareSlider) { compareSlider.destroy(); return; }
  const cmp = currentSource?.compare;
  if (cmp?.image) {
    openCompare(cmp.image, cmp.pose, btn);
    return;
  }
  // Bring-your-own reference: pick a photo to overlay on the live splat.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (compareRefUrl) URL.revokeObjectURL(compareRefUrl);
    compareRefUrl = URL.createObjectURL(file);
    openCompare(compareRefUrl, null, btn);
  });
  input.click();
}

function previewPath() {
  if (!currentPath || currentPath.length < 2 || pathPlayback) return;
  pathPlayback = playPath(mirage, currentPath);
  pathPlayback.promise.then(() => { pathPlayback = null; });
}

async function recordPath() {
  if (!currentPath || currentPath.length < 2 || pathPlayback) return;
  const canvas = app.querySelector('.viewer-canvas-host canvas');
  if (!canvas || !recordingSupported()) {
    toast('Recording isn\'t supported in this browser.', 'error');
    return;
  }
  recorder = new SceneRecorder(canvas);
  if (!recorder.start()) {
    recorder = null;
    toast('Recording isn\'t supported in this browser.', 'error');
    return;
  }
  pathPanel?.setBusy(true);
  hud?.setRecording(true, 0);
  clearInterval(recTimer);
  recTimer = setInterval(() => hud?.setRecording(true, recorder?.elapsedSeconds() ?? 0), 500);

  pathPlayback = playPath(mirage, currentPath);
  await pathPlayback.promise;
  pathPlayback = null;
  pathPanel?.setBusy(false);
  await finishRecording();
}

function currentRoute() {
  return parseHash(location.hash).route || '/';
}

async function copyLink(url, message) {
  try {
    await navigator.clipboard.writeText(url);
    toast(message, 'success', 3500);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(message, 'success', 3500); }
    catch { toast(`Copy this link: ${url}`, 'info', 9000); }
    ta.remove();
  }
}

function shareView() {
  const pose = mirage?.getCameraPose();
  if (!pose) return;
  const hash = buildHash(currentRoute(), { view: encodePose(pose) });
  copyLink(location.origin + location.pathname + hash, 'View link copied — opens at this camera angle.');
}

function sharePath() {
  if (!currentPath || currentPath.length < 2) return;
  const hash = buildHash(currentRoute(), { path: currentPath.toURLValue() });
  copyLink(location.origin + location.pathname + hash, 'Path link copied — opens with this fly-through.');
}

function toggleRecording() {
  if (pathPlayback) return; // a path recording is already running
  if (recorder?.isRecording) {
    finishRecording();
    return;
  }
  const canvas = app.querySelector('.viewer-canvas-host canvas');
  if (!canvas) {
    toast('Nothing to record yet — wait for the scene to appear.', 'error');
    return;
  }
  recorder = new SceneRecorder(canvas);
  if (!recorder.start()) {
    recorder = null;
    toast('Recording isn\'t supported in this browser.', 'error');
    return;
  }
  hud?.setRecording(true, 0);
  toast('Recording — move the camera, then stop to save the clip.', 'info', 3000);
  clearInterval(recTimer);
  recTimer = setInterval(() => hud?.setRecording(true, recorder?.elapsedSeconds() ?? 0), 500);
}

async function finishRecording() {
  clearInterval(recTimer);
  recTimer = 0;
  const rec = recorder;
  recorder = null;
  hud?.setRecording(false);
  if (!rec) return;
  const result = await rec.stop();
  if (!result) {
    toast('Recording produced no data.', 'error');
    return;
  }
  const base = (currentSource?.name ?? 'scene').replace(/[^\w-]+/g, '-').toLowerCase();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(result.blob);
  a.download = `mirage-${base}-${Date.now()}.${result.ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 15000);
  const sizeMb = (result.blob.size / 1048576).toFixed(1);
  toast(`Saved ${result.ext.toUpperCase()} fly-through (${sizeMb} MB).`, 'success', 4000);
}

function toggleFullscreen(el) {
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen?.().catch(() => toast('Fullscreen was blocked by the browser.', 'error'));
}

async function runConversion(source) {
  toast('Converting to .ksplat — this can take a moment for big scenes…');
  try {
    const outName = (source.fileName ?? 'scene.ply').replace(/\.ply$/i, '.ksplat');
    await convertPlyToKSplat(source.url, outName);
    toast(`Saved ${outName} — load that next time for faster startup.`, 'success', 6000);
  } catch (err) {
    console.error('Conversion failed:', err);
    toast(`Conversion failed: ${err?.message ?? err}`, 'error', 7000);
  }
}

// ---------- Keyboard shortcuts ----------

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (!mirage) return;
  const key = e.key.toLowerCase();
  if (key === 'escape') location.hash = '#/';
  else if (key === 'r') mirage.resetView();
  else if (key === 'f') toggleFullscreen(app.querySelector('.viewer-page'));
  else if (key === 's') takeScreenshot();
  else if (key === 'v') toggleRecording();
});

// ---------- Routing ----------

function route() {
  const { route: r, params } = parseHash(location.hash || '#/');
  const sceneMatch = r.match(/^\/scene\/([\w-]+)$/);
  if (sceneMatch) {
    const scene = SCENES.find(s => s.id === sceneMatch[1]);
    if (scene) {
      const initialView = decodePose(params.get('view'));
      const initialPath = params.get('path') ? CameraPath.fromURLValue(params.get('path')) : null;
      showViewer({
        url: `${import.meta.env.BASE_URL}${scene.file}`,
        format: scene.format,
        name: scene.name,
        camera: scene.camera,
        compare: scene.compare,
        isLocal: false,
      }, { initialView, initialPath });
      return;
    }
    toast(`Unknown scene "${sceneMatch[1]}".`, 'error');
  }
  const libMatch = r.match(/^\/lib\/([\w-]+)$/);
  if (libMatch) {
    if (currentSource?.libraryId === libMatch[1]) return; // already showing it
    openLibraryScene(libMatch[1], {
      initialView: decodePose(params.get('view')),
      initialPath: params.get('path') ? CameraPath.fromURLValue(params.get('path')) : null,
    });
    return;
  }
  if (r === '/local' && currentSource?.isLocal) return; // already showing it
  if (r !== '/') location.hash = '#/';
  showGallery();
}

window.addEventListener('hashchange', route);

// Lenis smooth scrolling for the landing page (no-op under reduced motion).
// Must exist before the first route() so the hero can tune its scrub easing.
initSmoothScroll();

installDragAndDrop({
  onOpenFile: openLocalFile,
  onConvertPhotos: openPhotoConverter,
  onReject: (msg) => toast(msg, 'error'),
});
route();
