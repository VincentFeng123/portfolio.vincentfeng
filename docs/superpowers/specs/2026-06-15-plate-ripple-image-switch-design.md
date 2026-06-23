# One-time ripple image switch (during compose) — Design

**Date:** 2026-06-15
**File touched:** `title-screen.html` (single file)
**Status:** Implemented + verified

---

## 1. Goal / user request

> "As the centered image shifts to the right (and the glasses model shifts to the left) there's a ripple effect, and as it ripples the image switches to another image. This happens ONCE — only when the centered image is shifting to the right. Search online for the technique."

The technique is a **GL Transition** (gl-transitions.com): a fragment shader that samples two image textures and distorts the UVs with a sine ripple as `progress` 0→1. User chose the **full-image wave shimmer** (gl-transitions "ripple" by gre), playing **once during compose**, switching artwork 1 → another artwork, with the gallery still **cycling all 3** afterward.

## 2. Decisions (from clarification)

| # | Decision | Choice |
|---|----------|--------|
| Effect | What | gl-transitions "ripple" (full-image sine wave displacement), not the WaterDrop concentric one. |
| Timing | When | **ONCE**, during compose (centered image docks right + glasses dock left). Not per-transition. |
| From → To | Which artworks | **Artwork 1 (Textured Surface) → another artwork (Acrylic Field)**. Hero keeps showing Textured. |
| Rest of gallery | Other switches | **Keep cycling all 3** with the models (those stay as the DOM filmstrip slide). |

## 3. Architecture — WebGL ripple OVERLAY + gallery reorder

- **A dedicated WebGL canvas** (`#plate-ripple-canvas`, 3rd `THREE.WebGLRenderer`, mirrors the `reliefRenderer` pattern) overlays the plate-window. A fullscreen quad runs the ripple `ShaderMaterial` over two textures (FROM = Textured, TO = Acrylic), driven by `uProgress = composeProgress`. It is **opaque while it plays** (during hero + compose) then **fades to 0** (`show = 1 − smoothstep(0, 0.04, galleryProgress)`) to hand off to the DOM filmstrip showing the same artwork — seamless.
- **The DOM filmstrip gallery is untouched** (its slide cycling + title + previews + detail all keep working). To make the handoff land on the ripple's TO image, the gallery is **reordered** to start there: `artworks[]`, the `.plate-card` strip, and the `.plate-preview` strip are all reordered to **[Acrylic, Sasi, Textured]**. The hero still shows Textured (via the overlay on top); the gallery then cycles Acrylic (glasses) → Sasi (iPhone) → Textured (icon) — all 3, one per model.
- **Shader:** the wave amplitude peaks mid-transition and returns to 0 at both ends (`sin(π·progress)`) so it lands perfectly clean (no wobble at the handoff). BOTH images are displaced (so the incoming artwork visibly ripples in — the outgoing near-white hero image alone wouldn't show the wave). `uAmplitude 78`, `uSpeed 48`, divisor 22. The CSS image filter (`grayscale(1) contrast(1.08) brightness(1.02)`, object-fit cover, object-position ~50%/48%) is replicated in-shader so the overlay matches the DOM plate at the seam. Renderer `outputColorSpace = LinearSRGB`, textures `NoColorSpace` → display the JPEG bytes as-is.

## 4. State / wiring

- `plateRippleState = { progress, show }` declared **EARLY** (read by `updateScrollScene`, which runs synchronously during setup → a late `const` TDZ-crashes the page). `window.__plateRipple` (+ `.U` after init) for verify/tuning.
- `initPlateRipple()` (called once after the morph block) sets up the renderer/scene/quad/uniforms and `TextureLoader`s the two artworks.
- `renderPlateRipple()` is called in `tick()` after the main render; early-returns when `show <= 0.001` (so it only draws during hero + compose).
- `updateScrollScene`: `plateRippleState.progress = composeProgress; plateRippleState.show = 1 − smoothstep(0, 0.04, galleryProgress);`. Reduced-motion branch sets `show = 0`.

## 5. Verification

`fracture-verification` (server :8123), rendered at 1440×900. The ripple plays at scroll **≈0.51–0.61** (compose band). **Must wait for the plate `.go` fade-in (1.25s wall-clock transition) to finish** before scrubbing, else headless catches the plate at opacity 0 (it is NOT scroll-gated). Verified: compose mid (`progress≈0.56`) shows clear full-image wavy distortion; `progress≈0.95` lands clean (Acrylic, no distortion) → seamless filmstrip handoff. Gallery cycles Acrylic→Sasi→Textured (icon dwell title = "Textured Surface Study"). Morphs (m2/m3) + per-image dwell unaffected. No pageerrors.

## 6. Notes / gotchas

- The hero/FROM image (Textured Surface) is near-white, so the first ~40% of the ripple reads as a faint plate developing; the wave becomes clearly visible as the darker Acrylic blends in. Inherent to "from artwork 1".
- Headless screenshots intermittently blank the light artwork plates (documented); DOM shows them present.

---

*Note: project is not a git repo, so this spec is written to disk but not committed.*
