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
  // Lenis's anchor handling must not intercept. Duration + expo-out easing
  // (the config Lenis's docs recommend) responds instantly to input and
  // settles fast — the default lerp mode reads as scroll lag on a scrubbed
  // sequence.
  lenis = new Lenis({
    autoRaf: true,
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
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
