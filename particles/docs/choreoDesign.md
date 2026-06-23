# Choreography Spec — "Stone to Signal": David → Particles → Wires → Sunglasses

All numbers below assume the normalization pass (owned by the structure engineer, but the choreography depends on it): head recentered from (7.26, -30.3, 175.37) to origin and scaled ~2.99x to **2.0 units tall** (occupies y ∈ [-1.0, +1.0]); glasses world-baked, recentered, scaled ~12.9x to **1.8 units wide**, placed at **(0, -6, 0)** facing +Z. Scroll progress is 0.0–1.0 on one master timeline whose duration is exactly 1.0, so timeline position parameters ARE scroll fractions.

---

## 1. STAGE MAP

Six stages, four overlap seams. Default ease is `"none"` — exceptions are called out and justified in section 5.

| # | Stage | Range | Overlap with |
|---|-------|-------|--------------|
| S0 | HERO | 0.00–0.10 | S1 (0.08–0.10) |
| S1 | PARTICLEIZE | 0.08–0.26 | S2 (0.22–0.26) |
| S2 | WIRES (centerpiece) | 0.22–0.56 | S3 (0.54–0.56) |
| S3 | CONVERGE + FUSE | 0.54–0.74 | S4 (0.72–0.74) |
| S4 | HARDEN | 0.72–0.88 | S5 (0.86–0.88) |
| S5 | SETTLE | 0.86–1.00 | — |

The single tweened state object (synced to shader uniforms + camera every frame):

```js
const U = {
  dissolve: 0,   // head surface -> particles (noise-thresholded, bottom-up)
  erode: 0,      // solid head mesh alpha-erode (same noise field as dissolve)
  wireAlpha: 0,  // particle/wire emissive brightness
  growth: 0,     // wire downward extension, tips reach glasses at 1.0
  twist: 0,      // helical twist amplitude around the descent axis
  converge: 0,   // wire paths bend onto glasses target positions
  harden: 0,     // jitter -> 0, point size -> 0, snap to glasses surface
  reveal: 0,     // solid glasses erode-IN (mirror of erode)
  glint: 0,      // lens specular sweep
  bloom: 0.35, fog: 0.020, vignette: 0.65,
  camY: 0.15, camZ: 5.2, camYaw: 0, lookY: 0.15,
  glassesYaw: -0.17, glassesPitch: 0.06,
};
```

### S0 — HERO (0.00–0.10)
Viewer sees: solid marble head, centered, faint white rim light against near-black, low bloom. Idle breathing only (see section 2).
- `camZ: 5.2 → 4.6` over 0.00–0.10, ease `"none"`. **The page must visibly respond within the first 2% of scroll** — a static opening makes users think the page is broken. The dolly-in is that proof of life.
- `camYaw: 0 → -0.06` (≈ -3.5°), ease `"none"`.
- Label L1 visible 0.02–0.09.

### S1 — PARTICLEIZE (0.08–0.26)
Viewer sees: the head unravels **from the chin upward** — bottom dissolves first (this is mandatory: it pre-motivates the downward wire flow). Stone gray dims as particle emissive brightens; bloom blooms.
- `dissolve: 0 → 1` over 0.08–0.24, ease `"none"`.
- `erode: 0 → 1` over **0.095–0.235** — the seam rule: **particle birth leads pixel death by ~0.015 progress**. A particle must already exist on the surface before the solid fragment beneath it discards. Both read the same 3D noise field; this offset is the entire "seamless" trick for seam #1.
- `wireAlpha: 0 → 1` over 0.10–0.22, ease `"sine.inOut"` (it's a crossfade; symmetric ease).
- `bloom: 0.35 → 0.9` over 0.10–0.26, ease `"sine.inOut"`.
- `camYaw: -0.06 → -0.14`; camera position otherwise holds — stillness here makes the dissolution itself the event.

### S2 — WIRES (0.22–0.56) — the centerpiece, 34% of all scroll
Viewer sees: particles extrude into thin glowing strands shooting downward, twisting helically; the camera descends with them; the head exits the top of frame; for a stretch the screen is nothing but twisted light in fog.
- `growth: 0 → 1` over 0.22–0.56, ease `"none"`. Per-wire random offsets (±0.06, shader-side) make the tip wavefront ragged and organic. Tip altitude ≈ `-1 - 4.7 * growth`.
- `twist: 0 → 1` over 0.26–0.48 ease `"sine.inOut"`, then `1 → 0.65` over 0.48–0.58 (twist relaxes as order approaches).
- `camY: 0.15 → -5.0` over 0.24–0.58, ease `"none"` — **linear descent so scroll speed = travel speed, 1:1**. The journey must feel hand-cranked. At any growth g, tips ride ~1.1–1.2 units below camera center, i.e. pinned to the lower third of frame, trailing strands filling the upper two-thirds. (Verified: at p=0.40 tips are at y=-3.49, camera at -2.27; at p=0.50 tips -4.87, camera -3.79.)
- `lookY: 0.15 → -5.4` over the same span (camera looks slightly below itself — head-down posture).
- `camZ: 4.6 → 5.6` over 0.26–0.42 (dolly out to take in the lengthening strands), then `5.6 → 4.2` over 0.46–0.62 (tighten toward the convergence).
- `camYaw: -0.14 → +0.18` over 0.24–0.56 — an 18° counter-orbit **against** the twist direction; the parallax is what makes the helix read as 3D instead of a 2D streak field.
- `bloom: 0.9 → 1.15`; `fog: 0.020 → 0.045` (strands above dissolve into depth — sells infinite fall); `vignette: 0.65 → 0.50` (tighter — tunnel focus).
- **The void passage (0.42–0.50):** geometry guarantees a stretch where neither head nor glasses is in frame. At camZ 5.6 / FOV 35°, frame height is 3.53 units; at camY -3.2 the frame spans y ∈ [-4.97, -1.43] — head ends at -1.0 (clipped above), glasses begin at ~-5.55 (clipped below). Pure wire limbo. This is what makes the fuse a *reveal* instead of a morph happening at frame edge.

### S3 — CONVERGE + FUSE (0.54–0.74)
Viewer sees: the chaotic strand field bends inward, helix unwinding, and snaps into the unmistakable silhouette of sunglasses — wireframe-of-light glasses.
- `converge: 0 → 1` over 0.54–0.72, ease **`"power3.in"`** — deliberate: the last fifth of this range performs ~60% of the spatial travel. Tension gathers slowly, then the snap. This is the one long tween in the piece with an aggressive ease.
- `twist: 0.65 → 0` over 0.54–0.70, ease `"sine.out"` (unwinding = order emerging).
- `camY: -5.0 → -6.0` over 0.56–0.72 (arrive at glasses altitude); `lookY → -6.0`; `camZ: 4.2 → 3.8`; `camYaw: 0.18 → -0.05` (swing across the forming face — the silhouette assembles under parallax).
- `bloom: 1.15 → 1.45` peaking at 0.70.

### S4 — HARDEN (0.72–0.88)
Viewer sees: the light-wire glasses solidify — glow tightens onto the surface, matte black plastic fades in underneath, the transparent lenses catch a moving glint.
- `harden: 0 → 1` over 0.72–0.86, ease `"power1.inOut"` (jitter amplitude → 0, point size shrinks into the surface).
- `reveal: 0 → 1` over **0.76–0.88** — seam rule #2, mirror of S1: **a point must lock to the surface before the solid pixel beneath it appears** (harden leads reveal by ~0.02, same noise field).
- `wireAlpha: 1 → 0` over 0.78–0.90, ease `"sine.in"` (wisps die only after the solid owns the silhouette).
- `bloom: 1.45 → 0.55` over 0.74–0.92, ease `"power2.out"` (fast decay off the peak — the cooling).
- `glint: 0 → 1` over 0.84–0.92 (specular sweep across both lenses).
- `fog: 0.045 → 0.015`; `vignette: 0.50 → 0.70` (air clears, end state crisp); `camZ: 3.8 → 3.5`.

### S5 — SETTLE (0.86–1.00)
Viewer sees: finished product shot. Glasses rotate the last few degrees to face the camera dead-on with a tiny overshoot, final label appears, bloom simmers.
- `glassesYaw: -0.17 → 0` and `glassesPitch: 0.06 → 0` over 0.88–1.00, ease **`"back.out(1.4)"`** — the only overshoot in the piece; it reads as physical settling and marks finality.
- `camZ: 3.5 → 3.4`, `camYaw → 0`, ease `"sine.out"`.
- `bloom: 0.55 → 0.50`. Label L4 fades in 0.92–0.98. Light snap to progress 1.0 (section 3).

---

## 2. SPATIAL LAYOUT + CAMERA

**World:**
- Head: origin (0, 0, 0), 2.0 units tall, facing +Z. Pivot at bounds center (eyes land near y ≈ +0.3, which is why `lookY` starts at 0.15, not 0).
- Glasses: (0, -6, 0), 1.8 units wide, facing +Z, initial group rotation yaw -0.17 rad / pitch +0.06 rad.
- Drop distance 6 units = 3 head-heights. Chosen so the head fully exits frame mid-descent (the void passage above) while keeping camera travel short enough to stay controlled.
- Wires: origin = particle birth position on head surface, target = assigned glasses surface point (shader-side assignment); the choreography contract is just the constant drop and the `growth/twist/converge` scalars.

**Camera:** PerspectiveCamera, **FOV 35°** (long-lens, sculptural, low distortion — right for a portrait and a product shot), near 0.1, far 50. At the end framing (camZ 3.4), the 1.8-unit glasses fill ~47% of a 16:9 frame width — hero scale with breathing room.

**Path summary:** dolly-in on the hero → hold through dissolution → linear descent tracking ~1.1 units above the ragged wire-tip wavefront (tips pinned to lower third) with a dolly-out/in breath and an 18° counter-orbit → arrive and swing across the convergence → micro dolly-in to the product shot. The camera never leads the action; it follows the wavefront, which makes the viewer feel pulled downward rather than driven.

**Camera is never set directly by GSAP.** The timeline tweens `U.camY/camZ/camYaw/lookY`; the render loop composes:

```js
gsap.ticker.add(() => {                       // runs after GSAP updates each tick
  const t = clock.getElapsedTime();
  // idle layer: additive, time-based, NEVER written into U (GSAP would fight it)
  const ix = Math.sin(t * 0.23) * 0.06;
  const iy = Math.sin(t * 0.31) * 0.04;
  const iz = Math.sin(t * 0.17) * 0.05;       // breathing dolly
  camera.position.set(
    Math.sin(U.camYaw) * U.camZ + ix,
    U.camY + iy,
    Math.cos(U.camYaw) * U.camZ + iz
  );
  camera.lookAt(0, U.lookY, 0);
  syncUniformsAndRender();                     // copy U.* into material uniforms, composer.render()
});
```

Three non-synchronized sine periods (~27s, 20s, 37s) give a non-looping organic drift. The head/glasses also get an idle micro-rotation (±2° yaw, 0.05 rad/s sine) applied the same additive way. Use `gsap.ticker` as the single render loop — it guarantees tweened values are fresh before render and pauses with the page.

---

## 3. GSAP IMPLEMENTATION

**Recommendations:** fixed full-screen canvas (`position: fixed; inset: 0`), an empty `#scroll-track` div of **height: 650vh** (yields 550vh of scrub travel — the upper end of the 4–6 range, earned by the wire centerpiece), `pin: false`, **`scrub: 0.9`**. Rationale for 0.9: instant scrub (`true`) exposes discrete wheel ticks as stutter on continuous 3D motion; above ~1.5s the piece feels detached from the hand. 0.9 gives the GPU motion a fluid inertia while still feeling directly driven — and it doubles as the temporal easing layer for the all-linear tweens.

```js
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.normalizeScroll(true);            // iOS address-bar jank
ScrollTrigger.config({ ignoreMobileResize: true });

const mm = gsap.matchMedia();
mm.add("(prefers-reduced-motion: no-preference)", buildFull);
mm.add("(prefers-reduced-motion: reduce)", buildReduced);

function buildFull() {
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: "#scroll-track",
      start: "top top",
      end: "bottom bottom",                     // 550vh of travel
      scrub: 0.9,
      pin: false,                               // canvas is position:fixed
      invalidateOnRefresh: true,
      snap: {                                   // only snap the ending closed
        snapTo: v => (v > 0.93 ? 1 : v),
        duration: { min: 0.2, max: 0.6 },
        delay: 0.1, ease: "power1.inOut",
      },
      onUpdate: self => {                       // velocity flourish (optional)
        U.flow = gsap.utils.clamp(0, 1, Math.abs(self.getVelocity()) / 4000);
      },
      // markers: true,                         // dev only
    },
  });

  // Absolute positions = scroll fractions. Total duration = 1.0.
  tl.addLabel("hero", 0)
    .to(U, { camZ: 4.6, duration: 0.10 }, 0)
    .to(U, { camYaw: -0.14, duration: 0.26 }, 0)

    .addLabel("particleize", 0.08)
    .to(U, { dissolve: 1, duration: 0.16 }, 0.08)
    .to(U, { erode: 1, duration: 0.14 }, 0.095)          // seam offset
    .to(U, { wireAlpha: 1, duration: 0.12, ease: "sine.inOut" }, 0.10)
    .to(U, { bloom: 0.9, duration: 0.16, ease: "sine.inOut" }, 0.10)

    .addLabel("wires", 0.22)
    .to(U, { growth: 1, duration: 0.34 }, 0.22)
    .to(U, { bloom: 1.3, duration: 0.03, ease: "power2.out" }, 0.23)  // wow #1 pulse
    .to(U, { bloom: 1.05, duration: 0.04 }, 0.26)
    .to(U, { twist: 1, duration: 0.22, ease: "sine.inOut" }, 0.26)
    .to(U, { camY: -5.0, lookY: -5.4, duration: 0.34 }, 0.24)
    .to(U, { camZ: 5.6, duration: 0.16 }, 0.26)
    .to(U, { camYaw: 0.18, duration: 0.32 }, 0.24)
    .to(U, { fog: 0.045, vignette: 0.50, bloom: 1.15, duration: 0.20 }, 0.30)

    .addLabel("converge", 0.54)
    .to(U, { converge: 1, duration: 0.18, ease: "power3.in" }, 0.54)  // the snap
    .to(U, { twist: 0, duration: 0.16, ease: "sine.out" }, 0.54)
    .to(U, { camZ: 4.2, duration: 0.16 }, 0.46)
    .to(U, { camY: -6.0, lookY: -6.0, duration: 0.16 }, 0.56)
    .to(U, { camZ: 3.8, camYaw: -0.05, duration: 0.16 }, 0.56)
    .to(U, { bloom: 1.45, duration: 0.10, ease: "power1.in" }, 0.60)

    .addLabel("harden", 0.72)
    .to(U, { harden: 1, duration: 0.14, ease: "power1.inOut" }, 0.72)
    .to(U, { reveal: 1, duration: 0.12 }, 0.76)                      // seam offset
    .to(U, { wireAlpha: 0, duration: 0.12, ease: "sine.in" }, 0.78)
    .to(U, { bloom: 0.55, duration: 0.18, ease: "power2.out" }, 0.74)
    .to(U, { glint: 1, duration: 0.08 }, 0.84)
    .to(U, { fog: 0.015, vignette: 0.70, duration: 0.14 }, 0.74)

    .addLabel("settle", 0.86)
    .to(U, { glassesYaw: 0, glassesPitch: 0, duration: 0.12, ease: "back.out(1.4)" }, 0.88)
    .to(U, { camZ: 3.4, camYaw: 0, bloom: 0.5, duration: 0.12, ease: "sine.out" }, 0.88);

  // HTML labels live in this same timeline — one source of truth (see section 4)
  addLabelTweens(tl);
  return () => tl.scrollTrigger.kill();
}
```

**Asset load → refresh:** build the timeline only inside `Promise.all([loadGLB(head), loadGLB(glasses)]).then(...)`, then `ScrollTrigger.refresh()`. Show a minimal loader (thin pulsing line, same visual language as the progress indicator) until then.

**Resize:** `camera.aspect` + `renderer.setSize` + `composer.setSize`, then `ScrollTrigger.refresh(true)` (safe mode). With a fixed canvas and an empty track, refresh is cheap.

**Reduced motion (`buildReduced`):** same scroll track, but: no camera travel (locked product framing per scene), no twist/idle/bloom pulses; the journey collapses to two gentle scrubbed crossfades — solid head → dim particle cloud (static) → solid glasses — at 0.0–0.4 and 0.6–1.0. Labels keep their fades (opacity-only). `gsap.matchMedia()` handles teardown/rebuild automatically if the OS setting changes.

---

## 4. POLISH LAYER

**HTML labels** — 4 labels, fixed-position, uppercase, `letter-spacing: 0.32em`, 11px mono/grotesk, white at 70%, with a one-line 9px caption at 35%. Driven from the master timeline (windows are defined in progress space, so separate triggers buy nothing). Each: `autoAlpha 0→1` + `y: 12→0` on entry (`sine.out`), `autoAlpha→0` + `letterSpacing 0.32em→0.44em` on exit — the tracking expansion makes the text itself disperse, rhyming with the particles.

| Label | Copy | Caption | Window (in/hold/out) |
|---|---|---|---|
| L1 | `CARVED 1504` | `MICHELANGELO — DAVID` | 0.02 / 0.05–0.07 / 0.09 |
| L2 | `299,952 VERTICES` | `DISSOLUTION` | 0.13 / 0.16–0.21 / 0.24 |
| L3 | `DRAWN INTO WIRE` | `REFORMATION` | 0.34 / 0.37–0.46 / 0.50 |
| L4 | `RECAST 2026` | `EDITION 001 — EYEWEAR` | 0.92 / 0.96–1.0 (no out) |

L2's vertex count is the head's true count — the kind of techy detail this aesthetic rewards. L1/L4 bookend (`CARVED 1504` / `RECAST 2026`). Positions: L1–L3 lower-left (24px inset); L4 centered below the glasses.

**Progress indicator:** fixed right edge (24px inset), vertical, 40vh tall, 1px wide, white@12% track; fill scaled via `gsap.quickSetter("#progress-fill","scaleY")` from `self.progress` in `onUpdate` (transform-origin top). Five 3px tick marks at stage boundaries (0.10, 0.26, 0.56, 0.74, 0.88) that step from 25% → 60% opacity once passed.

**Secondary arcs (already woven into the stage map):** bloom 0.35 → 0.9 → 1.15 → 1.45 (peak at the convergence snap) → 0.50 simmer; fog 0.02 → 0.045 (descent depth) → 0.015 (clear ending); vignette 0.65 → 0.50 (tunnel) → 0.70 (open). The velocity-driven `U.flow` uniform (from `getVelocity()`) can stretch particle streaks slightly during fast scrolls — cheap and delightful, ship it if the shader exposes it.

**The final settle:** four things land within the last 12% to make it conclusive — the `back.out` yaw/pitch settle to dead-center camera-facing, the lens glint sweep finishing just before it, bloom decaying to a steady simmer, and L4 fading in last. After progress hits 1.0, idle breathing continues (glasses float ±0.01u, 6°-period sway) so the end state is alive, not frozen — plus the snap-to-1.0 ensures nobody parks at 97% with a half-revealed frame.

---

## 5. FEEL

**Easing philosophy under scrub.** The scrollbar is the clock, so an ease no longer shapes *timing* — it shapes *spatial distribution along the scroll axis*. Rules used throughout:
1. **Linear (`"none"`) for everything the eye tracks continuously** — wire growth, camera descent, dolly. The user's hand is the easing function; `scrub: 0.9` supplies all the temporal smoothing. Long `power3.inOut` tweens under scrub create dead zones followed by rushes that feel like a broken scroll.
2. **Symmetric gentle eases (`sine.inOut`, `power1.inOut`) for crossfades** — they read identically scrubbed backward.
3. **Aggressive eases only on short spans where asymmetry IS the message:** `power3.in` on convergence (gathering → snap), `back.out(1.4)` on the settle (the sole overshoot, placed at the very end where reverse-scrubbing is rare).
4. **Never elastic/bounce/steps** — multi-crossing eases look like glitches in reverse.
5. **The reversibility test:** every stage must read as a sensible film backward (glasses un-harden, wires retract upward, the head re-forms chin-last). That's not an edge case — it's half of all interaction.

**Pacing ratios** (of 550vh total): HERO 10% (establish + prove scrub works), PARTICLEIZE 16% (destruction is legible fast), **WIRES 34%** — the centerpiece gets the most because it's the only stage of continuous travel, it contains the void passage that resets the viewer's spatial anchor, and it's where the topology swap between a 300k-vert head and a 15k-vert glasses model hides — it needs room to breathe. CONVERGE 20% (the payoff needs a long wind-up for a short snap), HARDEN 14%, SETTLE 12% (endings rushed feel cheap).

**Three engineered wow moments:**
1. **First strands (0.225–0.27):** ~3% of wires (chin/jaw band, shader stagger offset −0.04) shoot down ahead of the mass as lone streaks; a bloom pulse (0.9 → 1.3 → 1.05) and the *first frame of camera descent* fire at exactly that instant, so the eye is yanked downward with them. The transition from "dissolving statue" to "we are falling" happens in one beat.
2. **The convergence snap (0.66–0.72):** three motions resolve on the same scroll instant — `power3.in` convergence whipping the strands into silhouette, camZ 4.2 → 3.8 dolly-in, and camYaw crossing zero — with the bloom peak (1.45) landing at 0.70. A chord, not a note.
3. **The lens glint (0.84–0.92) into the settle:** the specular sweep travels across both lenses the moment the solid surface takes over, announcing "this is glass now," followed by the only overshoot in the piece. Hardness, then stillness.

### Critical Files for Implementation
(Greenfield — proposed paths; only the two GLBs exist today.)
- /Users/vincentfeng/Documents/particles/src/choreography/timeline.js — master ScrollTrigger timeline, the `U` state object, stage labels (section 3 code)
- /Users/vincentfeng/Documents/particles/src/choreography/camera.js — camera rig composition, idle drift layer, gsap.ticker render loop
- /Users/vincentfeng/Documents/particles/src/choreography/overlays.js — HTML labels, progress line, reduced-motion variant via gsap.matchMedia
- /Users/vincentfeng/Documents/particles/src/scene/normalize.js — GLB recenter/rescale pass the choreography coordinates depend on (head 2u @ origin, glasses 1.8u @ (0,-6,0))
- /Users/vincentfeng/Documents/particles/head_of_michelangelos_david_optimised_fixed.glb — source asset (bounds drive all spatial constants above)