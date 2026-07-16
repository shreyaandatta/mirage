# Mirage — Design Doc / Handoff Brief

> Capture a real object or space with your phone, and explore it as a photorealistic 3D
> "hologram" in the browser. This is the design + scope + architecture for the project.
> Hand this whole file to a coding session and say "build the viewer first, per this doc."

---

## 1. One-line pitch
**Mirage** — turn real objects and rooms into explorable, photorealistic 3D scenes using
**3D Gaussian Splatting**, rendered in real time in the browser. Point your phone, capture,
and walk through a scene that looks *real*, not like a blocky 3D model.

## 2. Why this project (portfolio intent)
For **Shreyaan Datta**, 3rd-year CSE, targeting Summer 2027 SWE internships. This is a
**"how did a student build this?" flagship.** Gaussian splatting is genuinely
cutting-edge (2023+ research, still novel in 2026) — even senior engineers are just
learning it. It signals: graphics/rendering depth, WebGL performance engineering, and the
ability to wire up a real ML reconstruction pipeline. High wow-factor on video for LinkedIn.

## 3. The honest reality (read this before scoping)
Gaussian splatting has **two very different halves**, and conflating them kills projects:

1. **Reconstruction (training):** turning photos → a `.ply`/`.splat` file. This is
   compute-heavy (structure-from-motion + GPU optimization, minutes on a good GPU). It is
   **not realistically done live in a browser.** Options: offline tools or a hosted API.
2. **Rendering (viewing):** loading a trained `.splat` and rendering it in real time. This
   **is** very doable in-browser with WebGL and is where the impressive, interactive demo
   lives.

**Design decision:** The *core product is the viewer/experience.* The capture pipeline is a
supporting flow that can start as "bring your own `.splat`" and grow toward one-tap capture.
Build the viewer to a polished bar first; it stands on its own as a portfolio piece.

## 4. Scope tiers (ship in this order)
- **Tier 0 — Killer viewer (MVP, must-ship):** drag-drop or pick from a gallery of `.ply`/
  `.splat`/`.ksplat` scenes; smooth orbit/fly navigation; loading UI; quality controls;
  clean modern UI. Ships as a real product on its own.
- **Tier 1 — Capture UX + pipeline docs:** an in-app "how to capture" guide + an upload
  slot; reconstruction happens via a documented **offline** pipeline (below) and the
  resulting file is dropped into the viewer. Honest, and still impressive.
- **Tier 2 — One-tap capture (stretch):** phone capture → hosted reconstruction API →
  auto-loads in the viewer. Only attempt after Tier 0/1 are solid.

## 5. Core user flows
**Viewer flow (Tier 0):**
1. Land on a gallery of sample scenes (ship 2–3 nice `.ksplat` files).
2. Click a scene → progressive load with a spinner/progress bar.
3. Orbit, zoom, pan, or enter "fly" mode; toggle quality; reset view; fullscreen.
4. Record a short fly-through clip / capture a screenshot to share.

**Capture flow (Tier 1):**
1. In-app guide: how to shoot (orbit the subject, 60–200 photos or a slow video, even
   lighting, avoid reflective/transparent objects, keep the subject filling the frame).
2. User runs the offline pipeline (documented) → gets a `.ply`.
3. Upload/drop the `.ply` → Mirage converts to `.ksplat` for performance → view it.

## 6. Reconstruction pipeline (document these; don't build training in-browser)
Give users concrete, current options and pick one as the "recommended" path:
- **Offline, free, local GPU:** COLMAP (SfM) → a Gaussian-splatting trainer such as the
  reference `graphdeco-inria/gaussian-splatting`, `nerfstudio` (`gsplat`), or **Brush**
  (cross-platform). Output `.ply`.
- **Hosted / no-GPU:** consumer apps like Luma AI or Polycam can capture and export splats
  the viewer can load. Good fallback for users without a GPU.
- Whichever the user uses, Mirage's job is to **ingest the `.ply`/`.splat` and render it
  beautifully**, optionally converting to `.ksplat` (smaller, faster).

## 7. Rendering tech (verified current)
Use **`@mkkellogg/gaussian-splats-3d`** (Three.js based; supports `.ply`, `.splat`,
`.ksplat`, `.spz`; built-in sort worker + orbit controls). Verified API:

```js
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const viewer = new GaussianSplats3D.Viewer({
  cameraUp: [0, -1, -0.6],
  initialCameraPosition: [-1, -4, 6],
  initialCameraLookAt: [0, 4, 0],
});

const loadPromise = viewer.addSplatScene('/scenes/garden.ksplat', {
  format: GaussianSplats3D.SceneFormat.KSplat,   // Splat | KSplat | Ply | Spz
  splatAlphaRemovalThreshold: 5,                 // drop near-transparent splats
  showLoadingUI: true,
  progressiveLoad: true,                         // render as sections arrive
  onProgress: (pct, label, status) => updateBar(pct, label), // status: Downloading|Processing|Done
});

loadPromise.then(() => viewer.start())
           .catch(err => showError(err.message));
// loadPromise.abort('left page');  // AbortablePromise — cancel mid-download
```

**Perf conversion** — convert user `.ply` → `.ksplat` in-browser for faster subsequent loads:
```js
GaussianSplats3D.PlyLoader.loadFromURL(url, onProg, false, undefined,
  /*minAlpha*/5, /*compression*/1, /*optimize*/true, /*shDegree*/1)
  .then(buf => GaussianSplats3D.KSplatLoader.downloadFile(buf, 'scene.ksplat'));
```

**Controls** (drop-in mode):
```js
const controls = new GaussianSplats3D.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.5; controls.maxPolarAngle = Math.PI * 0.75;
```

- Build tool: **Vite**, vanilla JS + Three.js. No framework required.
- Prefer the library's self-managed `Viewer` for Tier 0; drop into your own Three.js scene
  only if you need custom lighting/objects alongside the splats (stretch).

## 8. Features
**Tier 0 (MVP):**
- Scene gallery + drag-and-drop local file loading (`.ply`/`.splat`/`.ksplat`).
- Orbit + pan + zoom, damped; "reset view"; fullscreen.
- Progressive loading UI with percent + phase (Downloading / Processing).
- Quality controls: `splatAlphaRemovalThreshold`, spherical-harmonics degree (0/1/2),
  and a splat-count / resolution cap for weaker devices.
- Screenshot button; nice empty/error/loading states.

**Tier 1+:**
- In-app capture guide (illustrated do/don't).
- `.ply` → `.ksplat` client-side conversion + download.
- Cinematic **camera-path fly-through** recorder (define waypoints → animate → export video/GIF).
- Scene cropping / bounding-box cleanup to remove floaters.
- **WebXR** "walk inside the scene" mode (VR headset / phone AR). Big wow.

## 9. Architecture & file structure
```
mirage/
  index.html
  package.json
  vite.config.js
  public/
    scenes/                # sample .ksplat files shipped with the app
  src/
    main.js                # app bootstrap, routing between gallery <-> viewer
    viewer.js              # wraps GaussianSplats3D.Viewer: load, dispose, quality
    gallery.js             # scene list + drag/drop + file ingest
    convert.js             # .ply -> .ksplat conversion helper
    capturePath.js         # (Tier 1) waypoint camera animation + recording
    ui/                    # HUD, loading bar, controls panel, error states
    style.css
  README.md
  DESIGN.md                # this file
```
Key modules stay decoupled: `viewer.js` knows nothing about UI; `ui/` calls into it.

## 10. Performance engineering (this is the "senior" part — call it out in the README)
- **Splat budget:** target ~1–2M splats for desktop, far fewer for mobile. Provide a cap.
- Use **`.ksplat`** (compressed) over raw `.ply`/`.splat` for load speed; convert once.
- **`progressiveLoad: true`** so the scene appears before full download.
- The renderer sorts splats every frame on a worker — keep the main thread free; avoid
  heavy per-frame JS.
- Mobile: lower SH degree (0 or 1), raise `splatAlphaRemovalThreshold`, and reduce splat
  count. Detect device and pick a profile.
- Always `dispose()` a scene before loading another to avoid GPU memory leaks.

## 11. Asset hosting
- Ship sample `.ksplat` scenes in `public/scenes/` (keep each reasonably sized).
- For user uploads: process locally in-browser (no server) for Tier 0/1 — reinforces the
  privacy story and keeps it a static app.

## 12. Acceptance criteria (definition of done — Tier 0)
- [ ] `npm install && npm run dev` runs from a clean clone with zero config.
- [ ] Gallery loads at least 2 bundled scenes; each renders correctly.
- [ ] Drag-drop a local `.ply`/`.splat`/`.ksplat` → it loads and renders.
- [ ] Orbit/pan/zoom are smooth and damped; reset + fullscreen work.
- [ ] Progressive loading shows accurate progress; errors show a friendly message.
- [ ] Switching scenes disposes the previous one (no memory blow-up over 10 switches).
- [ ] Runs at an interactive frame rate on a normal laptop.
- [ ] README: what it is, the stack, how to run, how to capture your own scene, a demo GIF,
      and a Mermaid architecture diagram (capture → reconstruct → .ksplat → viewer).

## 13. Stretch goals
- WebXR VR/AR walk-through.
- Cinematic camera-path recorder + video export.
- Scene cropping / floater removal editor.
- Tier 2: hosted reconstruction API so phone capture auto-produces a viewable scene.
- Side-by-side "photo vs splat" compare slider.

## 14. Portfolio positioning (put in README)
- Framing: *"A browser-based 3D Gaussian Splatting viewer — capture reality with a phone,
  explore it as a real-time photorealistic scene. WebGL performance engineering + modern
  radiance-field graphics."*
- Explicitly name the hard skills: real-time splat rendering, GPU-friendly `.ksplat`
  pipeline, progressive streaming, device-adaptive quality, Three.js/WebGL.
- Link a live demo (Vercel) and a 20–30s screen-recorded fly-through.

## 15. Deployment
- Static host on **Vercel** (or GitHub Pages with Vite `base` set to the repo name). HTTPS
  is required for camera/WebXR features.

## 16. Risks & mitigations
- *Reconstruction is heavy* → scope the product as the viewer; document offline/hosted
  capture. Don't promise in-browser training.
- *Large asset sizes* → convert to `.ksplat`, cap splat counts, progressive load.
- *Mobile performance* → device profiles with reduced quality; test on a real phone.
- *Library API drift* → the snippets above are current for `@mkkellogg/gaussian-splats-3d`;
  re-verify the version's README when building. Pin the version in `package.json`.

---
### Notes for the implementing model
- Build **Tier 0 (the viewer) to a polished, shippable bar first.** It is the portfolio piece.
- Pin `@mkkellogg/gaussian-splats-3d` and `three` to fixed versions; verify the sample scene
  actually renders before layering UI.
- Keep it a static, client-only app — no backend for Tier 0/1.
- Prioritize a clean, readable repo; recruiters read the code and the README.

---

# Post-build review & improvement plan (July 2026)

The sections above were the original brief. What follows is the honest critique of what
got built, and the forward roadmap in three tiers.

## R1. Where the project stands

Tier 0 and most of Tier 1 shipped, and then some: gallery, drag-drop for four splat
formats, progressive loading, path recorder with Catmull-Rom + slerp, MP4 capture,
shareable pose URLs, 3D crop + `.ksplat` re-export, HEIC batch prep, WebXR gating,
device-aware quality profiles (~3,400 lines of source).

## R2. Critique — honest assessment

**What's genuinely strong**
- The most technically ambitious project in the portfolio — real-time radiance-field
  rendering is a "how did a student build this?" topic, exactly as intended.
- The performance-engineering section of the README (worker sorting, SharedArrayBuffer
  + COOP/COEP, code-splitting the WASM decoder, strict scene disposal) is senior-level
  material.
- Honest split between reconstruction and rendering — no fake claims.

**What's holding it back**
1. **Not in git, not on GitHub, not deployed.** Same as Airwaves: until there's a URL
   and a repo, none of the above exists to a recruiter. The README's demo-GIF slot is
   empty.
2. **Zero tests.** The only project in the portfolio with none — yet `urlState.js`
   (encode/decode round-trip), `cameraPath.js` (interpolation math), `heicDetect.js`,
   and the crop AABB filter are pure functions begging for Vitest. This weakens the
   "performance engineering" story: measured systems get tested.
3. **All sample scenes are procedural.** The pitch is "capture reality with a phone,"
   but nothing in the gallery is a real capture. One real scene (a phone-captured
   object via Luma/Polycam or Brush) would prove the whole pipeline end-to-end.
4. **`test-sphere.ksplat` sits at the repo root** — dev debris in a repo that's meant
   to be read.
5. **No performance numbers.** "70k+ splats interactive" — at what FPS, on what
   hardware? A perf HUD would turn claims into data.

## R3. Improvements — three tiers

### Tier A — Ship it (days; do first)
- [ ] `git init` + GitHub + Vercel deploy (COOP/COEP headers via `vercel.json` so
      SharedArrayBuffer stays on in production). Live URL into README + LinkedIn.
- [ ] Capture **one real scene** with a phone (Luma AI / Polycam export) and bundle it
      in the gallery — the proof-of-pitch scene.
- [ ] Record the fly-through demo (use your own path recorder — great dogfooding story)
      and embed the GIF/MP4 in the README.
- [ ] Move `test-sphere.ksplat` into `fixtures/` or delete it.
- [ ] Vitest + CI: `urlState` round-trip, `cameraPath` interpolation endpoints/monotonic
      time, `heicDetect`, crop AABB in/out cases.

### Tier B — Depth (1–2 weeks)
- [ ] **Perf HUD** (`?hud=1`): FPS, frame time, splat count, sort latency; publish a
      small table (MacBook / mid-range Android) in the README.
- [ ] **Scene annotations**: click to pin a 3D label; store in the shareable URL. Turns
      the viewer into a communication tool (real-estate / museum story).
- [ ] **IndexedDB scene library** — imported scenes persist across sessions instead of
      being lost on reload.
- [ ] `.spz` / SOG-style compressed export (not just `.ksplat`) — shows awareness of the
      current ecosystem direction.
- [ ] TypeScript for the pure modules (`urlState`, `cameraPath`, `crop`).

### Tier C — Flagship (stretch)
- [ ] **Guided multi-scene tours** — chain scenes + camera paths + captions into a
      shareable walkthrough (the "Zillow tour" demo).
- [ ] **Hosted reconstruction bridge** — a tiny queue (Supabase + a GPU worker or a
      hosted API) so a phone video in = a splat out; this is the original Tier 2 dream.
- [ ] **WebGPU rendering path** behind a flag, with a WebGL fallback and a benchmark
      comparing the two — a cutting-edge graphics story very few students can tell.
- [ ] Collaborative viewing: two browsers share one camera pose live over WebRTC.

## R4. Definition of done for "portfolio-ready"
Live URL ✓ · one real phone-captured scene in the gallery ✓ · demo clip in README ✓ ·
tests + CI badge ✓ · perf numbers published ✓.
