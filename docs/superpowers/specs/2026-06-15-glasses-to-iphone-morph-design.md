# Glasses → iPhone morph (carousel image 1 → 2) — Design

**Date:** 2026-06-15
**File touched:** `title-screen.html` (single file)
**Status:** Approved design — pending spec review → implementation plan

---

## 1. Goal / user request

> "When the user slides from the first image to the second image, make the transition from the glasses to the iphone.glb model. (should be the exact same transition as the transition from the sculpture to the glasses)."

Reuse the existing David→glasses morph **mechanic** (charcoal particle cloud, dissolve→travel→reassemble seams, 360° spin) for a **second** morph: the parked **glasses** transform into the **iPhone** during the carousel's image 1 → image 2 transition.

## 2. Decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Staging | Where the morph plays | **In-place, left accent slot** — small, near-profile, where the glasses are parked. The center filmstrip slides image1→image2 *simultaneously*. NOT a center-stage beat. |
| Duration | How much scroll the morph gets | **Extend ONLY the image1→2 transition** into a ~150vh morph window. Image2→3→4→5 keep their normal short (~20vh) slides. Page gets taller (the established "just extend the page" approach). |
| Fidelity | Faithfulness to original | **Same mechanic + 360° spin + charcoal particles. NO sweeping background word** (the "PROJECTS" word is a hero-only background element and would look wrong behind a small left model). |
| Scope | How many transitions morph | **Only image1→2.** The iPhone **persists** as the left accent for images 2→5; transitions 2→3→4→5 stay plain slides. No other morphs. |
| iPhone look | Material | **Dark monochrome `MeshPhysicalMaterial`** consistent with the glasses/page aesthetic (not iphone.glb's native colored textures). |
| Safety | Backup | Write a timestamped `title-screen.*.bak` before implementation (matches existing convention). |

## 3. Architecture — Approach ① (chosen): second self-contained morph stage

Add a parallel `morph2*` system that **reuses the shared GPU/sampler primitives** but is specialized for source = glasses, target = iPhone. **The working hero morph (`morph*` / `window.__MORPH`) is left completely untouched** — this preserves the delicate, working centerpiece and its scroll-reversibility, at the cost of ~150 lines of orchestration duplication (the heavy, tuned parts — shaders, sampler, noise fields, remap — are shared, so duplication is modest).

Rejected alternatives:
- **② Generalize into a `createMorphStage()` factory.** Cleaner/DRY but requires refactoring the working hero morph, and the two stages erode their *source* differently (David = ~11 fracture materials; glasses = one clean mesh) → leaky abstraction, real regression risk to the centerpiece. Possible future refactor, not now.
- **③ Reuse the same morph objects, swap target, re-run.** Least code but fragile: the existing system is hard-wired to David-as-source and must stay reversible on scroll-up; mutating it in place conflates two source paths. Rejected.

## 4. Components (all NEW; all children of `statueGroup` so they inherit the parked left-slot transform: layout shift + `turnBackDeg` + scale)

- **`MORPH2`** — state object `{ ready, failed, kicked, m, yaw }` (mirror of `MORPH`).
- **`morphU2`** — second uniform set: `uDissolve, uErode, uMorph, uScatter, uReveal, uTime, uSize, uPixelRatio, uColor=0x17120d` (charcoal, same as hero).
- **`morph2Points`** — a `THREE.Points` cloud **reusing `MORPH_POINTS_VERT/FRAG` unchanged**. The shader is already generic (`mix(aHead, aGlass, travel)`), so we feed:
  - `aHead` = sampled **glasses** positions (source), `aGlass` = sampled **iPhone** positions (target), `aHeadN` = glasses normals, plus `aSeed`, `aDBias`, `aRBias`.
  - Material is a new `ShaderMaterial` bound to `morphU2` (so it animates independently of the hero cloud).
- **`morph2Iphone`** — solid iPhone reveal mesh, dark monochrome `MeshPhysicalMaterial`, reveal-patched (mirror of `morphPatchGlassesMaterial`) driven by `morphU2.uReveal` + an iPhone distance field. Placed in the **glasses' slot/pose** so it lands parked-left where the glasses were.
- **Source erode (glasses dissolve):** add an **erode patch to the existing solid glasses material** (`morphGlasses.material`), mirroring `morphApplyErodePatch` but using `fieldGlasses` (distance field) and `morphU2.uErode`. This makes the solid glasses dissolve with the same noise-seam look as the cloud is born — the visual mirror of how David erodes in stage 1.

## 5. Build & load

- **`morph2Kickoff()`** — fetch + `GLTFLoader().parse` `iphone.glb`, then normalize via a shared/duplicated `morphNormalizeModel()` (merge meshes → center → uniform scale; same as `morphNormalizeGlasses`). **Preloaded right after the hero glasses finish loading** so the 6.5 MB model never hitches the carousel. Guard with `MORPH2.kicked/failed`.
- **`morph2Build(iphoneGeometry, iphoneMaxDist)`** —
  - **Source geometry** = the normalized glasses geometry already used for `morphGlasses`, sampled in the **placed frame** (apply the glasses' `glassPos/glassQuat/glassScale`) so source particles start exactly where the glasses currently render.
  - **Target geometry** = iPhone, placed in a **`PHONE_LOOK` slot** (position/rotation/scale) chosen so it reassembles in the same left accent area at a comparable on-screen size (phones are tall/thin vs wide glasses → scale to a comparable visual size, tunable).
  - Sample N = `MORPH_COUNT` (26000) points each via `SigSampler`; pair by **azimuth-rank + per-window height** (identical to stage 1) so the cloud converges coherently.
  - Bake `aDBias` from `fieldGlasses` over the glasses, `aRBias` from a distance field over the iPhone, via `sigRemapBias` (same as stage 1).
  - Build the `Points` geometry, the `morph2Iphone` mesh, and apply the glasses erode patch.
  - Set `MORPH2.ready = true`.

## 6. Timeline & scroll wiring

- **`morph2EvalTimeline(m)`** — the **same curve** as `morphEvalTimeline`:
  - `uDissolve = clamp01((m-0.06)/0.44)`, `uErode = clamp01((m-0.075)/0.44)`, `uMorph = smoothstep(0.30,0.82,m)`, `uScatter = sin(π·m)`, `uReveal = clamp01((m-0.60)/0.40)`, `MORPH2.yaw = smoothstep(0,1,m)·2π`.
- **Lengthen the image1→2 transition** in `plateIndexForProgress`: the first move (index 0→1) gets a **dedicated large weight** (`firstMoveWeight`, vs the normal `moveWeight=3`) so that single slide spans ~150vh; dwells and the other moves are unchanged. To keep per-image **dwell** constant in absolute scroll, **`SCROLL_CAROUSEL_VH` grows by the added length** (~130–150vh; CSS `.scroll-space` height updated to match `SCROLL_TOTAL_VH`).
- **Derive `morph2Progress`** in `updateScrollScene()` as the **linear scroll position within that lengthened image1→2 window** (computed from the same cumulative-weight cursor math used by `plateIndexForProgress`, so it stays in lockstep with the filmstrip slide). Call `morph2EvalTimeline(morph2Progress)`. The image slide and the model morph thus run from the **same sub-range, simultaneously**.
- **`morph2Update(t)`** — mirror of `morphUpdate`: set `uTime`, refresh the spin-stripped field matrix (`uHeadMatrixInv = inverse(statueGroup.matrixWorld)`), toggle `morph2Points.visible` (`0.001 < m < 0.999`) and `morph2Iphone.visible` (`uReveal > 0.002`). Called from `tick()` after the `statueGroup` block.
- **Spin:** `MORPH2.yaw` is added to `statueGroup.rotation.y` in `tick()` alongside `MORPH.yaw`. During the carousel the hero `MORPH.yaw` is a static 2π (net 0); `MORPH2.yaw` adds a fresh full turn during stage 2 and nets to 2π (0) by `m=1`, so the iPhone lands facing the parked direction.

## 7. Reversibility

Scroll back up → `morph2Progress` reverses → iPhone dissolves, glasses reform, spin unwinds. Stage 2 is independent of stage 1 and equally reversible. (Stage 1 stays at `m=1` throughout the carousel.)

## 8. Risks & mitigations

- **6.5 MB iphone.glb hitching the carousel** → preload right after the hero glasses; only geometry is sampled; reveal mesh uses a styled material (native textures ignored).
- **Thin phone spinning about Y shows edge-on mid-spin** → acceptable: during the spin the model is mostly a particle *cloud* (solid only near `m=0`/`m=1`); near `m=1` the spin nets to 0 and faces forward. Spin amount/axis is tunable if it reads oddly.
- **Phone scale/pose in the small left slot** → exposed via a `PHONE_LOOK` object (like `GLASSES_LOOK`/`STATUE_LAYOUT`) + a `window.__MORPH2` live-tuning hook for render-verify iteration.
- **Regression to hero morph** → none by construction (stage 1 code untouched); verify both stages with the existing harness.
- **Keeping per-image dwell constant** → grow `SCROLL_CAROUSEL_VH` by exactly the added first-move length; re-verify dwell with the filmstrip probe.

## 9. Verification plan (existing harness, `fracture-verification/`, server :8123)

- `window.__MORPH2 = { U, state, park(m), points, iphone }` for live scrubbing.
- Extend `drive-morph.mjs` (or a `drive-morph2.mjs`) to jump to the image1→2 window fractions and screenshot the glasses→cloud→iPhone sequence; confirm `m=0` (solid glasses), `m≈0.5` (cloud bloom), `m=1` (solid iPhone, parked left), and reverse.
- Re-run the filmstrip dwell/slide probe to confirm image dwells are unchanged and only the 1→2 gap lengthened.

## 10. Out of scope / future

- Morphs on images 2→3→4→5 (could reuse the same stage pattern later).
- Refactoring stages 1+2 into a shared `createMorphStage()` factory (Approach ②) — a future cleanup once a 3rd device morph is wanted.
- iPhone native materials / colorways.

---

*Note: project is not a git repo (`git` unavailable here), so this spec is written to disk but not committed.*
