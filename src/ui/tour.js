// Dependency-free guided tour. Each step spotlights a `data-tour` anchor with a
// tooltip; steps can navigate between pages and wait for their anchor to appear.
// Degrades to a centered card when a target is missing or not yet laid out.

const DONE_KEY = 'mirage-tour-done-v1';

const waitFor = (selector, timeout = 4000) => new Promise((resolve) => {
  const found = document.querySelector(selector);
  if (found) return resolve(found);
  const started = Date.now();
  const iv = setInterval(() => {
    const el = document.querySelector(selector);
    if (el || Date.now() - started > timeout) { clearInterval(iv); resolve(el); }
  }, 120);
});

export function tourWasSeen() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* ignore */ }
}

/**
 * @param {Array} steps  each { selector?, title, body, navigate?(), waitFor?, padding? }
 * @param {object} opts  { onDone? }
 */
export function runTour(steps, { onDone } = {}) {
  let i = 0;

  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  overlay.innerHTML = `
    <div class="tour-spot"></div>
    <div class="tour-card">
      <div class="tour-count"></div>
      <h4></h4>
      <p></p>
      <div class="tour-actions">
        <button class="btn ghost tour-skip">Skip</button>
        <div class="tour-nav">
          <button class="btn ghost tour-back">Back</button>
          <button class="btn primary tour-next">Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const spot = overlay.querySelector('.tour-spot');
  const card = overlay.querySelector('.tour-card');
  const countEl = overlay.querySelector('.tour-count');
  const titleEl = overlay.querySelector('h4');
  const bodyEl = overlay.querySelector('p');
  const backBtn = overlay.querySelector('.tour-back');
  const nextBtn = overlay.querySelector('.tour-next');

  overlay.querySelector('.tour-skip').addEventListener('click', finish);
  backBtn.addEventListener('click', () => { if (i > 0) { i--; render(); } });
  nextBtn.addEventListener('click', () => { if (i < steps.length - 1) { i++; render(); } else finish(); });

  function positionFor(target, padding = 8) {
    const rect = target?.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      // No usable geometry — dim everything and center the card.
      spot.style.opacity = '0';
      card.classList.add('centered');
      return;
    }
    spot.style.opacity = '1';
    card.classList.remove('centered');
    spot.style.left = `${rect.left - padding}px`;
    spot.style.top = `${rect.top - padding}px`;
    spot.style.width = `${rect.width + padding * 2}px`;
    spot.style.height = `${rect.height + padding * 2}px`;
    // Prefer below the target, flip above if it would overflow.
    const below = rect.bottom + 16;
    const wantAbove = below + 160 > window.innerHeight;
    card.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - 360))}px`;
    card.style.top = wantAbove ? `${Math.max(16, rect.top - 16)}px` : `${below}px`;
    card.style.transform = wantAbove ? 'translateY(-100%)' : 'none';
  }

  async function render() {
    const step = steps[i];
    if (step.navigate) step.navigate();
    let target = null;
    if (step.selector) {
      target = step.waitFor === false
        ? document.querySelector(step.selector)
        : await waitFor(step.selector);
      // Anchors can sit far down the page (e.g. below the scroll hero) —
      // bring them into view before measuring the spotlight rect.
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
        await new Promise((r) => setTimeout(r, 30));
      }
    }
    countEl.textContent = `${i + 1} / ${steps.length}`;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = i === steps.length - 1 ? 'Done' : 'Next';
    positionFor(target, step.padding);
  }

  function finish() {
    markSeen();
    overlay.remove();
    window.removeEventListener('resize', onResize);
    onDone?.();
  }

  const onResize = () => { if (steps[i]?.selector) positionFor(document.querySelector(steps[i].selector), steps[i].padding); };
  window.addEventListener('resize', onResize);

  render();
  return { finish };
}
