// Illustrated "how to capture your own scene" guide, shown as a modal over the
// gallery. Content mirrors README §capture but in a scannable do/don't form.

const CHECK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const CROSS = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const DOS = [
  'Orbit the subject slowly — 60–200 photos or a steady video.',
  'Even, diffuse light; keep the subject filling the frame.',
  'Overlap each shot ~70% so features match across views.',
  'On iPhone, convert .HEIC → .JPG here before running COLMAP.',
];

const DONTS = [
  'Reflective, transparent, or shiny surfaces — they don’t reconstruct.',
  'Moving subjects or changing light between shots.',
  'Blank, featureless walls with nothing to track.',
  'Motion blur — hold steady or shoot more, slower frames.',
];

const STEPS = [
  ['Capture', '60–200 photos or a slow video orbiting your subject.'],
  ['Reconstruct', 'Run COLMAP + a splatting trainer (Inria / nerfstudio / Brush), or use Luma / Polycam with no GPU.'],
  ['Convert', 'You get a .ply — drop it into Mirage and hit “convert to .ksplat” for fast loads.'],
  ['Explore', 'Orbit, record an MP4 fly-through, and share a link to any view.'],
];

export function openCaptureGuide() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal guide-modal">
      <h3>Capture your own scene</h3>
      <p class="modal-sub">Gaussian splats are reconstructed offline from photos, then explored here. Here’s the loop.</p>

      <ol class="guide-steps">
        ${STEPS.map(([t, d], i) => `<li><span class="step-n">${i + 1}</span><div><b>${t}</b><span>${d}</span></div></li>`).join('')}
      </ol>

      <div class="guide-cols">
        <div class="guide-col do">
          <h5>Do</h5>
          ${DOS.map(d => `<div class="guide-item"><span class="mark">${CHECK}</span>${d}</div>`).join('')}
        </div>
        <div class="guide-col dont">
          <h5>Avoid</h5>
          ${DONTS.map(d => `<div class="guide-item"><span class="mark">${CROSS}</span>${d}</div>`).join('')}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn primary" data-act="close">Got it</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-act="close"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}
