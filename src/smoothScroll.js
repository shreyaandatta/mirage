/**
 * App-wide smooth scrolling via Lenis. One instance lives for the whole
 * session: the gallery/landing page is the only scrollable route, so the
 * viewer pauses it (leaving wheel events to OrbitControls zoom) and the
 * gallery resumes it. `prefers-reduced-motion` skips Lenis entirely —
 * scrolling stays native, and callers fall back through smoothScrollTo().
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

let lenis = null;

export function initSmoothScroll() {
  if (lenis) return lenis;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  // anchors stays off: the app routes via location.hash (#/scene/…), which
  // Lenis's anchor handling must not intercept. Lerp mode (lenis.dev's own
  // feel) over duration+easing: delta-time damped, so identical on 60/120Hz.
  // 0.05 is deliberately floatier than the 0.1 default — the hero tracks
  // scroll 1:1 (ease=1), so Lenis is the only smoothing filter in the chain
  // and can afford the longer settle without reading as lag.
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.05,
    wheelMultiplier: 1,
  });
  if (import.meta.env.DEV) window.__lenis = lenis;
  return lenis;
}

/** Whether Lenis is driving the page scroll (false under reduced motion). */
export const smoothScrollActive = () => !!lenis;

export function pauseSmoothScroll() { lenis?.stop(); }
export function resumeSmoothScroll() { lenis?.start(); }

/** Scroll to an element, selector, or Y offset, via Lenis when active. */
export function smoothScrollTo(target, options = {}) {
  if (lenis) { lenis.scrollTo(target, options); return; }
  if (typeof target === 'number') { window.scrollTo({ top: target, behavior: 'smooth' }); return; }
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  el?.scrollIntoView({ behavior: 'smooth' });
}
