Directory verified (only the two GLBs present) and package versions checked against the npm registry as of today. Here is the architecture spec.

---

# Architecture Spec: David-to-Sunglasses Scroll Experience

## 1. PROJECT SCAFFOLD

**Language: TypeScript.** For a solo visual project the usual "JS is faster to hack" argument loses to one fact: three.js's API surface is huge and shifts every minor version, and `@types/three` catches wrong constructor args, renamed properties, and uniform-plumbing typos at edit time instead of as silent black screens. With Vite, TS costs zero config and zero build friction. Use loose-ish settings (`strict: true` but `noUnusedLocals: false`) so iteration stays fast.

**Shaders: `vite-plugin-glsl`, not template literals.** Real `.glsl` files get syntax highlighting, and the plugin's `#include` directive lets the shader author share noise/curl/easing chunks between the particle shader, wire shader, and the `onBeforeCompile` patches on the solid meshes — which is exactly what the seam strategy requires (see §4). Fallback if the plugin fights Vite 8: `import src from './x.glsl?raw'` plus a 15-line manual include resolver — keep shader file layout identical either way.

### File tree

```
/Users/vincentfeng/Documents/particles/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts              # glsl plugin, base path
├── assets-src/                 # ORIGINAL GLBs move here; never shipped
│   ├── head_of_michelangelos_david_optimised_fixed.glb
│   └── plastic_sunglasses.glb
├── scripts/
│   └── compress-models.sh      # one-time gltf-transform CLI → public/models/
├── public/
│   └── models/
│       ├── head.glb            # meshopt-compressed output (~1.5 MB)
│       └── glasses.glb         # (~300 KB)
└── src/
    ├── main.ts                 # boot: tier detect → loader screen → App.start()
    ├── App.ts                  # orchestrator: owns ticker callback, resize, lifecycle
    ├── core/
    │   ├── Stage.ts            # Renderer + Scene + Camera + Composer(Render/Bloom/Output)
    │   ├── Viewport.ts         # size/DPR tracking, coalesced resize events
    │   └── Quality.ts          # device tier + runtime demotion ladder
    ├── assets/
    │   ├── AssetLoader.ts      # fetch w/ byte progress → GLTFLoader.parse + MeshoptDecoder
    │   └── normalize.ts        # bake world matrices, merge, recenter, rescale → unit space
    ├── scene/
    │   ├── HeadMesh.ts         # solid head, dissolve patch via onBeforeCompile
    │   ├── GlassesMesh.ts      # solid glasses, harden-reveal patch
    │   ├── ParticleSystem.ts   # Points: 1 geometry, dual-anchor attributes
    │   └── WireSystem.ts       # LineSegments wires behind a swappable interface
    ├── scroll/
    │   ├── ScrollRig.ts        # spacer sizing, single ScrollTrigger, refresh policy
    │   └── Timeline.ts         # master gsap.timeline; phase boundary constants
    ├── state/
    │   └── uniforms.ts         # THE contract: shared uniform objects + camState
    ├── shaders/
    │   ├── chunks/             # noise.glsl, curl.glsl, ease.glsl, dissolve.glsl
    │   ├── particles.vert.glsl / particles.frag.glsl
    │   └── wires.vert.glsl / wires.frag.glsl
    ├── ui/
    │   ├── Loader.ts           # progress UI, min-display, fade-out handoff
    │   └── Overlay.ts          # HTML text labels, opacity driven by same timeline
    └── debug/
        └── DebugPanel.ts       # ?debug only, dynamic import: lil-gui + stats-gl
```

`state/uniforms.ts` is the interface between the three workstreams: choreography (GSAP) writes `.value`, shaders read them, structure (this spec) owns the file.

### package.json (versions verified against npm today)

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "models": "bash scripts/compress-models.sh"
  },
  "dependencies": {
    "three": "0.184.0",
    "gsap": "^3.15.0"
  },
  "devDependencies": {
    "vite": "^8.0.16",
    "vite-plugin-glsl": "^1.6.0",
    "typescript": "^6.0.3",
    "@types/three": "0.184.1",
    "lil-gui": "^0.21.0",
    "stats-gl": "^4.1.0",
    "@gltf-transform/cli": "^4.4.0"
  }
}
```

Notes: **pin `three` exact** (no caret) — three breaks examples/jsm APIs on minors. No runtime meshopt dependency needed: three ships `three/examples/jsm/libs/meshopt_decoder.module.js`. GSAP ≥3.13 is fully free (post-Webflow), ScrollTrigger included. `lil-gui`/`stats-gl` are devDeps loaded only via dynamic import behind `?debug` (Vite code-splits them into a chunk that never loads in normal visits). `stats-gl` over `stats.js` because it reports **GPU frame time** via disjoint timer queries — on this build the GPU, not the CPU, is the budget.

### index.html structure

```html
<body>
  <canvas id="gl"></canvas>                  <!-- position:fixed; inset:0; z:0 -->
  <div id="overlay" aria-hidden="true">      <!-- fixed; pointer-events:none; z:2 -->
    <p class="label" data-phase="head">…</p>
    <p class="label" data-phase="glasses">…</p>
  </div>
  <div id="scroll-space"></div>              <!-- height:600vh; the only scrolling element -->
  <div id="loader">                           <!-- fixed; z:3; pure HTML/CSS, visible pre-JS -->
    <div id="loader-bar"></div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
```

`#scroll-space` at 600vh gives 500vh of scrub travel (top hits at 0, bottom at 500vh scrolled) — inside the agreed 4–6 range. `html { scrollbar-gutter: stable }` and `body.loading { overflow: hidden }` until assets are ready.

## 2. ASSET PIPELINE

**Recommendation: one-time CLI compression + runtime normalization/sampling.** Two halves:

**Build-time (run once, commit outputs):** `scripts/compress-models.sh`:

```sh
npx @gltf-transform/cli optimize assets-src/head_*.glb public/models/head.glb \
  --compress meshopt --simplify false --texture-compress none
npx @gltf-transform/cli optimize assets-src/plastic_sunglasses.glb public/models/glasses.glb \
  --compress meshopt --simplify false --texture-compress webp
```

The head's 8.5 MB is almost pure float attributes (300k verts × 24 B + 1.2 MB index). Meshopt + KHR quantization (pos→16-bit, normals→8-bit oct) takes it to **~1.3–1.8 MB on disk, ~1.2 MB over brotli wire** — an ~80% cut. Why meshopt over Draco: decode is near-instant synchronous WASM (<50 ms for 300k verts) with a ~35 KB decoder already bundled in three, vs Draco's ~300 KB decoder, slower decode, and worker plumbing — Draco's extra ~400 KB saved isn't worth it at this size. Do **not** `--simplify` the head; 100k tris is cheap to render and the solid close-up is the hero shot. Glasses drop to ~250–350 KB.

**Runtime (in `normalize.ts`, behind the loader):** Both models need world-baking anyway (head is 0.45 units centered at (7.26, −30.3, 175.37); glasses have per-node axis-swap rotations and 0.245/0.01 scales), and particle sampling needs CPU-side geometry regardless — so a preprocessing-to-binary step buys nothing while adding a second source of truth. Per model: traverse → `mesh.updateWorldMatrix(true, false)` → `geometry.applyMatrix4(matrixWorld)` → merge by material via `BufferGeometryUtils.mergeGeometries` (glasses: 6 meshes → 4 draws by material; keep lens separate, it's alpha-blended) → `Box3.setFromObject` → recenter to origin → uniform scale so the head is exactly **1.0 scene units tall**, glasses scaled to anatomically plausible relative size (~0.65 units wide; expose as a debug-GUI constant). Drop the head's `solid_volume_fill_mesh` from rendering but keep its geometry available — it's a free 5k-tri volumetric sampling target if the shader author wants interior particles. Sample anchors with `MeshSurfaceSampler` (~20 ms for 100k tris) using a **seeded RNG** so particle↔dissolve-threshold pairing is deterministic across reloads.

Escape hatch if profiling ever shows sampling/parse cost mattering: add `scripts/bake-anchors.mjs` (three runs fine in Node) writing raw `Float32Array` anchor `.bin`s. Don't build it preemptively.

**Loading screen:** `AssetLoader.ts` fetches both GLBs itself with `ReadableStream` readers for true byte-level progress (GLTFLoader's `LoadingManager` progress is unreliable behind content-encoding), then `GLTFLoader.parse(arrayBuffer)`. Progress mapping: 0–80% download (weighted by known byte sizes), 80–95% parse + normalize + sample, 95–100% warmup — `renderer.compileAsync(scene, camera)` then render one real frame to prime bloom render targets. Only then: fade `#loader`, remove `body.loading`, force `scrollTo(0,0)`, and **create the ScrollTrigger** — it must not exist before assets are ready, so a mid-page hard refresh can't show a broken intermediate state.

## 3. PERF BUDGET

Target: 60 fps (≤16.6 ms; GPU budget ≤10 ms) on Iris Xe / Apple M1 at 1920×1080 CSS, and stable 60 on a mid iPhone/Pixel at LOW tier.

**Concrete numbers (MID tier — the design target):**

| Item | Spec | Est. GPU cost |
|---|---|---|
| Render resolution | DPR cap **1.5** → 2880×1620 | — |
| Head solid pass | 100k tris, untextured, 1 draw | ~0.6 ms |
| Particles | **65,536** points (256², FBO-ready if ever needed), 2–4 px | ~0.5 ms |
| Wires | **2,048 wires × 24 segments** LineSegments = 98k verts, 1 draw, all motion in vertex shader | ~0.5 ms |
| Glasses solid | 15.6k verts, 4 draws | ~0.1 ms |
| Base pass total (worst case: fuse phase, everything visible) | | ~2.5–3.5 ms |
| Bloom | UnrealBloomPass at **half render res**, threshold ~0.85, radius ~0.6 | ~3–4 ms |
| OutputPass (ACESFilmic tonemap + sRGB) | | ~0.5 ms |
| **Total** | | **~7–8.5 ms** — real headroom |

AA: no FXAA pass; set `samples: 4` on the composer's WebGL2 render target at HIGH, `2` at MID, `0` at LOW — cheaper and sharper than FXAA, and bloom softens edges anyway.

**Tiers** (in `Quality.ts`):

| | HIGH | MID (default desktop) | LOW (mobile) |
|---|---|---|---|
| Detect | GPU string matches `/Apple M|RTX|RX 6|RX 7|Arc/` via `WEBGL_debug_renderer_info` | any other non-mobile | `(pointer: coarse)` && short side < 820 px |
| DPR cap | 2.0 | 1.5 | 1.25 |
| Particles | 65,536 | 65,536 | 24,576 |
| Wires | 2048×24 | 2048×24 | 768×16 |
| Bloom | half-res | half-res | **none** — skip composer entirely (direct render); glow comes from the particle sprite's soft radial falloff + additive blending, which gives ~80% of the look for ~0% of the cost |
| MSAA | 4 | 2 | 0 |

**Runtime demotion (demote-only, never promote — avoids oscillation):** rolling mean frame delta over 120 frames; if >17 ms for two consecutive windows: step 1 drop DPR by 0.25 (repeatable to 1.0), step 2 bloom to quarter-res, step 3 disable bloom. Three `if`s in `Quality.ts`, not a framework.

**Measurement:** `stats-gl` (CPU+GPU ms panels) mounted only behind `?debug`; plus `renderer.info.render.calls/triangles` printed in the debug GUI. Acceptance test before polish: scrub the full timeline on a 4K display at HIGH and an iPhone at LOW with the GPU panel open; the fuse phase (worst case) must hold budget.

## 4. STATE & DATA FLOW

**Single rAF owner: `gsap.ticker`.** GSAP already runs an internal rAF to drive ScrollTrigger's scrub interpolation; registering `gsap.ticker.add(App.render)` makes rendering happen in the **same tick, after** GSAP updates — uniforms are always fresh (no one-frame lag) and there is exactly one rAF in the page. `renderer.setAnimationLoop` exists for WebXR; irrelevant here. Call `gsap.ticker.lagSmoothing(500, 33)` so tab-resume doesn't jump the timeline. `composer.render()` is called in exactly one place (`App.render`); nothing else ever renders.

**Flow:**

```
scroll position
  → ScrollTrigger { trigger:'#scroll-space', start:'top top', end:'bottom bottom', scrub:0.6 }
  → master gsap.timeline (Timeline.ts), tweens write DIRECTLY to:
       uniforms.ts:  uDissolve.value, uWireGrow.value, uFuse.value, uHarden.value
       camState:     { z, y, fov } plain object
       Overlay label opacities (DOM, cheap)
  → gsap.ticker tick → App.render():
       uTime.value = elapsed; apply camState to camera; composer.render()
```

Tweening `uniform.value` props directly means zero copy/sync layer; the uniforms object is shared by reference into `ShaderMaterial`s and the `onBeforeCompile` patches. `scrub: 0.6` (not `true`) smooths wheel-step quantization — this is the cheap insurance for "scroll-scrubbed feels buttery." Render every tick while visible (shaders use `uTime` for shimmer/twist, so dirty-flagging isn't worth it).

**Tab hidden:** rAF stops → gsap.ticker stops → GPU idles to zero, for free. No extra code beyond lagSmoothing.

**Resize (`Viewport.ts`):** listen to `window resize` + `orientationchange`, coalesce to the next ticker tick, then in order: `renderer.setPixelRatio(cappedDPR)` → `renderer.setSize(w, h, false)` → `camera.aspect = w/h; camera.updateProjectionMatrix()` → `composer.setSize(w, h)` → `bloomPass.resolution.set(w/2, h/2)`. `ScrollTrigger.refresh()` is **debounced 200 ms and skipped for height-only changes < 120 px** — otherwise iOS URL-bar show/hide fires refresh storms that visibly jump the scrub.

**Seam architecture** (structural contract for the shader/choreography owners): both seams are overlap-crossfades, not cuts. During dissolve, the solid head renders with an `onBeforeCompile` patch that discards triangles past a per-vertex threshold attribute, while the particle shader births particle *i* at the sampled surface point carrying the **same threshold value** (same seeded sampler, shared `chunks/dissolve.glsl` noise) — particles appear exactly where triangles vanish. Mirrored for harden→glasses. This is why sampling determinism and the shared chunk system are structural requirements, not shader details.

## 5. RISK LIST

1. **The two seams read as a crossfade, not a transformation** (the whole pitch dies here). *Mitigation:* shared-threshold architecture above; a debug-GUI "master scrub" slider that drives timeline progress without scrolling, so seams can be parked at 0.22 and tuned for hours. *Fallback:* mask the seam with a choreographed camera push + a 2–3 frame bloom-intensity flare at the cut — an old trick that reliably hides discontinuity.

2. **1px additive lines invisible/aliased on 4K and high-DPR displays** (WebGL lineWidth is locked at 1). *Mitigation:* DPR cap 2 bounds the worst case; wire density (2048 lines bunching) plus additive blending builds apparent thickness; test on a 4K display in week 1, not at the end. *Fallback:* `WireSystem.ts` is interface-isolated — swap in an instanced-quad ribbon implementation (custom `InstancedBufferGeometry`, ~4× vertex cost) and halve wire count to 1024×16.

3. **Head GLB network + main-thread parse jank.** *Mitigation:* meshopt to ~1.5 MB; all parse/normalize/sample happens behind the loader before scroll is enabled; `compileAsync` warmup prevents first-scroll shader-compile hitch. *Fallback:* move parse+sampling into a Worker, or pre-bake anchor `Float32Array` `.bin`s via a Node script and lazy-parse the head GLB only for the solid render.

4. **Bloom tanks iGPU/mobile frame rate.** *Mitigation:* half-res bloom, tier table, demote-only quality ladder measured with stats-gl GPU timings. *Fallback:* LOW-tier path already ships it — no composer at all, glow faked in the particle sprite; promoting that path to MID is one flag.

5. **Mobile scroll jank and ScrollTrigger refresh storms** (iOS URL bar, rubber-banding, wheel quantization). *Mitigation:* `scrub: 0.6`, debounced height-tolerant refresh policy (§4), single fixed canvas with one scrolling spacer (no nested scroll). *Fallback:* shorten mobile spacer to 400vh and enable `ScrollTrigger.normalizeScroll(true)` only if testing shows iOS needs it (it has side effects — opt in, don't default).

**Dev-workflow risks:** shader iteration speed — `.glsl` edits trigger full page reload, losing scroll position: persist `scrollY` to `sessionStorage` in dev and restore on boot. All tuning behind `?debug` → dynamic-import `DebugPanel.ts`: lil-gui sliders bound to every uniform, phase-boundary constants, glasses scale, bloom params, plus the master-scrub slider and stats-gl. Pin `three` exact and treat `vite-plugin-glsl`↔Vite-8 compat as a day-one smoke test (fallback `?raw` imports is a 30-minute swap).

---

### Critical Files for Implementation
- /Users/vincentfeng/Documents/particles/src/App.ts
- /Users/vincentfeng/Documents/particles/src/state/uniforms.ts
- /Users/vincentfeng/Documents/particles/src/assets/normalize.ts
- /Users/vincentfeng/Documents/particles/src/scroll/Timeline.ts
- /Users/vincentfeng/Documents/particles/src/core/Stage.ts