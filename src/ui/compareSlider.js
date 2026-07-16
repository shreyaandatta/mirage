/**
 * Photo-vs-splat comparison. Overlays a reference image over the live splat
 * canvas and reveals it up to a draggable vertical divider (reference on the
 * left, rendered splat on the right). Controls stay live so you can orbit the
 * splat to line it up with the reference by eye.
 */
export class CompareSlider {
  constructor(host, imageUrl, { onClose } = {}) {
    this.host = host;
    this.onClose = onClose;
    this.split = 0.5;

    this.el = document.createElement('div');
    this.el.className = 'compare-overlay';
    this.el.innerHTML = `
      <div class="compare-ref"></div>
      <div class="compare-divider"><div class="compare-handle"></div></div>
      <span class="compare-label lbl-photo">Reference</span>
      <span class="compare-label lbl-splat">Splat</span>
      <button class="btn compare-exit">Exit compare</button>
    `;
    host.appendChild(this.el);

    this.ref = this.el.querySelector('.compare-ref');
    this.divider = this.el.querySelector('.compare-divider');
    this.ref.style.backgroundImage = `url("${imageUrl}")`;

    this._apply();

    this._onPointerMove = (e) => {
      const rect = this.el.getBoundingClientRect();
      if (!rect.width) return; // container not laid out yet
      this.split = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      this._apply();
    };
    this._onPointerUp = () => {
      window.removeEventListener('pointermove', this._onPointerMove);
      window.removeEventListener('pointerup', this._onPointerUp);
    };
    this.divider.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      window.addEventListener('pointermove', this._onPointerMove);
      window.addEventListener('pointerup', this._onPointerUp);
    });

    this.el.querySelector('.compare-exit').addEventListener('click', () => this.destroy());
  }

  _apply() {
    const pct = this.split * 100;
    // Reveal the reference only left of the divider.
    this.ref.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    this.divider.style.left = `${pct}%`;
  }

  destroy() {
    this._onPointerUp?.();
    this.el.remove();
    this.onClose?.();
  }
}

// A self-documenting placeholder reference so a sample scene can demo the slider
// with one click; real captures pass their own photo. `bg` matches the scene thumb.
export function placeholderReference(bg, label = 'Your reference photo goes here') {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1600'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='#1a1a2e'/><stop offset='1' stop-color='#0a0a12'/>
    </linearGradient></defs>
    <rect width='1200' height='1600' fill='url(#g)'/>
    <rect x='40' y='40' width='1120' height='1520' fill='none' stroke='#8b7cf6' stroke-width='3' stroke-dasharray='16 12' opacity='0.5'/>
    <text x='600' y='790' fill='#9b9bb0' font-family='sans-serif' font-size='46' text-anchor='middle'>Reference photo</text>
    <text x='600' y='850' fill='#62627a' font-family='sans-serif' font-size='30' text-anchor='middle'>${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
