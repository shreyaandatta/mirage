import { heicTo, isHeic } from 'heic-to';
import JSZip from 'jszip';
import { HEIC_EXT } from './heicDetect.js';

function outName(name) {
  return name.replace(HEIC_EXT, '') + '.jpg';
}

/**
 * Convert a batch of HEIC/HEIF files to JPEG in the browser. iPhones shoot HEIC,
 * but COLMAP and most Gaussian-splatting trainers want JPG/PNG — this preps a
 * capture folder without anything leaving the machine.
 *
 * @param {File[]} files
 * @param {object} opts { quality=0.9, onProgress(done, total, currentName) }
 * @returns {Promise<{
 *   items: {name: string, blob: Blob}[],
 *   zipBlob: Blob|null,   // present when >1 image converted
 *   converted: number, skipped: number, failed: string[]
 * }>}
 */
export async function convertHeicFiles(files, { quality = 0.9, onProgress } = {}) {
  const list = Array.from(files);
  const items = [];
  const failed = [];
  let skipped = 0;
  let done = 0;

  for (const file of list) {
    onProgress?.(done, list.length, file.name);
    try {
      // Confirm by content, not just extension — skip anything that isn't HEIC.
      if (!(await isHeic(file))) { skipped++; done++; continue; }
      const blob = await heicTo({ blob: file, type: 'image/jpeg', quality });
      items.push({ name: outName(file.name), blob });
    } catch (err) {
      console.error(`HEIC conversion failed for ${file.name}:`, err);
      failed.push(file.name);
    }
    done++;
    onProgress?.(done, list.length, file.name);
  }

  let zipBlob = null;
  if (items.length > 1) {
    const zip = new JSZip();
    for (const { name, blob } of items) zip.file(name, blob);
    zipBlob = await zip.generateAsync({ type: 'blob' });
  }

  return { items, zipBlob, converted: items.length, skipped, failed };
}
