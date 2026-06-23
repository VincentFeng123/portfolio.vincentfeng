# Glasses drop-onto-nose — design spec

**Date:** 2026-06-13
**File touched:** `title-screen.html` (single-file app; `#stage` Three.js scene)
**Context:** The old "Signal journey" particle transition (statue → ink wires → glasses) was removed earlier today (see backup `title-screen.pre-deglass-20260613-155315.html.bak`). The page now slides the sculpture left and the image plate right. This feature adds the glasses back — but as a simple physical **drop onto David's nose**, not the particle effect.

## Goal / sequence

On scroll: David slides **left** + art plate slides **right** → the sunglasses **drop from above and settle on David's nose** (bridge on the nose) with a **tiny single-overshoot bounce** → continued scroll runs the existing **carousel** filmstrip slide. Glasses stay on through the carousel and gallery-exit. Scrolling back up before the trigger lifts the glasses off again.

## Components

### 1. Glasses object (isolated unit)
- Load `plastic_sunglasses.glb` once (existing `GLTFLoader`), add as its **own top-level `THREE.Group`** in the scene — NOT a child of `statueGroup` (avoids the statue's opacity/fracture/material traversal touching it).
- Keep the model's **own authored materials** (decision: "use the model's own look"). No Signal frame/trim/lens shader split.
- Scale to David's face width. Starting point from the removed code: model normalized to ~1.8 units wide then fit to ~2.4 desktop / ~1.5 mobile world units. Final size tuned via renders.
- Render order so the frame draws over the face; lens transparency uses the model's material as-is.

### 2. Nose anchoring (per-frame sync in `tick()`)
- After David's transform is written each frame, sync the glasses group to David's head:
  - `glasses.position` = `statueGroup` world position + a **local nose offset** rotated into David's current orientation;
  - `glasses.quaternion` = David's world quaternion ∘ a small fine-tune (yaw/pitch) so the glasses face forward on the face;
  - `glasses.scale` = matches David's current scale (so glasses scale with the head as it shrinks during the slide).
- Tunable params (dial via renders): `noseLocalX/Y/Z` (bridge position on the nose), `glassesWidth`, `glassesYawFine`, `glassesPitchFine`.
- Because it tracks David's **live** transform, the glasses stay glued to the nose despite his ~50° turn (from `sculptureTurnOut`) and his leftward `layoutShift` at the drop moment.

### 3. Drop + bounce (velocity spring)
- A single scalar `dropOffset` (extra vertical lift along David's local up axis), integrated each frame:
  - target = **lifted above the head** when not triggered, **0 (resting on nose)** when triggered;
  - velocity spring with stiffness `k` and damping `c` tuned to a **~0.75 damping ratio** → one small overshoot then settle (the "tiny single settle");
  - settle time target ~0.6–0.8s.
- Real-time (frame `dt`), independent of scroll speed. Reverses (springs back up) when the trigger flips off.
- The trigger is a boolean derived from scroll position (see §4). The spring reads only that boolean + David's transform — well-bounded.

### 4. Scroll choreography
- `.scroll-space` grows **900vh → ~1050vh**: a dedicated **drop band** (~150vh) is inserted between the end of the slide and the start of the carousel.
- `updateScrollScene` phase boundaries restructured:
  - **Hero** (slide completes here, `compositionProgress` reaches 1.0 as today).
  - **Drop band**: crossing into it sets the spring trigger ON. No carousel motion yet.
  - **Carousel**: begins only at the **end** of the drop band — `carouselProgress` remapped so the filmstrip / `updatePlateFilmstrip` / gallery-exit only advance after the band.
- Exact fractions retuned so existing hero and carousel beats keep their feel; verified against renders.

## Out of scope / non-goals
- No particle/wire effect, no `__SIGNAL`, no shader materials on the glasses.
- No change to the carousel/gallery content or the artist-info finale (only its scroll start point moves).

## Tunable parameters (final values set via render verification)
`glassesWidth`, `noseLocalX/Y/Z`, `glassesYawFine`, `glassesPitchFine`, spring `k`/`c`, `dropLiftHeight`, drop-band length (vh), drop trigger scroll fraction, carousel start fraction.

## Verification plan
Render the real page via `fracture-verification/drive-real.mjs` at scroll positions across: slide-complete, mid-drop, glasses-landed, carousel-started, gallery-exit. Confirm: (a) bridge sits on the nose at landing and tracks the turned/shifted head; (b) one small bounce; (c) carousel does not slide until glasses landed; (d) 0 page errors. Save to `fracture-verification/shots/glasses-drop/`.

## Risks
- **Nose alignment** is the main unknown — David is turned + shifted + scaled at the drop moment; the offset must be expressed in his local frame and tuned. Mitigation: iterate on renders.
- **Material look** of the GLB unknown until loaded; if the lens/frame reads wrong we revisit the "lens look" choice.
- Re-expanding scroll-space + remapping phases risks disturbing existing beats; mitigation: verify hero/carousel renders match pre-change pacing.

## Notes
- Project is **not a git repo**, so this spec is not committed (no VCS available).
