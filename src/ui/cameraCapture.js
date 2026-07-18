/**
 * Live in-browser camera capture for the reconstruction pipeline. Opens the
 * device's rear camera (getUserMedia), and lets the user either:
 *   • Photos — snap a burst of overlapping frames while slowly orbiting the
 *     subject, downloaded as a zip of JPGs (what COLMAP / most trainers want).
 *   • Video — record a slow steady orbit clip, downloaded as MP4 (WebM
 *     fallback), for trainers that ingest video directly (Luma / Polycam).
 *
 * Everything stays on-device — Mirage has no backend, and reconstruction runs
 * in the offline pipeline (see the capture guide). This is the on-ramp that
 * gets frames/video off the phone; it pairs with the HEIC→JPG capture prep.
 *
 * JSZip (~100KB) is imported dynamically so it only loads when a user actually
 * finishes a photo burst, keeping the initial bundle small.
 */
import { pickRecordingFormat } from './recorder.js';

const MAX_FRAMES = 300;          // memory guard for a burst
const AUTO_INTERVAL_MS = 700;    // auto-snap cadence
const JPEG_QUALITY = 0.92;

/** True if the browser can open a camera here (needs a secure context). */
export function cameraCaptureSupported() {
  return !!navigator.mediaDevices?.getUserMedia;
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 15000);
}

export function openCameraCapture() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal cam-modal">
      <h3>Capture live</h3>
      <p class="modal-sub">Shoot your subject right here — nothing leaves your device. Snap a burst of photos or record a clip, then feed it to the reconstruction pipeline.</p>

      <div class="cam-seg" role="tablist">
        <button class="cam-seg-btn active" data-mode="photos" role="tab">Photos</button>
        <button class="cam-seg-btn" data-mode="video" role="tab">Video</button>
      </div>

      <div class="cam-view">
        <video class="cam-video" playsinline muted autoplay></video>
        <div class="cam-rec-dot" hidden></div>
        <div class="cam-tip">Move slowly around your subject · keep it centred · overlap each shot ~70%</div>
      </div>

      <div class="cam-controls" hidden>
        <div class="cam-ctl-photos">
          <button class="btn primary cam-shutter" data-act="snap">Snap frame</button>
          <button class="btn cam-auto" data-act="auto" aria-pressed="false">Auto‑snap</button>
          <span class="cam-count">0 frames</span>
        </div>
        <div class="cam-ctl-video" hidden>
          <button class="btn primary cam-rec" data-act="rec">● Record</button>
          <span class="cam-timer" hidden>0.0s</span>
        </div>
      </div>

      <div class="modal-status"></div>
      <div class="modal-actions">
        <button class="btn cam-finish" data-act="finish" hidden>Download .zip</button>
        <button class="btn" data-act="close">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const $ = (s) => overlay.querySelector(s);
  const video = $('.cam-video');
  const controls = $('.cam-controls');
  const status = $('.modal-status');
  const finishBtn = $('.cam-finish');
  const recDot = $('.cam-rec-dot');
  const segBtns = [...overlay.querySelectorAll('.cam-seg-btn')];
  const ctlPhotos = $('.cam-ctl-photos');
  const ctlVideo = $('.cam-ctl-video');
  const countEl = $('.cam-count');
  const autoBtn = $('.cam-auto');
  const recBtn = $('.cam-rec');
  const timerEl = $('.cam-timer');

  const snapCanvas = document.createElement('canvas');
  const sctx = snapCanvas.getContext('2d');

  let stream = null;
  let mode = 'photos';
  let frames = [];
  let autoTimer = 0;
  let recorder = null;
  let recFormat = null;
  let recChunks = [];
  let recStartedAt = 0;
  let timerRaf = 0;
  let closed = false;

  // ---------- camera ----------

  async function startCamera() {
    status.textContent = 'Requesting camera…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (closed) { stopTracks(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      controls.hidden = false;
      status.textContent = '';
    } catch (err) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      status.textContent = denied
        ? 'Camera permission was blocked. Allow camera access and reopen, or use “Choose photos”.'
        : `No camera available (${err?.name ?? err}). You can still drop photos into Capture prep.`;
      segBtns.forEach((b) => (b.disabled = true));
    }
  }

  function stopTracks() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // ---------- photo burst ----------

  function updateCount() {
    countEl.textContent = `${frames.length} frame${frames.length === 1 ? '' : 's'}`;
    finishBtn.hidden = frames.length === 0 || mode !== 'photos';
  }

  function snap() {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h || frames.length >= MAX_FRAMES) {
      if (frames.length >= MAX_FRAMES) stopAuto();
      return;
    }
    snapCanvas.width = w;
    snapCanvas.height = h;
    sctx.drawImage(video, 0, 0, w, h);
    snapCanvas.toBlob((blob) => {
      if (!blob || closed) return;
      frames.push({ name: `frame_${String(frames.length + 1).padStart(4, '0')}.jpg`, blob });
      updateCount();
    }, 'image/jpeg', JPEG_QUALITY);
  }

  function startAuto() {
    if (autoTimer) return;
    autoBtn.classList.add('active');
    autoBtn.setAttribute('aria-pressed', 'true');
    autoBtn.textContent = 'Stop auto';
    autoTimer = setInterval(snap, AUTO_INTERVAL_MS);
  }
  function stopAuto() {
    if (!autoTimer) return;
    clearInterval(autoTimer);
    autoTimer = 0;
    autoBtn.classList.remove('active');
    autoBtn.setAttribute('aria-pressed', 'false');
    autoBtn.textContent = 'Auto‑snap';
  }

  async function finishPhotos() {
    if (!frames.length) return;
    stopAuto();
    finishBtn.disabled = true;
    status.textContent = `Zipping ${frames.length} frames…`;
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const f of frames) zip.file(f.name, f.blob);
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'mirage-capture.zip');
      status.textContent = `Downloaded ${frames.length} frames · run them through COLMAP or drop into Capture prep.`;
    } catch (err) {
      status.textContent = `Could not build the zip: ${err?.message ?? err}`;
    } finally {
      finishBtn.disabled = false;
    }
  }

  // ---------- video ----------

  function tickTimer() {
    if (!recorder || recorder.state !== 'recording') return;
    timerEl.textContent = `${((performance.now() - recStartedAt) / 1000).toFixed(1)}s`;
    timerRaf = requestAnimationFrame(tickTimer);
  }

  function startRec() {
    recFormat = pickRecordingFormat();
    if (!recFormat || !stream) {
      status.textContent = 'Video recording isn’t supported in this browser. Try the Photos mode.';
      return;
    }
    recChunks = [];
    recorder = new MediaRecorder(stream, { mimeType: recFormat.mimeType, videoBitsPerSecond: 12_000_000 });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
    recorder.start(200);
    recStartedAt = performance.now();
    recBtn.textContent = '■ Stop';
    recBtn.classList.add('recording');
    recDot.hidden = false;
    timerEl.hidden = false;
    status.textContent = '';
    timerRaf = requestAnimationFrame(tickTimer);
  }

  function stopRec() {
    if (!recorder || recorder.state === 'inactive') return;
    cancelAnimationFrame(timerRaf);
    const { ext, mimeType } = recFormat;
    recorder.onstop = () => {
      recBtn.textContent = '● Record';
      recBtn.classList.remove('recording');
      recDot.hidden = true;
      const blob = new Blob(recChunks, { type: mimeType.split(';')[0] });
      recChunks = [];
      recorder = null;
      if (blob.size > 0) {
        downloadBlob(blob, `mirage-capture.${ext}`);
        status.textContent = `Saved a ${ext.toUpperCase()} clip · feed it to a video-capable trainer, or extract frames for COLMAP.`;
      } else {
        status.textContent = 'Recording produced no data — try again.';
      }
    };
    recorder.stop();
  }

  // ---------- mode switching ----------

  function setMode(next) {
    if (next === mode) return;
    // leaving a mode: clean up its in-flight work
    if (mode === 'photos') stopAuto();
    if (mode === 'video' && recorder) stopRec();
    mode = next;
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === next));
    ctlPhotos.hidden = next !== 'photos';
    ctlVideo.hidden = next !== 'video';
    timerEl.hidden = true;
    updateCount();
  }

  // ---------- teardown ----------

  function close() {
    closed = true;
    stopAuto();
    cancelAnimationFrame(timerRaf);
    if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; try { recorder.stop(); } catch { /* already stopped */ } }
    stopTracks();
    frames = [];
    overlay.remove();
  }

  // ---------- events ----------

  overlay.addEventListener('click', (e) => {
    const seg = e.target.closest('.cam-seg-btn');
    if (seg && !seg.disabled) { setMode(seg.dataset.mode); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'snap') snap();
    else if (act === 'auto') (autoTimer ? stopAuto : startAuto)();
    else if (act === 'rec') (recorder ? stopRec : startRec)();
    else if (act === 'finish') finishPhotos();
    else if (act === 'close' || e.target === overlay) close();
  });

  startCamera();
  return { overlay, close };
}
