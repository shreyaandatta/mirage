import { describe, it, expect } from 'vitest';
import { looksLikeHeic } from '../src/heicDetect.js';

const file = (name, type = '') => ({ name, type });

describe('looksLikeHeic', () => {
  it('matches .heic and .heif extensions, case-insensitively', () => {
    expect(looksLikeHeic(file('IMG_0001.HEIC'))).toBe(true);
    expect(looksLikeHeic(file('shot.heif'))).toBe(true);
    expect(looksLikeHeic(file('shot.Heic'))).toBe(true);
  });

  it('matches by MIME type even with a misleading name', () => {
    expect(looksLikeHeic(file('upload.bin', 'image/heic'))).toBe(true);
    expect(looksLikeHeic(file('upload.bin', 'image/heif'))).toBe(true);
  });

  it('rejects ordinary images and splat files', () => {
    expect(looksLikeHeic(file('photo.jpg', 'image/jpeg'))).toBe(false);
    expect(looksLikeHeic(file('scene.ksplat'))).toBe(false);
    expect(looksLikeHeic(file('heic-notes.txt', 'text/plain'))).toBe(false);
  });

  it('tolerates a missing MIME type', () => {
    expect(looksLikeHeic({ name: 'x.heic' })).toBe(true);
    expect(looksLikeHeic({ name: 'x.png' })).toBe(false);
  });
});
