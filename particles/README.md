# Stone to Signal

Scroll-driven WebGL experience: Michelangelo's David dissolves into particles,
the particles draw out into glowing wires that twist downward with scroll,
converge into the silhouette of sunglasses, and harden into the real model.

Vanilla Three.js + GSAP ScrollTrigger + custom GLSL, built with Vite/TypeScript.

## Commands

```sh
npm install
npm run dev        # dev server
npm run build      # type-check + production build -> dist/
npm run preview    # serve the production build
npm run models     # re-compress assets-src/*.glb -> public/models/ (gltf-transform)
```

## Debug rig

Open with `?debug` for lil-gui sliders on every uniform, a master-scrub slider
(drives scroll without touching the wheel — park it at a seam and step in
0.005 increments), stats-gl GPU timing, and scroll-position persistence across
reloads.

## How it works (short version)

- One scrubbed GSAP timeline (duration 1.0 = scroll fraction over a 650vh
  track) tweens ~13 scalar uniforms (`src/state/uniforms.ts` is the contract)
  plus camera state. A single `gsap.ticker` callback in `src/App.ts` renders.
- The particle system is ONE representation throughout: each of the 2k–20k
  wires (per device tier) is a line strip along a cubic Bézier from a sampled
  head-surface point to a sampled glasses-surface point. Two moving curve
  parameters (`uGrow` head-end, `uRelease` tail-end) collapse it to a particle,
  draw it out, detach it, and land it — so nothing ever "switches
  representation" and the morph can't pop. Per-wire data lives in three
  RGBA32F DataTextures fetched in the vertex shader.
- The two seams (solid head -> particles, particles -> solid glasses) share
  one analytic noise field per model between the mesh fragment shaders
  (discard threshold) and the CPU-precomputed particle biases
  (`src/scene/simplex.ts` mirrors `src/shaders/chunks/noise.glsl`), with the
  particle side leading the pixel side by a constant scroll offset.
- Verification scripts (`scripts/verify*.mjs`, `scripts/still.mjs`) drive a
  headless Chrome through the journey and screenshot every stage into
  `shots/`.

Full design documents (rendering system, choreography spec, architecture,
adversarial critique) are in `docs/`.

## Models

Originals in `assets-src/` (8.5 MB head, 870 KB glasses); shipped versions in
`public/models/` are meshopt-compressed (1.7 MB / 121 KB) via
`scripts/compress-models.sh`. The head keeps 12-bit normals — 8-bit octahedral
normals band on smooth marble under rim light.
