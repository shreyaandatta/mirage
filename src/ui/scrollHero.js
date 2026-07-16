/**
 * Scroll-scrubbed image-sequence hero (the classic "Apple product page"
 * technique). A tall scroll section pins a full-viewport canvas; scrolling
 * scrubs through a pre-rendered frame sequence while staged copy fades in and
 * out at set progress windows.
 *
 * Engineering notes:
 * - Frames draw cover-fit at devicePixelRatio (capped at 2), so the same
 *   portrait source works in landscape and portrait viewports; a ResizeObserver
 *   re-rasterizes on resize/orientation change.
 * - Frames load progressively (stride 8 → 4 → 2 → 1, concurrency-limited), and
 *   the scrubber draws the nearest *loaded* frame, so the hero is interactive
 *   after ~15 keyframes (~400 KB) while the rest stream in.
 * - The frame index is eased toward the scroll target each rAF for a fluid,
 *   momentum-like scrub; we only re-draw when the rounded frame changes.
 * - `prefers-reduced-motion` collapses the section to a single static screen.
 */

const DPR_CAP = 2;
const EASE = 0.22;
const RAMP = 0.05; // stage fade in/out width, in progress units

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class ScrollHero {
  /**
   * @param {HTMLElement} mount
   * @param {object} opts {
   *   frameCount, frameUrl(i),
   *   stages: [{ html, from, to, hold?, interactive? }],
   *   onAction(name)   — clicks on [data-act] inside stages
   * }
   */
  constructor(mount, { frameCount, frameUrl, stages, onAction }) {
    this.frameCount = frameCount;
    this.frameUrl = frameUrl;
    this.stages = stages;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.images = new Array(frameCount).fill(null);
    this.current = 0;          // eased frame position
    this.drawnFrame = -1;
    this.raf = 0;
    this.running = false;
    this.destroyed = false;

    this.root = document.createElement('section');
    this.root.className = `scroll-hero${this.reduced ? ' sh-static' : ''}`;
    this.root.innerHTML = `
      <div class="sh-sticky">
        <canvas class="sh-canvas" aria-hidden="true"></canvas>
        <div class="sh-vignette"></div>
        <div class="sh-dim"></div>
        ${stages.map((s, i) => `<div class="sh-stage${s.interactive ? ' interactive' : ''}" data-stage="${i}">${s.html}</div>`).join('')}
        <div class="sh-cue"><span>Scroll</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
    `;
    mount.appendChild(this.root);

    this.sticky = this.root.querySelector('.sh-sticky');
    this.canvas = this.root.querySelector('.sh-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.dim = this.root.querySelector('.sh-dim');
    this.cue = this.root.querySelector('.sh-cue');
    this.stageEls = [...this.root.querySelectorAll('.sh-stage')];

    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) onAction?.(btn.dataset.act);
    });

    this._resize();
    this.ro = new ResizeObserver(() => { this._resize(); this._draw(true); });
    this.ro.observe(this.sticky);

    if (this.reduced) {
      // Static: one screen, mid-sequence frame, first + last stage shown by CSS.
      this._load(Math.round(frameCount * 0.4)).then(() => this._draw(true));
      this._loadSequence([0]);
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

    this._loadSequence(this._priorityOrder());
  }

  // ---------- frame loading ----------

  _priorityOrder() {
    const seen = new Set();
    const order = [];
    for (const stride of [8, 4, 2, 1]) {
      for (let i = 0; i < this.frameCount; i += stride) {
        if (!seen.has(i)) { seen.add(i); order.push(i); }
      }
    }
    if (!seen.has(this.frameCount - 1)) order.push(this.frameCount - 1);
    return order;
  }

  _load(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { this.images[i] = img; resolve(true); };
      img.onerror = () => resolve(false);
      img.src = this.frameUrl(i);
    });
  }

  async _loadSequence(order, concurrency = 6) {
    let cursor = 0;
    const worker = async () => {
      while (cursor < order.length && !this.destroyed) {
        const i = order[cursor++];
        await this._load(i);
        // A closer frame may now exist for the current scrub position.
        if (Math.abs(i - this.current) < 10) this._draw();
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    this._draw(true);
  }

  _nearestLoaded(target) {
    const t = Math.round(target);
    if (this.images[t]) return t;
    for (let d = 1; d < this.frameCount; d++) {
      if (this.images[t - d]) return t - d;
      if (this.images[t + d]) return t + d;
    }
    return -1;
  }

  // ---------- drawing ----------

  _resize() {
    const rect = this.sticky.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingQuality = 'high';
    this.drawnFrame = -1; // force redraw at new size
  }

  _draw(force = false) {
    const idx = this._nearestLoaded(this.current);
    if (idx < 0) return;
    if (!force && idx === this.drawnFrame) return;
    const img = this.images[idx];
    const { cssW: w, cssH: h } = this;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    this.drawnFrame = idx;
  }

  // ---------- scrub loop ----------

  progress() {
    const r = this.root.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    if (span <= 0) return 0;
    return clamp01(-r.top / span);
  }

  _wake() {
    if (this.running || this.reduced || this.destroyed) return;
    this.running = true;
    this.raf = requestAnimationFrame(this._tick);
  }

  _tick = () => {
    if (this.destroyed) return;
    const p = this.progress();
    const target = p * (this.frameCount - 1);
    // Snap when the tab can't animate (hidden) so state never lags reality.
    this.current = document.hidden
      ? target
      : this.current + (target - this.current) * EASE;
    if (Math.abs(target - this.current) < 0.05) this.current = target;
    this._draw();
    this._applyStages(p);

    const settled = this.current === target;
    if (this.visible || !settled) {
      this.raf = requestAnimationFrame(this._tick);
    } else {
      this.running = false;
    }
  };

  /** Force a synchronous update (used by tests / non-rAF environments). */
  update() {
    const p = this.progress();
    this.current = p * (this.frameCount - 1);
    this._draw(true);
    this._applyStages(p);
    return p;
  }

  _stageAlpha(stage, p) {
    const aIn = clamp01((p - stage.from) / RAMP);
    const aOut = stage.hold === 'end' ? 1 : clamp01((stage.to - p) / RAMP);
    return Math.min(aIn, aOut);
  }

  _applyStages(p) {
    this.stages.forEach((stage, i) => {
      const a = this._stageAlpha(stage, p);
      const el = this.stageEls[i];
      el.style.opacity = a.toFixed(3);
      el.style.transform = `translateY(${((1 - a) * 22).toFixed(1)}px)`;
      el.style.pointerEvents = stage.interactive && a > 0.5 ? 'auto' : 'none';
    });
    this.cue.style.opacity = clamp01(1 - p / 0.06).toFixed(3);
    // Gently dim the busy final frames so the CTA stays legible.
    this.dim.style.opacity = (clamp01((p - 0.8) / 0.2) * 0.45).toFixed(3);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('scroll', this._onScroll ?? (() => {}));
    this.io?.disconnect();
    this.ro?.disconnect();
    this.root.remove();
  }
}
