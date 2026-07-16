// ?hud=1 diagnostics overlay: turns "70k+ splats, interactive" into data —
// FPS, frame-time median/p95, splat count, WebGL draw calls, and JS heap
// (where the browser exposes it). Toggle by adding ?hud=1 to the URL.

import { formatMs } from '../perfStats.js';

export function perfHudEnabled() {
  return new URLSearchParams(window.location.search).get('hud') === '1';
}

export class PerfHud {
  constructor(host) {
    this.el = document.createElement('pre');
    this.el.className = 'perf-hud';
    this.el.setAttribute('aria-hidden', 'true');
    host.appendChild(this.el);
  }

  /**
   * @param {object} s { fps, frameMedian, frameP95, splats, rendererInfo }
   */
  update({ fps, frameMedian, frameP95, splats, rendererInfo }) {
    const lines = [
      `fps ${fps}`,
      `frame ${formatMs(frameMedian)} · p95 ${formatMs(frameP95)}`,
      `splats ${splats >= 1000 ? `${(splats / 1000).toFixed(0)}k` : splats}`,
    ];
    if (rendererInfo?.render) {
      lines.push(`draw calls ${rendererInfo.render.calls}`);
    }
    if (performance.memory?.usedJSHeapSize) {
      lines.push(`js heap ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}MB`);
    }
    this.el.textContent = lines.join('\n');
  }

  destroy() {
    this.el.remove();
    this.el = null;
  }
}
