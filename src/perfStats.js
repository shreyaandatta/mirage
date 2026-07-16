// Pure rolling-window frame statistics for the ?hud=1 perf overlay.
// Median/p95 over a sliding window is robust to one-off GC pauses that
// would wreck a mean — the same reason perf dashboards report percentiles.

export class RollingWindow {
  constructor(capacity = 240) {
    this.capacity = capacity;
    this.samples = [];
  }

  push(value) {
    this.samples.push(value);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  get count() {
    return this.samples.length;
  }

  /** Nearest-rank quantile; null until a sample exists. */
  quantile(q) {
    if (!this.samples.length) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
    return sorted[rank];
  }
}

export function formatMs(v) {
  return v == null ? '—' : `${v.toFixed(1)}ms`;
}
