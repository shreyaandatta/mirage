/**
 * Popover for the cinematic path recorder. Pure UI — it owns no path/viewer
 * state, just emits intent via callbacks and reflects count/duration/busy back.
 */
export class PathPanel {
  constructor({ onAdd, onClear, onPreview, onRecord, onShare, onDuration, durationSec = 6 }) {
    this.el = document.createElement('div');
    this.el.className = 'path-panel';
    this.el.innerHTML = `
      <h4>Fly-through path</h4>
      <p class="path-hint">Orbit to a view, add it as a waypoint, repeat, then preview or record a smooth dolly between them.</p>
      <div class="path-count"><b class="count">0</b> waypoints</div>
      <div class="path-row">
        <button class="btn" data-p="add">Add waypoint</button>
        <button class="btn ghost" data-p="clear">Clear</button>
      </div>
      <div class="setting-row">
        <label>Duration <span class="value dur-value">${durationSec}s</span></label>
        <input type="range" min="2" max="30" step="1" value="${durationSec}" data-p="duration" />
      </div>
      <div class="path-row">
        <button class="btn" data-p="preview">Preview</button>
        <button class="btn primary" data-p="record">● Record path</button>
      </div>
      <button class="btn ghost path-share" data-p="share">Copy shareable link</button>
    `;

    this.countEl = this.el.querySelector('.count');
    this.durValue = this.el.querySelector('.dur-value');
    this.buttons = this.el.querySelectorAll('button[data-p]');

    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]');
      if (!b) return;
      const p = b.dataset.p;
      if (p === 'add') onAdd?.();
      else if (p === 'clear') onClear?.();
      else if (p === 'preview') onPreview?.();
      else if (p === 'record') onRecord?.();
      else if (p === 'share') onShare?.();
    });

    const dur = this.el.querySelector('[data-p="duration"]');
    dur.addEventListener('input', () => {
      this.durValue.textContent = `${dur.value}s`;
      onDuration?.(Number(dur.value));
    });
  }

  setCount(n) {
    this.countEl.textContent = n;
    // Preview/record/share need at least two waypoints.
    const needTwo = n < 2;
    for (const b of this.buttons) {
      if (['preview', 'record', 'share'].includes(b.dataset.p)) b.disabled = needTwo;
    }
  }

  setBusy(busy) {
    for (const b of this.buttons) b.disabled = busy;
    const rec = this.el.querySelector('[data-p="record"]');
    rec.textContent = busy ? 'Recording…' : '● Record path';
  }

  toggle(force) {
    const open = force ?? !this.el.classList.contains('open');
    this.el.classList.toggle('open', open);
    return open;
  }
}
