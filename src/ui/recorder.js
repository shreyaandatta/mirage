// Candidate container/codec combos, best-first. The user asked for MP4, so we
// prefer it where the browser's MediaRecorder can produce it (Safari, recent
// Chrome), and fall back to WebM (universally supported) otherwise.
const CANDIDATES = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { mimeType: 'video/mp4', ext: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
  { mimeType: 'video/webm', ext: 'webm' },
];

function pickFormat() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const c of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return null;
}

export function recordingSupported() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && pickFormat() !== null;
}

/**
 * Records a canvas element to a video file via MediaRecorder. One recording at
 * a time; the caller drives start/stop and receives a Blob to download.
 */
export class SceneRecorder {
  constructor(canvas, { fps = 60 } = {}) {
    this.canvas = canvas;
    this.fps = fps;
    this.recorder = null;
    this.chunks = [];
    this.format = null;
    this.startedAt = 0;
    this.track = null;
    this.pumpRaf = 0;
  }

  get isRecording() {
    return this.recorder?.state === 'recording';
  }

  /** @returns {boolean} true if recording actually started */
  start() {
    if (this.isRecording) return true;
    this.format = pickFormat();
    if (!this.format || !this.canvas.captureStream) return false;

    // A WebGL canvas only feeds the encoder when the compositor pushes a frame,
    // which stalls whenever the tab is backgrounded. Where the browser supports
    // it, drive capture manually: captureStream(0) + requestFrame() on each
    // animation frame, so frames track the render loop exactly. Fall back to
    // auto fps-based capture (e.g. Safari without requestFrame).
    const stream = this.canvas.captureStream(0);
    this.track = stream.getVideoTracks()[0];
    const canPump = typeof this.track?.requestFrame === 'function';
    const activeStream = canPump ? stream : this.canvas.captureStream(this.fps);

    this.chunks = [];
    this.recorder = new MediaRecorder(activeStream, {
      mimeType: this.format.mimeType,
      videoBitsPerSecond: 12_000_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(200); // gather data in 200ms slices
    this.startedAt = performance.now();

    if (canPump) {
      const pump = () => {
        if (!this.isRecording) return;
        this.track.requestFrame();
        this.pumpRaf = requestAnimationFrame(pump);
      };
      this.pumpRaf = requestAnimationFrame(pump);
    }
    return true;
  }

  _stopPump() {
    if (this.pumpRaf) cancelAnimationFrame(this.pumpRaf);
    this.pumpRaf = 0;
  }

  elapsedSeconds() {
    return this.isRecording ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  /**
   * Stop and finalize.
   * @returns {Promise<{blob: Blob, ext: string, mimeType: string}|null>}
   */
  stop() {
    this._stopPump();
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      const { ext, mimeType } = this.format;
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType.split(';')[0] });
        this.chunks = [];
        this.recorder = null;
        this.track = null;
        resolve(blob.size > 0 ? { blob, ext, mimeType } : null);
      };
      this.recorder.stop();
    });
  }

  /** Abort without producing a file (used during teardown). */
  cancel() {
    this._stopPump();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      try { this.recorder.stop(); } catch { /* already stopped */ }
    }
    this.recorder = null;
    this.chunks = [];
    this.track = null;
  }
}
