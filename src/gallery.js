import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { isSupportedFilename } from './viewer.js';
import { looksLikeHeic } from './heicDetect.js';
import { placeholderReference } from './ui/compareSlider.js';
import { ScrollHero } from './ui/scrollHero.js';
import { librarySupported, listScenes, deleteScene } from './sceneLibrary.js';

// Bundled sample scenes. These are procedurally generated .splat files
// (see scripts/generate-scenes.mjs) so the repo stays small and the demo
// works offline — drag in a real capture (.ply/.splat/.ksplat/.spz) any time.
export const SCENES = [
  {
    id: 'nebula',
    name: 'Spiral Nebula',
    file: 'scenes/nebula.splat',
    format: GaussianSplats3D.SceneFormat.Splat,
    description: 'A two-armed spiral galaxy of ~70k gaussians — translucent dust lanes, a hot core, and a field of stars.',
    splats: '67k',
    size: '2.1 MB',
    camera: { up: [0, 1, 0], position: [0.5, 3.4, 5.6], lookAt: [0, 0, 0] },
    thumb: 'radial-gradient(ellipse 70% 60% at 50% 45%, #f5d0fe 0%, #a855f7 28%, #4338ca 60%, #0b0b1a 100%)',
    // Demo the photo-vs-splat slider with a labeled placeholder reference.
    // Swap `image` for a real capture photo + matching `pose` for a real scene.
    compare: {
      image: placeholderReference('#1a1a2e', 'Swap in your capture’s photo here'),
      pose: { position: [0.5, 3.4, 5.6], target: [0, 0, 0] },
    },
  },
  {
    id: 'bonsai',
    name: 'Bonsai',
    file: 'scenes/bonsai.splat',
    format: GaussianSplats3D.SceneFormat.Splat,
    description: 'A little tree in a clay pot — layered canopy puffs, blossom accents, and petals drifting to the moss.',
    splats: '53k',
    size: '1.6 MB',
    camera: { up: [0, 1, 0], position: [2.4, 1.7, 2.8], lookAt: [0, 0.85, 0] },
    thumb: 'radial-gradient(ellipse 75% 65% at 45% 40%, #bbf7d0 0%, #22c55e 30%, #14532d 62%, #0b120b 100%)',
  },
  {
    id: 'aurora',
    name: 'Aurora Ridge',
    file: 'scenes/aurora.splat',
    format: GaussianSplats3D.SceneFormat.Splat,
    description: 'Curtains of aurora — tall, anisotropic gaussians — shimmering over a snow-covered mountain ridge at night.',
    splats: '73k',
    size: '2.2 MB',
    camera: { up: [0, 1, 0], position: [0, 4.4, 10.8], lookAt: [0, 1.2, -1.5] },
    thumb: 'linear-gradient(180deg, #052e16 0%, #10b981 30%, #155e75 55%, #1e1b4b 78%, #e0e7ff 100%)',
  },
];

const UPLOAD_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
const PHOTO_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

/**
 * Render the landing gallery into `container`.
 * @param {HTMLElement} container
 * @param {object} handlers { onOpenScene(scene), onOpenFile(file) }
 */
export function renderGallery(container, { onOpenScene, onOpenFile, onConvertPhotos, onOpenGuide, onStartTour }) {
  container.innerHTML = `
    <div class="gallery">
      <div class="hero-mount"></div>
      <div class="gallery-inner">
        <header class="hero compact">
          <div class="wordmark">
            <div class="orb"></div><h1>Mirage</h1>
            <button class="tour-replay" id="start-tour" title="Take the tour">?</button>
          </div>
          <p class="sub">Real-time 3D Gaussian Splatting — photorealistic radiance-field scenes
          rendered at interactive frame rates with WebGL. Pick a sample below, or drop in your own capture.</p>
        </header>

        <div class="section-label">Sample scenes</div>
        <div class="scene-grid" data-tour="scenes"></div>

        <div class="section-label library-label" id="library-label" hidden>Your library</div>
        <div class="scene-grid" id="library-grid"></div>

        <div class="section-row">
          <div class="section-label">Your capture</div>
          <button class="link-btn" id="open-guide">How to capture your own →</button>
        </div>
        <div class="dropzone" data-tour="upload">
          <div class="dz-icon">${UPLOAD_ICON}</div>
          <div class="dz-text">
            <strong>Drop a splat file anywhere on this page</strong>
            <span>Supports <code>.ply</code> · <code>.splat</code> · <code>.ksplat</code> · <code>.spz</code> —
            processed entirely in your browser, nothing is uploaded.</span>
          </div>
          <button class="btn primary" id="pick-file">Choose file</button>
          <input type="file" id="file-input" accept=".ply,.splat,.ksplat,.spz" hidden />
        </div>

        <div class="section-label" style="margin-top:40px">Capture prep</div>
        <div class="dropzone" data-tour="prep">
          <div class="dz-icon">${PHOTO_ICON}</div>
          <div class="dz-text">
            <strong>Shot your capture on an iPhone? Convert HEIC → JPG</strong>
            <span>COLMAP and most splatting trainers want <code>.jpg</code>, not <code>.heic</code>.
            Drop your photos here to batch-convert them locally — download a zip and feed it to the pipeline.</span>
          </div>
          <button class="btn" id="pick-photos">Choose photos</button>
          <input type="file" id="photo-input" accept=".heic,.heif,image/heic,image/heif" multiple hidden />
        </div>
      </div>
      <footer class="gallery-footer">
        Built with <a href="https://github.com/mkkellogg/GaussianSplats3D" target="_blank" rel="noreferrer">GaussianSplats3D</a>
        + Three.js · <button class="link-btn inline" id="open-guide-footer">How to capture your own scene</button>
      </footer>
    </div>
  `;

  const grid = container.querySelector('.scene-grid');
  for (const scene of SCENES) {
    const card = document.createElement('button');
    card.className = 'scene-card';
    card.innerHTML = `
      <div class="scene-thumb" style="background:${scene.thumb}"></div>
      <div class="body">
        <h3>${scene.name}</h3>
        <p>${scene.description}</p>
        <div class="meta"><span>${scene.splats} splats</span><span>${scene.size}</span><span>.splat</span></div>
      </div>
    `;
    card.addEventListener('click', () => onOpenScene(scene));
    grid.appendChild(card);
  }

  const input = container.querySelector('#file-input');
  container.querySelector('#pick-file').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files?.[0]) onOpenFile(input.files[0]);
    input.value = '';
  });

  const photoInput = container.querySelector('#photo-input');
  container.querySelector('#pick-photos').addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    if (photoInput.files?.length) onConvertPhotos(photoInput.files);
    photoInput.value = '';
  });

  container.querySelectorAll('#open-guide, #open-guide-footer').forEach(
    el => el.addEventListener('click', () => onOpenGuide?.()));

  container.querySelector('#start-tour')?.addEventListener('click', () => onStartTour?.());

  renderLibrarySection(container);

  // Scroll-scrubbed hero: 120 frames of a dolly into a particle nebula —
  // scrolling flies you into the cloud while the story fades through.
  const hero = new ScrollHero(container.querySelector('.hero-mount'), {
    frameCount: 120,
    frameUrl: (i) => `${import.meta.env.BASE_URL}hero/${String(i).padStart(3, '0')}.webp`,
    stages: HERO_STAGES,
    onAction: (act) => {
      if (act === 'explore') container.querySelector('.gallery-inner')?.scrollIntoView({ behavior: 'smooth' });
      else if (act === 'guide') onOpenGuide?.();
    },
  });
  return hero;
}

const HERO_STAGES = [
  {
    from: -0.05, to: 0.2, // negative start ⇒ fully visible at the top of the page
    html: `<h1 class="sh-word">MIRAGE</h1>
           <p class="sh-sub">Capture reality with a phone.<br>Walk through it in your browser.</p>`,
  },
  {
    from: 0.28, to: 0.5,
    html: `<h2>Not polygons.<br><em>A hundred thousand points of light.</em></h2>
           <p class="sh-sub">Every scene is a cloud of gaussians — translucent, glowing primitives,
           sorted and blended in real time.</p>`,
  },
  {
    from: 0.56, to: 0.76,
    html: `<h2>Rendered live,<br><em>right in your browser.</em></h2>
           <p class="sh-sub">Pure WebGL. No install, no upload — your captures never leave your machine.</p>`,
  },
  {
    from: 0.84, to: 1, hold: 'end', interactive: true,
    html: `<h2>Step inside.</h2>
           <div class="sh-actions">
             <button class="btn primary" data-act="explore">Explore the gallery</button>
             <button class="btn sh-ghost" data-act="guide">Capture your own →</button>
           </div>`,
  },
];

const LIB_THUMB = 'radial-gradient(ellipse 70% 60% at 50% 45%, #7dd3fc 0%, #0ea5e9 30%, #1e3a5f 65%, #0a0f1a 100%)';

function formatSize(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// "Your library" — captures saved to IndexedDB by openLocalFile. Rendered
// asynchronously after the main gallery so an empty/blocked store costs
// nothing; each card opens its persistent #/lib/<id> URL.
async function renderLibrarySection(container) {
  if (!librarySupported()) return;
  let scenes = [];
  try {
    scenes = await listScenes();
  } catch { return; }
  const label = container.querySelector('#library-label');
  const grid = container.querySelector('#library-grid');
  if (!label || !grid || !scenes.length) return; // navigated away, or empty

  label.hidden = false;
  grid.replaceChildren();
  for (const scene of scenes) {
    const card = document.createElement('div');
    card.className = 'scene-card lib-card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="scene-thumb" style="background:${LIB_THUMB}"></div>
      <div class="body">
        <h3></h3>
        <p>Saved ${new Date(scene.addedAt).toLocaleDateString()} · stays on this device</p>
        <div class="meta"><span>${formatSize(scene.size)}</span><span>.${scene.name.split('.').pop().toLowerCase()}</span></div>
      </div>
      <button class="lib-delete" title="Remove from library" aria-label="Remove ${scene.name} from library">✕</button>
    `;
    card.querySelector('h3').textContent = scene.name;
    const open = () => { location.hash = `#/lib/${scene.id}`; };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    card.querySelector('.lib-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await deleteScene(scene.id); } catch { /* already gone */ }
      card.remove();
      if (!grid.children.length) label.hidden = true;
    });
    grid.appendChild(card);
  }
}

/**
 * Page-wide drag & drop. Installed once; active on both gallery and viewer
 * so a new capture can be dropped straight onto a running scene.
 */
export function installDragAndDrop({ onOpenFile, onConvertPhotos, onReject }) {
  let depth = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++depth === 1) document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;

    // HEIC photos → batch converter (handles single or many).
    const heics = files.filter(looksLikeHeic);
    if (heics.length) { onConvertPhotos(heics); return; }

    const file = files[0];
    if (!isSupportedFilename(file.name)) {
      onReject(`"${file.name}" isn't a splat file — try .ply, .splat, .ksplat, or .spz (or drop .heic photos to convert them).`);
      return;
    }
    onOpenFile(file);
  });

  const veil = document.createElement('div');
  veil.className = 'drag-veil';
  veil.textContent = 'Drop to open scene';
  document.body.appendChild(veil);
}
