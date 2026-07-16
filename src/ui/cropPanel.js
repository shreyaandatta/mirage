import * as THREE from 'three';
import { computeBounds, countInBox } from '../crop.js';

const AXES = ['x', 'y', 'z'];

/**
 * Bounding-box crop panel. Shows a live wireframe box in the scene and six
 * min/max sliders; culls floaters and re-exports a tighter scene. Owns the box
 * + helper; the caller supplies the export/view actions.
 */
export class CropPanel {
  constructor(mirage, { onExport, onView, onExit }) {
    this.mirage = mirage;
    this.splatBuffer = mirage.getSplatBuffer();
    this.bounds = computeBounds(this.splatBuffer);
    this.box = this.bounds.clone();
    this.total = this.splatBuffer.getSplatCount();

    this.helper = new THREE.Box3Helper(this.box, new THREE.Color(0x8b7cf6));
    mirage.addSceneObject(this.helper);

    this.el = document.createElement('div');
    this.el.className = 'crop-panel open';
    this.el.innerHTML = `
      <h4>Crop &amp; clean up</h4>
      <p class="crop-hint">Shrink the box to cut floaters, then export a tighter scene. Re-export is base-colour (SH0).</p>
      ${AXES.map((ax) => `
        <div class="crop-axis">
          <label>${ax.toUpperCase()}</label>
          <input type="range" min="0" max="1000" value="0" data-axis="${ax}" data-end="min" />
          <input type="range" min="0" max="1000" value="1000" data-axis="${ax}" data-end="max" />
        </div>`).join('')}
      <div class="crop-count"><b class="kept">${this.total.toLocaleString()}</b> / ${this.total.toLocaleString()} splats kept</div>
      <div class="crop-actions">
        <button class="btn" data-c="reset">Reset</button>
        <button class="btn" data-c="view">View cropped</button>
      </div>
      <button class="btn primary crop-export" data-c="export">Download cropped .ksplat</button>
      <button class="btn ghost crop-exit" data-c="exit">Exit crop</button>
    `;

    this.keptEl = this.el.querySelector('.kept');

    this.el.addEventListener('input', (e) => {
      const slider = e.target.closest('input[type="range"]');
      if (slider) this._syncBox();
    });
    this.el.addEventListener('change', () => this._updateCount());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-c]');
      if (!b) return;
      const c = b.dataset.c;
      if (c === 'reset') this._reset();
      else if (c === 'view') onView?.(this.box.clone());
      else if (c === 'export') onExport?.(this.box.clone());
      else if (c === 'exit') { this.destroy(); onExit?.(); }
    });

    this._syncBox();
    this._updateCount();
  }

  _frac(axis, end) {
    const el = this.el.querySelector(`input[data-axis="${axis}"][data-end="${end}"]`);
    return Number(el.value) / 1000;
  }

  _syncBox() {
    for (const ax of AXES) {
      const lo = this.bounds.min[ax];
      const hi = this.bounds.max[ax];
      let min = lo + (hi - lo) * this._frac(ax, 'min');
      let max = lo + (hi - lo) * this._frac(ax, 'max');
      if (min > max) [min, max] = [max, min];
      this.box.min[ax] = min;
      this.box.max[ax] = max;
    }
    this.helper.box = this.box;
    this.helper.updateMatrixWorld(true);
  }

  _updateCount() {
    const kept = countInBox(this.splatBuffer, this.box);
    this.keptEl.textContent = kept.toLocaleString();
  }

  _reset() {
    this.el.querySelectorAll('input[data-end="min"]').forEach((s) => (s.value = 0));
    this.el.querySelectorAll('input[data-end="max"]').forEach((s) => (s.value = 1000));
    this._syncBox();
    this._updateCount();
  }

  destroy() {
    this.mirage.removeSceneObject(this.helper);
    this.el.remove();
  }
}
