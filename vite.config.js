import { defineConfig } from 'vite';

// COOP/COEP make the page cross-origin isolated, which unlocks SharedArrayBuffer
// so the splat sort worker can share memory with the main thread (faster sorting).
// The app also runs without these headers (e.g. GitHub Pages) — viewer.js detects
// `crossOriginIsolated` at runtime and falls back to copying memory.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // For GitHub Pages set base to '/<repo-name>/'. Vercel serves from root.
  base: '/',
  // Honor an externally assigned port (e.g. the harness's PORT env) so the
  // dev server can move when 5173 is taken; falls back to Vite's default.
  server: { headers: crossOriginIsolationHeaders, port: Number(process.env.PORT) || 5173 },
  preview: { headers: crossOriginIsolationHeaders, port: Number(process.env.PORT) || 4173 },
  // The HEIC converter (libheif WASM, ~3 MB) is a deliberately code-split,
  // lazy-loaded chunk — it never touches the initial load — so allow it past
  // the default warning threshold.
  build: { chunkSizeWarningLimit: 3200 },
  optimizeDeps: {
    // The library builds its sort worker from stringified function source;
    // dev-time pre-bundling can mangle that, so leave it unbundled.
    exclude: ['@mkkellogg/gaussian-splats-3d'],
  },
});
