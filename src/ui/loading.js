/** Progressive-load overlay: orb, scene name, progress bar, phase label. */
export class LoadingOverlay {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'load-overlay hidden';
    this.el.innerHTML = `
      <div class="load-orb"></div>
      <div class="load-scene-name"></div>
      <div class="load-bar-track"><div class="load-bar-fill"></div></div>
      <div class="load-phase"></div>
    `;
    parent.appendChild(this.el);
    this.name = this.el.querySelector('.load-scene-name');
    this.fill = this.el.querySelector('.load-bar-fill');
    this.phase = this.el.querySelector('.load-phase');
  }

  show(sceneName) {
    this.name.textContent = sceneName;
    this.fill.style.width = '0%';
    this.el.classList.remove('indeterminate');
    this.phase.textContent = 'Starting…';
    this.el.classList.remove('hidden');
  }

  update(pct, label, phase) {
    if (Number.isFinite(pct)) {
      this.el.classList.remove('indeterminate');
      this.fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    } else if (phase === 'Downloading') {
      // No Content-Length (CDNs drop it on compressed responses) — the bytes
      // are flowing but no percentage exists, so shimmer instead of sitting
      // frozen at 0%, which reads as a hang.
      this.el.classList.add('indeterminate');
    }
    this.phase.textContent = Number.isFinite(pct) && label ? `${phase} · ${label}` : phase;
    // Once splats are streaming in, let the user see them behind the overlay.
    if (phase === 'Processing' || (phase === 'Downloading' && (pct > 30 || !Number.isFinite(pct)))) {
      this.el.style.background = 'transparent';
      this.el.style.backdropFilter = 'none';
    }
  }

  hide() {
    this.el.classList.add('hidden');
    // Restore the dimmed backdrop for the next load.
    setTimeout(() => {
      this.el.style.background = '';
      this.el.style.backdropFilter = '';
    }, 400);
  }
}
