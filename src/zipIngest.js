/**
 * Zip ingestion for drag & drop / file picking. A dropped .zip usually means
 * one of two things:
 *  - a splat scene that came down zipped (Luma / Polycam exports, or a
 *    friend zipping a big .ply) → extract it and open it like any capture;
 *  - a set of capture photos (e.g. Mirage's own "Capture live" burst) →
 *    those are *training input* for the offline reconstruction pipeline,
 *    not something a browser can turn into a scene — route to the guide
 *    instead of failing silently.
 * jszip is imported lazily so zip support never touches the initial bundle
 * (it shares the chunk the HEIC converter already uses).
 */

import { isSupportedFilename } from './viewer.js';

const IMAGE_RE = /\.(jpe?g|png|heic|heif|webp)$/i;
const basename = (path) => path.split('/').pop();

/** True when the filename says zip (drag & drop gives no reliable MIME). */
export const looksLikeZip = (name) => /\.zip$/i.test(name ?? '');

/**
 * Inspect a zip and pull out the most useful thing inside.
 * @param {File|Blob} file
 * @returns {Promise<
 *   | { kind: 'splat', file: File }
 *   | { kind: 'photos', count: number }
 *   | { kind: 'unknown' }
 * >}
 */
export async function ingestZip(file) {
  const { default: JSZip } = await import('jszip');
  // Feed jszip an ArrayBuffer: universally supported, and jsdom Blobs (tests)
  // aren't recognized by its type sniffing.
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && !f.name.startsWith('__MACOSX/') && !basename(f.name).startsWith('.'),
  );

  const splats = entries.filter((f) => isSupportedFilename(f.name));
  if (splats.length) {
    // Exports often pair the scene with small metadata files — take the
    // largest candidate. (uncompressedSize is jszip-internal; if it ever
    // disappears we just fall back to the first entry.)
    const pick = splats.reduce((best, f) =>
      (f._data?.uncompressedSize ?? 0) > (best._data?.uncompressedSize ?? 0) ? f : best);
    const blob = await pick.async('blob');
    return { kind: 'splat', file: new File([blob], basename(pick.name)) };
  }

  const photos = entries.filter((f) => IMAGE_RE.test(f.name));
  if (photos.length) return { kind: 'photos', count: photos.length };

  return { kind: 'unknown' };
}
