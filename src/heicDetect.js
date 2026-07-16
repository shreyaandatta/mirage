// Lightweight, dependency-free HEIC detection used for drag-drop routing.
// Kept separate from convertImages.js so the heavy libheif/jszip bundle only
// loads when the user actually converts photos (see photoModal.js dynamic import).

export const HEIC_EXT = /\.(heic|heif)$/i;

/** Fast, synchronous guess by filename / MIME (not a content check). */
export function looksLikeHeic(file) {
  return HEIC_EXT.test(file.name) || /image\/hei[cf]/i.test(file.type || '');
}
