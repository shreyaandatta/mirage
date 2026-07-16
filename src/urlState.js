// Compact, URL-safe encoding of camera state so a view or a fly-through path can
// live in the hash and be shared. A pose is fully defined for an orbit camera by
// its position + look-at target (the scene's `up` stays fixed), so that's all we
// serialize — six rounded numbers per keyframe.

const round = (n) => Math.round(n * 1000) / 1000;

export function encodePose({ position, target }) {
  return [...position, ...target].map(round).join(',');
}

export function decodePose(str) {
  if (!str) return null;
  const n = str.split(',').map(Number);
  if (n.length < 6 || n.some((x) => !Number.isFinite(x))) return null;
  return { position: n.slice(0, 3), target: n.slice(3, 6) };
}

// A path is a duration tag followed by keyframes, separated by '~'.
// e.g. "d4.5~1,2,3,0,0,0~2,1,4,0,1,0"
export function encodePath(keyframes, durationSec) {
  return `d${round(durationSec)}~${keyframes.map(encodePose).join('~')}`;
}

export function decodePath(str) {
  if (!str) return null;
  const parts = str.split('~');
  const durationSec = parts[0]?.startsWith('d') ? Number(parts[0].slice(1)) : 6;
  const keyframes = parts.slice(1).map(decodePose).filter(Boolean);
  if (keyframes.length < 2 || !Number.isFinite(durationSec)) return null;
  return { durationSec, keyframes };
}

// Hash format: "#/scene/<id>?view=<pose>&path=<path>". Split the route from its
// params so main.js routing can stay simple.
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const [route, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  return { route: route || '/', params };
}

export function buildHash(route, params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') usp.set(k, v);
  }
  const q = usp.toString();
  return `#${route}${q ? `?${q}` : ''}`;
}
