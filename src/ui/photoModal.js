/**
 * Modal that runs a HEIC→JPG batch conversion with a progress bar and offers
 * the result as a download (zip for multiple images, single .jpg for one).
 *
 * The converter (libheif + jszip, ~1 MB) is imported dynamically so it only
 * downloads when a user actually converts photos — keeping the app's initial
 * load small.
 */
export function openPhotoConverter(files) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Converting photos to JPG</h3>
      <p class="modal-sub">HEIC → JPG for the reconstruction pipeline. Everything runs locally.</p>
      <div class="load-bar-track"><div class="load-bar-fill"></div></div>
      <div class="modal-status">Preparing…</div>
      <div class="modal-actions"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const fill = overlay.querySelector('.load-bar-fill');
  const status = overlay.querySelector('.modal-status');
  const actions = overlay.querySelector('.modal-actions');

  const close = () => overlay.remove();

  status.textContent = 'Loading converter…';
  import('../convertImages.js').then(({ convertHeicFiles }) => convertHeicFiles(files, {
    quality: 0.9,
    onProgress: (done, total, name) => {
      fill.style.width = `${total ? (done / total) * 100 : 0}%`;
      status.textContent = `Converting ${done}/${total} — ${name}`;
    },
  })).then(({ items, zipBlob, converted, skipped, failed }) => {
    fill.style.width = '100%';

    if (converted === 0) {
      status.textContent = skipped
        ? 'No HEIC images found in that selection.'
        : 'Conversion failed — those files could not be decoded.';
      actions.innerHTML = `<button class="btn" data-act="close">Close</button>`;
      actions.querySelector('[data-act="close"]').addEventListener('click', close);
      return;
    }

    const parts = [`${converted} image${converted > 1 ? 's' : ''} converted`];
    if (skipped) parts.push(`${skipped} skipped`);
    if (failed.length) parts.push(`${failed.length} failed`);
    status.textContent = parts.join(' · ');

    const download = zipBlob
      ? { blob: zipBlob, name: 'mirage-photos.zip' }
      : { blob: items[0].blob, name: items[0].name };

    actions.innerHTML = `
      <button class="btn primary" data-act="download">Download ${zipBlob ? '.zip' : '.jpg'}</button>
      <button class="btn" data-act="close">Close</button>
    `;
    actions.querySelector('[data-act="download"]').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(download.blob);
      a.download = download.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    });
    actions.querySelector('[data-act="close"]').addEventListener('click', close);
  }).catch((err) => {
    console.error('Photo conversion error:', err);
    status.textContent = `Conversion error: ${err?.message ?? err}`;
    actions.innerHTML = `<button class="btn" data-act="close">Close</button>`;
    actions.querySelector('[data-act="close"]').addEventListener('click', close);
  });

  return overlay;
}
