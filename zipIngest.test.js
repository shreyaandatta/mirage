import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { ingestZip, looksLikeZip } from './src/zipIngest.js';

async function makeZip(files) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'blob' });
}

describe('looksLikeZip', () => {
  it('matches .zip case-insensitively and rejects others', () => {
    expect(looksLikeZip('capture.zip')).toBe(true);
    expect(looksLikeZip('CAPTURE.ZIP')).toBe(true);
    expect(looksLikeZip('scene.splat')).toBe(false);
    expect(looksLikeZip(undefined)).toBe(false);
  });
});

describe('ingestZip', () => {
  it('extracts a splat file and strips its directory path', async () => {
    const blob = await makeZip({
      'export/readme.txt': 'hi',
      'export/scene.splat': new Uint8Array(64),
    });
    const result = await ingestZip(blob);
    expect(result.kind).toBe('splat');
    expect(result.file.name).toBe('scene.splat');
    expect(result.file.size).toBe(64);
  });

  it('prefers the largest splat when several are present', async () => {
    const blob = await makeZip({
      'meta.ply': new Uint8Array(8),
      'big-scene.ply': new Uint8Array(4096),
    });
    const result = await ingestZip(blob);
    expect(result.kind).toBe('splat');
    expect(result.file.name).toBe('big-scene.ply');
  });

  it('classifies a photo burst (camera-capture zip) as photos', async () => {
    const blob = await makeZip({
      'capture/frame-001.jpg': new Uint8Array(10),
      'capture/frame-002.jpg': new Uint8Array(10),
      'capture/frame-003.jpg': new Uint8Array(10),
    });
    const result = await ingestZip(blob);
    expect(result).toEqual({ kind: 'photos', count: 3 });
  });

  it('ignores macOS resource forks and dotfiles', async () => {
    const blob = await makeZip({
      '__MACOSX/scene.splat': new Uint8Array(9),
      'export/.DS_Store': new Uint8Array(9),
      'export/photo.jpg': new Uint8Array(9),
    });
    const result = await ingestZip(blob);
    expect(result).toEqual({ kind: 'photos', count: 1 });
  });

  it('reports unknown when nothing useful is inside', async () => {
    const blob = await makeZip({ 'notes.txt': 'nothing here' });
    const result = await ingestZip(blob);
    expect(result).toEqual({ kind: 'unknown' });
  });
});
