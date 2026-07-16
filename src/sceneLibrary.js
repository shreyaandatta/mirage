// Persistent scene library: captures you drop in are saved to IndexedDB
// (blob and all), so they survive reloads and get their own `#/lib/<id>`
// route — before this, an imported scene vanished the moment you refreshed.
// Everything stays on-device, consistent with the "nothing is uploaded" story.

const DB_NAME = 'mirage-library';
const DB_VERSION = 1;
const STORE = 'scenes';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = run(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
  });
}

export function librarySupported() {
  return typeof indexedDB !== 'undefined';
}

/**
 * Save a dropped splat file. Returns the stored record's metadata.
 * If a scene with the same name and size is already saved, returns that
 * record instead of storing a duplicate.
 */
export async function saveScene(file) {
  const db = await openDb();
  try {
    const existing = (await tx(db, 'readonly', (s) => s.getAll())) ?? [];
    const dupe = existing.find((r) => r.name === file.name && r.size === file.size);
    if (dupe) {
      const { blob, ...meta } = dupe;
      return meta;
    }
    const record = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      addedAt: Date.now(),
      blob: file,
    };
    await tx(db, 'readwrite', (s) => s.put(record));
    const { blob, ...meta } = record;
    return meta;
  } finally {
    db.close();
  }
}

/** Metadata for every saved scene, newest first (no blobs materialized). */
export async function listScenes() {
  const db = await openDb();
  try {
    const records = (await tx(db, 'readonly', (s) => s.getAll())) ?? [];
    return records
      .map(({ blob, ...meta }) => meta)
      .sort((a, b) => b.addedAt - a.addedAt);
  } finally {
    db.close();
  }
}

/** Full record (with blob) for `#/lib/<id>`, or null if it was removed. */
export async function getScene(id) {
  const db = await openDb();
  try {
    return (await tx(db, 'readonly', (s) => s.get(id))) ?? null;
  } finally {
    db.close();
  }
}

export async function deleteScene(id) {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (s) => s.delete(id));
  } finally {
    db.close();
  }
}
