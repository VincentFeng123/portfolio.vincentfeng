# iPhone → black image-icon morph (carousel image 2 → 3) — Design

**Date:** 2026-06-15
**File touched:** `title-screen.html` (single file) + new `fracture-verification/drive-morph3.mjs`
**Status:** Approved design (user said "yea") — implementing

---

## 1. Goal / user request

> "Make this SVG a 3D model, colored black, and make it the 3rd model [in the left-accent chain]. The iPhone particalizes and then transforms into this 3D model — the exact same style as sculpture→glasses and glasses→iPhone."

The SVG (`viewBox 0 0 140 100`): a rounded-rect frame (`rect 12,8,116,84 rx18`, stroke 5, no fill), a filled circle (`cx48 cy50 r9`), and an upward quadratic arc (`M79,56 Q92,38 105,56`, stroke 6). It reads as the universal **"image / picture" icon** (frame + sun + mountain) — a fitting next link: classical art → lens → device → the digital image.

Reuse the existing morph **mechanic** (charcoal particle cloud, dissolve→travel→reassemble, 360° in-place spin) for a **third** morph: the parked **iPhone** transforms into the **black image-icon** during the carousel's image 2 → image 3 transition.

## 2. Decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Trigger slide | When the morph plays | **Image 2→3** (Acrylic Field → Sasi Relief) — the next slide after glasses→iPhone. Icon then holds in the slot for images 3, 4, 5. |
| 3D form | How the 2D SVG becomes 3D | **Volumetric object** — deep box frame ring + sphere dot + raised ridge (tube) for the arc. Reads from every angle through the 360° spin (not a flat plaque). |
| Color | Material | **Near-black** `MeshPhysicalMaterial` (`~0x0a0a0a`) with subtle clearcoat so the volume catches light and doesn't read flat. |
| Staging | Where | **Same left accent slot** the iPhone occupies (`offX:0`) → cloud dissolves / spins / reassembles in one spot; center filmstrip slides image2→3 simultaneously. |
| Scope | How many transitions morph | **Only image2→3.** Icon persists for images 3→5. |
| Safety | Backup | Timestamped `title-screen.*.bak` before implementation. |

## 3. Architecture — a self-contained `morph3*` stage (clone of `morph2`)

Mirror Stage 2 exactly: new `MORPH3` state, `morphU3` uniforms, `morph3Pivot`/`morph3Points`/`morph3Icon`, `ICON_LOOK`. Declared early (TDZ-safe) right after the `morph2` declarations; the function block sits right after `window.__MORPH2`. **Hero morph (`morph*`) and Stage 2 (`morph2*`) are left untouched.** Reuses the shared GPU/sampler primitives unchanged (`MORPH_POINTS_VERT/FRAG`, `SigSampler`, `sigNoise`/`MORPH_NOISE_GLSL`/fields, `sigRemapBias`). Same charcoal cloud color (`0x17120d`), same timeline curve, same in-place pivot spin.

## 4. The 3D model — procedural, built from the exact SVG coords (no GLB)

`morph3BuildIconGeometry()` builds three pieces in SVG space (viewBox 140×100; map `(sx,sy) → (sx, -sy, z)` so SVG y-down becomes 3D y-up), merges them, then centers on its bbox and scales to max-dim **1.8** (same normalize convention as the glasses/iPhone). Returns `{ geometry, maxDist }`.

- **Frame** → `THREE.ExtrudeGeometry` of a rounded-rect **ring** `THREE.Shape` (outer rounded rect = path rect grown by +2.5; inner rounded rect = shrunk by −2.5, added as a hole) with `depth ≈ 14` → a deep box frame. Corners via `.absarc`.
- **Dot** → `THREE.SphereGeometry(r≈9, 24, 18)` translated to `(48, -50, 0)` — the filled circle as a full sphere (reads from any angle).
- **Arc** → `THREE.TubeGeometry(new THREE.QuadraticBezierCurve3((79,-56,0),(92,-38,0),(105,-56,0)), 32, r≈3, 12)` — the wave as a raised ridge.

Merge: strip each to `position`+`normal`, `.toNonIndexed()`, `mergeGeometries(...)`, `computeVertexNormals()` if needed (same helper shape as `morph2NormalizeIphone`). Material: `MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.3, side: DoubleSide, transparent: true, opacity: 0 })`.

## 5. Source → target wiring (`morph3Build`)

- **SOURCE** = the existing solid `morph2Iphone`. Its statueGroup-local **resting** pose (ignoring the Stage-2 spin, which is at 2π≈identity by the time Stage 3 starts) = `compose(morph2Pivot.position, morph2Iphone.quaternion, morph2Iphone.scale)`. Source geometry = `morph2Iphone.geometry` (`= morph2IphoneGeo`).
- **TARGET** = the icon geometry, placed at the **same slot**: `iconPos = morph2Pivot.position + ICON_LOOK.off*`. `iconScale = (iPhone world height / icon local height) · ICON_LOOK.scaleMul`. `iconQuat = sourceQuat · yaw(ICON_LOOK.yawDeg)`. `ICON_LOOK = { scaleMul: 1.0, offX: 0, offY: 0, offZ: 0, yawDeg: 0 }`.
- **Sampling** — identical to Stage 2: `SigSampler` over both, `MORPH_COUNT` (26000) points each, azimuth-rank + per-window (WIN=80) height pairing, `aDBias` from `fieldGlasses` over the iPhone source, `aRBias` from `fieldGlasses` over the icon target via `sigRemapBias`. Positions baked **relative to `iconPos`** (the pivot) so the spin is in-place.
- **Pivot** — `morph3Pivot` (THREE.Group) at `iconPos`, child of `statueGroup`. The points cloud (`ShaderMaterial`→`morphU3`) and the solid icon mesh are its children. (`statueGroup`-relative, like `morph2Pivot` — NOT spun on `statueGroup`, which would orbit the far origin.)

## 6. Reveals / peels

- **iPhone source peel = opacity fade** (`morph2Iphone.material.opacity = 1 − morphU3.uDissolve`), **not** a shader seam. Reason: the documented Stage-2 gotcha — the `morphPatchGlassesMaterial` field-discard shader patch renders **blank on the iPhone geometry**. The charcoal cloud (whose `aHead` = iPhone surface points, dissolving via `uDissolve`/`uScatter`) provides the particalization; the solid just fades out beneath it. `morph3Update` runs **after** `morph2Update` so it wins the opacity write (Stage 2 keeps setting `opacity = uReveal2 = 1` each frame). On reverse, `m3→0` restores `opacity=1` and Stage 2 takes back over.
- **Icon reveal = opacity** (`morph3Icon.material.opacity = morphU3.uReveal`), the user-approved Stage-2 approach — cloud convergence sells the reassembly, the solid materializes under it. (A fresh procedural geometry *could* take the shader reveal patch, but opacity is the proven/robust path and keeps the look consistent.)

## 7. Timeline & scroll wiring

- **`morph3EvalTimeline(m)`** — same curve as Stage 2: `uDissolve (m-.06)/.44`, `uErode (m-.075)/.44`, `uMorph smoothstep(.30,.82,m)`, `uScatter sin(πm)`, `uReveal (m-.60)/.40`, `MORPH3.yaw = smoothstep(0,1,m)·2π`.
- **`morph3Update(t)`** — `uTime`; `morph3Pivot.rotation.y = yaw`; `morph3Points.visible = 0.001<m<0.999`; `morph3Icon.opacity = uReveal` (visible >0.01); `morph2Iphone` source fade per §6. Called from `tick()` right after `morph2Update(t)`.
- **Lengthen image2→3:** add `CAROUSEL_SECOND_MOVE_WEIGHT = 24` (mirrors `FIRST_MOVE_WEIGHT`); `carouselMoveWeight(index)` returns FIRST for 0, SECOND for 1, else MOVE. Refactor the band math into one `carouselMoveWindow(moveIndex)` → `{start, span}` (fractions of total weight) feeding both `morph2BandProgress` (move 0) and new `morph3BandProgress` (move 1).
- **Page length:** total weight 63.32 → 84.32 (×1.3318). Grow `SCROLL_CAROUSEL_VH` 908 → ~1209 (×1.3318) so per-image dwell + normal slides keep their absolute vh and the 2→3 window reads ~150vh like the 1→2 one. `SCROLL_TOTAL_VH` 1616 → ~1917; CSS `.scroll-space` `height` updated to match.
- `updateScrollScene`: `if (MORPH3.ready) morph3EvalTimeline(morph3BandProgress(galleryProgress));` after the Stage-2 line; reduced-motion branch: `if (MORPH3.ready) morph3EvalTimeline(1);`.

## 8. Load / kickoff

`morph3Kickoff()` (called right after `morph2Kickoff()` at the statue-load resolve): geometry is **procedural** (no fetch) — build `morph3IconGeo`/`morph3IconMaxDist` synchronously, then poll (`setTimeout`) until `MORPH2.ready && morph2Iphone` before `morph3Build()`.

## 9. Reversibility

Scroll up → `morph3BandProgress` reverses → icon dissolves, iPhone reforms (opacity restored), spin unwinds. Independent of Stages 1+2; both stay at `m=1` through the later carousel.

## 10. Risks & mitigations

- **iPhone source can't take a shader erode** (blank-render gotcha) → opacity fade beneath the cloud (§6); the cloud carries the particalization.
- **Volumetric icon proportions in the small slot** → exposed via `ICON_LOOK` + `window.__MORPH3` live-tuning hook (`park`, `rebuild`, `screenBBox`). **Verify at the REAL desktop aspect (1440×900), not the tall test viewport** (Stage-2 hard-learned gotcha).
- **Regression to Stages 1/2** → none by construction (untouched); verify all three.
- **Dwell drift** → grow `SCROLL_CAROUSEL_VH` by exactly the weight ratio; re-verify.

## 11. Verification (`fracture-verification/`, server :8123)

- `window.__MORPH3 = { U, state, look, park(m), rebuild(), points, icon, screenBBox(which) }`.
- New `drive-morph3.mjs` (clone of `drive-morph2.mjs`) sweeping the 2→3 window (~scroll 0.77–0.85 at the new page length; rely on the reported `m3`): `m3=0` solid iPhone, `m3≈0.5` charcoal cloud, `m3=1` solid black icon (left accent), with image 3 (Sasi Relief) centered. Verify at **1440×900**. Confirm Stages 1+2 and per-image dwell unaffected.

## 12. Out of scope / future

- Morphs on images 3→4, 4→5.
- Refactoring stages 1+2+3 into a shared `createMorphStage()` factory.

---

*Note: project is not a git repo, so this spec is written to disk but not committed.*
