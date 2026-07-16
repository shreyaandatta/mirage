export const ICONS = {
  back: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`,
  reset: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4"/><polyline points="3 2 3 8 9 8"/></svg>`,
  camera: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  expand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  sliders: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  record: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>`,
  stop: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  download: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  path: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M7.3 6.6c5 0.8 3 5 5 8 1 1.6 2.4 2.4 4.4 2.9"/></svg>`,
  compare: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/><path d="M8 9l-2 3 2 3"/><path d="M16 9l2 3-2 3"/></svg>`,
  crop: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/></svg>`,
  xr: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4l-2-2h-4l-2 2H4a2 2 0 0 1-2-2z"/><circle cx="8" cy="11.5" r="1"/><circle cx="16" cy="11.5" r="1"/></svg>`,
  share: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>`,
  help: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12" y2="17"/></svg>`,
};

function seg(options, current) {
  return options
    .map(o => `<button data-value="${o.value}" class="${String(o.value) === String(current) ? 'on' : ''}">${o.label}</button>`)
    .join('');
}

function wireSeg(el, onChange) {
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    onChange(btn.dataset.value);
  });
}

/**
 * Viewer chrome: back/title, live stats, toolbar, settings panel, hint line.
 * Pure DOM + callbacks; owns no viewer state beyond the settings draft.
 */
export class Hud {
  /**
   * @param {HTMLElement} parent
   * @param {object} opts {
   *   sceneName, canConvert, settings: {preset, shDegree, alphaThreshold, progressive},
   *   onBack, onReset, onScreenshot, onFullscreen, onConvert, onApplySettings(settings)
   * }
   */
  constructor(parent, opts) {
    this.opts = opts;
    this.settings = { ...opts.settings };

    this.el = document.createElement('div');
    this.el.className = 'viewer-chrome';
    this.el.innerHTML = `
      <div class="chrome-top">
        <div class="chrome-left">
          <button class="icon-btn" data-act="back" title="Back to gallery (Esc)">${ICONS.back}</button>
          <div class="scene-title-chip">${opts.sceneName}</div>
        </div>
        <div class="chrome-right">
          <div class="rec-indicator"><span class="rec-dot"></span><span class="rec-time">0:00</span></div>
          <div class="stats-chip"><span><b class="fps">–</b> fps</span><span><b class="splats">–</b> splats</span></div>
        </div>
      </div>

      <div class="hint-line">Drag to orbit · Scroll to zoom · Right-drag to pan · R reset · F fullscreen · S screenshot${opts.canRecord ? ' · V record' : ''}</div>

      <div class="chrome-bottom">
        <div class="toolbar">
          <button class="icon-btn" data-act="reset" title="Reset view (R)">${ICONS.reset}</button>
          <button class="icon-btn" data-act="screenshot" title="Save screenshot (S)">${ICONS.camera}</button>
          ${opts.canRecord ? `<button class="icon-btn rec-btn" data-act="record" title="Record fly-through (V)">${ICONS.record}</button>` : ''}
          <button class="icon-btn" data-act="fullscreen" title="Fullscreen (F)">${ICONS.expand}</button>
          ${opts.canConvert ? `<div class="divider"></div><button class="icon-btn" data-act="convert" title="Convert to .ksplat (smaller, faster loads)">${ICONS.download}</button>` : ''}
          <span class="toolbar-extra"></span>
          <div class="divider"></div>
          <button class="icon-btn" data-act="settings" title="Quality settings">${ICONS.sliders}</button>
        </div>
      </div>

      <div class="settings-panel">
        <h4>Quality</h4>
        <div class="setting-row">
          <label>Preset</label>
          <div class="seg" data-setting="preset">
            ${seg([
              { value: 'performance', label: 'Perf' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'high', label: 'High' },
            ], this.settings.preset)}
          </div>
        </div>
        <div class="setting-row">
          <label>Spherical harmonics <span class="value sh-value">${this.settings.shDegree}</span></label>
          <div class="seg" data-setting="shDegree">
            ${seg([
              { value: 0, label: '0' },
              { value: 1, label: '1' },
              { value: 2, label: '2' },
            ], this.settings.shDegree)}
          </div>
          <div class="note">View-dependent color detail. Only applies to formats that carry SH data (.ply / .ksplat).</div>
        </div>
        <div class="setting-row">
          <label>Alpha removal threshold <span class="value alpha-value">${this.settings.alphaThreshold}</span></label>
          <input type="range" min="1" max="64" step="1" value="${this.settings.alphaThreshold}" data-setting="alphaThreshold" />
          <div class="note">Drops near-transparent splats at load time — higher is faster, lower keeps fine wisps.</div>
        </div>
        <div class="setting-row">
          <label>Progressive loading</label>
          <div class="seg" data-setting="progressive">
            ${seg([
              { value: true, label: 'On' },
              { value: false, label: 'Off' },
            ], this.settings.progressive)}
          </div>
        </div>
        <div class="apply-row">
          <button class="btn primary" data-act="apply">Apply · reloads scene</button>
        </div>
      </div>
    `;
    parent.appendChild(this.el);

    this.panel = this.el.querySelector('.settings-panel');
    this.fpsEl = this.el.querySelector('.fps');
    this.splatsEl = this.el.querySelector('.splats');
    this.settingsBtn = this.el.querySelector('[data-act="settings"]');
    this.recBtn = this.el.querySelector('[data-act="record"]');
    this.recIndicator = this.el.querySelector('.rec-indicator');
    this.recTime = this.el.querySelector('.rec-time');
    this.hint = this.el.querySelector('.hint-line');
    setTimeout(() => { this.hint.style.opacity = '0'; }, 7000);

    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'back') opts.onBack();
      else if (act === 'reset') opts.onReset();
      else if (act === 'screenshot') opts.onScreenshot();
      else if (act === 'record') opts.onRecordToggle?.();
      else if (act === 'fullscreen') opts.onFullscreen();
      else if (act === 'convert') opts.onConvert?.();
      else if (act === 'settings') this.toggleSettings();
      else if (act === 'apply') { this.toggleSettings(false); opts.onApplySettings({ ...this.settings }); }
    });

    wireSeg(this.el.querySelector('[data-setting="preset"]'), (v) => {
      this.settings.preset = v;
      this.opts.onPresetPicked?.(v, this);
    });
    wireSeg(this.el.querySelector('[data-setting="shDegree"]'), (v) => {
      this.settings.preset = 'custom';
      this.settings.shDegree = Number(v);
      this.el.querySelector('.sh-value').textContent = v;
    });
    wireSeg(this.el.querySelector('[data-setting="progressive"]'), (v) => {
      this.settings.progressive = v === 'true';
    });
    const alphaSlider = this.el.querySelector('[data-setting="alphaThreshold"]');
    alphaSlider.addEventListener('input', () => {
      this.settings.preset = 'custom';
      this.settings.alphaThreshold = Number(alphaSlider.value);
      this.el.querySelector('.alpha-value').textContent = alphaSlider.value;
    });
  }

  /**
   * Register an extra toolbar button (Path / Compare / Crop / XR / Share …).
   * Returns the button element so callers can toggle `.active` on it.
   * @param {object} o { icon, title, onClick, active? }
   */
  addToolbarButton({ icon, title, onClick, active = false }) {
    const btn = document.createElement('button');
    btn.className = `icon-btn${active ? ' active' : ''}`;
    btn.title = title;
    btn.innerHTML = icon;
    btn.addEventListener('click', onClick);
    this.el.querySelector('.toolbar-extra').appendChild(btn);
    return btn;
  }

  /** Mount a popover panel anchored to the viewer chrome (Path controls, etc.). */
  addPanel(el) {
    this.el.appendChild(el);
    return el;
  }

  /** Reflect a preset's derived values into the individual controls. */
  applyPresetValues({ shDegree, alphaThreshold }) {
    this.settings.shDegree = shDegree;
    this.settings.alphaThreshold = alphaThreshold;
    this.el.querySelector('.sh-value').textContent = shDegree;
    this.el.querySelector('.alpha-value').textContent = alphaThreshold;
    this.el.querySelector('[data-setting="alphaThreshold"]').value = alphaThreshold;
    this.el.querySelectorAll('[data-setting="shDegree"] button').forEach(b =>
      b.classList.toggle('on', Number(b.dataset.value) === shDegree));
  }

  toggleSettings(force) {
    const open = force ?? !this.panel.classList.contains('open');
    this.panel.classList.toggle('open', open);
    this.settingsBtn.classList.toggle('active', open);
  }

  setStats(fps, splats) {
    this.fpsEl.textContent = fps;
    this.splatsEl.textContent = splats >= 1000 ? `${(splats / 1000).toFixed(0)}k` : String(splats);
  }

  setRecording(on, elapsedSeconds = 0) {
    this.recBtn?.classList.toggle('recording', on);
    if (this.recBtn) {
      this.recBtn.innerHTML = on ? ICONS.stop : ICONS.record;
      this.recBtn.title = on ? 'Stop recording (V)' : 'Record fly-through (V)';
    }
    this.recIndicator?.classList.toggle('on', on);
    if (on && this.recTime) {
      const m = Math.floor(elapsedSeconds / 60);
      const s = Math.floor(elapsedSeconds % 60);
      this.recTime.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
  }

  destroy() {
    this.el.remove();
  }
}
