Directory verified (only the two GLBs). C's package versions all check out against npm today (three 0.184.0, typescript 6.0.3, vite 8.0.16, gsap 3.15.0, vite-plugin-glsl 1.6.0) — no finding there. Everything below is the adversarial review.

---

# CRITICAL — the combined design does not work as written

## C1. Three incompatible world-space contracts
**Problem:** Each spec defines a different normalized layout.
- A: head 2.0u tall @ origin, glasses **2.4u wide @ (0, −3.5, 0)**
- B: head 2.0u tall @ origin, glasses **1.8u wide @ (0, −6, 0)**
- C: head **1.0u tall**, glasses **~0.65u wide** ("anatomically plausible")

**Evidence:** B's entire camera choreography is numerically derived from its layout (camY descent to −6.0, void-passage proof "at camY −3.2 the frame spans y ∈ [−4.97, −1.43] — head ends at −1.0, glasses begin at ~−5.55", end framing "1.8-unit glasses fill ~47% of frame at camZ 3.4"). With A's glasses at −3.5, the void passage *does not exist* — glasses enter frame while the head is still leaving. With C's 1.0u head, every B constant is wrong by 2×. A's wire-curve constant `D ≈ 3.5–4.5` also assumes A's layout; with B's it's ~5–7 (harmless — P1/P2 scale with D — but the spec text is stale).
**Fix:** Adopt B's layout verbatim (head 2.0u @ origin, glasses 1.8u wide @ (0,−6,0), facing +Z). A's sampling/curve code is layout-parametric and adapts for free; A's "2.4 wide / −3.5" and C's "1.0 tall / 0.65 wide" are deleted. C's `normalize.ts` implements B's numbers.

## C2. The uniform contract is broken — B's timeline cannot drive A's shaders
**Problem:** Name and semantic mismatches across all three, plus two of A's load-bearing uniforms are never driven.
- A: `uDissolve, uScatter, uGrow, uRelease, uTwist, uFuse, uHarden, uReveal, uTime`
- B: `dissolve, erode, wireAlpha, growth, twist, converge, harden, reveal, glint` — **no scatter, no release**; adds `erode`/`wireAlpha`/`glint` which don't exist in A.
- C: `uDissolve, uWireGrow, uFuse, uHarden` — different name for grow, missing five.

**Evidence:** A's seam-B precondition is explicit: "as `uHarden` rises... `h=t→1`, each wire's remaining energy is a stationary point sitting exactly on its sampled surface position." But `t = clamp(uRelease * st, 0, h)` — **`t` only rises if `uRelease` rises, and B never tweens it.** As specced, wires stay anchored to off-screen head positions through fuse/harden; the collapse-onto-glasses that makes seam B seamless never happens. Likewise `uScatter` (particle lift during dissolve) is never driven — particles sit frozen on the eroding surface in S1.
**Fix:** One canonical table in `state/uniforms.ts` (C owns the file, A's names win): `uDissolve, uErode (new, see C3), uScatter, uGrow, uRelease, uTwist, uFuse, uHarden, uReveal, uWireAlpha (new, B needs a global fade), uGlint, uTime`. B adds two tweens: `scatter: 0→1` over 0.10–0.24, `release: 0→1` over ~0.58–0.80 (the "packet detaches and travels" beat lands inside converge/harden, which is also what empties the upper frame). Mapping: B `growth→uGrow`, `converge→uFuse`, B's bloom/fog/vignette/cam stay JS-side.

## C3. Seam A (head→particles) pops, four independent ways
This is the seam the pitch lives on, and as specced it fails:

**(a) A's dissolve field is sign-inverted.** `f = 0.6·noise + 0.4·(1 − (y−yMin)/height)` gives the **bottom** the *highest* f; with `if (f < uDissolve) discard`, lowest-f points erode first → **the head erodes top-down**, contradicting A's own prose ("erodes chin-up") and B's mandate ("bottom dissolves first — mandatory: it pre-motivates the downward wire flow"). Fix: drop the `1 −`, i.e. `0.4·(y−yMin)/height`.

**(b) A's particle birth lags pixel death.** Solid fragment at field value `dBias` discards the instant `uDissolve` crosses `dBias`; the tip's `born = smoothstep(dBias, dBias+0.06, uDissolve)` is **0 at that instant** and only completes 0.06 later. There's a window where neither solid nor particle is visible — the opposite of B's seam rule ("a particle must already exist before the solid fragment beneath it discards"). Fix: birth band on the *early* side — `born = smoothstep(dBias − 0.06, dBias, uDissolve)` — and/or implement B's offset properly via (c).

**(c) B's dissolve/erode tweens run at different rates and the lead inverts.** `dissolve` 0.08–0.24 (Δ0.16), `erode` 0.095–0.235 (Δ0.14). Solve `(p−0.08)/0.16 = (p−0.095)/0.14`: they cross at **p = 0.20**. After that, erode *leads* dissolve — for the top quarter of the head, solid pixels die before particles are born. Fix: equal durations (both 0.16), offset start only, so the lead is constant. This also requires the head patch to read a separate `uErode` while particle birth reads `uDissolve` — A's single-uniform design can't express B's offset at all.

**(d) Bias range overflow: the last-born particles never appear and edge glow leaks into the hero/end shots.** With `uDissolve` capped at 1.0, a wire with `dBias = 0.97` reaches `born = smoothstep(0.97, 1.03, 1.0) ≈ 0.5` — permanently half-dead; same for `absorb` at `rBias` near 1 (band `rBias..rBias+0.05` overruns `uReveal=1`), saved only by a hard visibility toggle at reveal=1 → visible pop. Worse, the glow terms are unbounded at rest: at `uDissolve = 0`, head fragments with f < 0.08 already glow at emissive 3.0 (a hot blotch on the untouched hero head); at `uReveal = 1`, glasses fragments with f > 0.92 (temple tips — the *highest*-f region) glow forever in the final product shot (`edge = 1 − smoothstep(uReveal−0.08, uReveal, f)` never returns to 0). Fix: remap both biases into [0.02, 0.92] in JS, and gate both edge-glow terms: head `edge *= smoothstep(0.0, 0.02, uErode)`, glasses `edge *= (1 − smoothstep(0.93, 1.0, uReveal))`.

## C4. Stagger math: ~half the wires never reach the glasses
**Problem:** A: `h = clamp(uGrow * st, 0, 1)` with `st = mix(0.85, 1.15, seed)`. For any seed < 0.5, `st < 1` → at `uGrow = 1.0`, `h ≤ 0.97...0.85` — those wires terminate mid-air, short of `G`, forever. Fuse and seam B are geometrically impossible for half the bundle. Same bug in `t`/`uRelease`.
**Evidence:** A's own uniform table says `uGrow` is "0→1"; B tweens `growth: 0→1`.
**Fix (pick one):** `st = mix(1.0, 1.3, seed)` (stagger only ever speeds up), or B drives `growth: 0→1.18`. The first is cleaner — no timeline change.

## C5. Two competing particle architectures
**Problem:** C specs a standalone `ParticleSystem.ts` — 65,536 Points with "dual-anchor attributes" and its own `particles.vert/frag.glsl` — alongside `WireSystem`. A's architecture has no such system: in A, *the wire IS the particle* (h=t=0 collapse), with tips + dust providing the dots. These are mutually exclusive representational schemes; building both means two seams to tune twice and a representational handoff A's design explicitly exists to avoid ("no representational switch anywhere, which is why it can't pop").
**Fix:** Delete C's ParticleSystem and particle shaders. A's wires/tips/dust is the system. C's 65k count survives only as a reference point for dust sizing.

## C6. Glasses pose vs. sampled targets — tips harden onto the wrong surface
**Problem:** B poses the glasses at `glassesYaw −0.17, glassesPitch +0.06` from S0 through 0.88, and rotates head/glasses with an always-on additive idle micro-rotation (±2° yaw). A samples `aTarget` from world-baked geometry — i.e., the *unrotated* pose. During reveal, tips shrink at positions ~10° rotated away from the rendered mesh surface; the materializing solid appears visibly offset from the particles claiming to become it. Same class of bug at seam A: the head mesh idles ±2° while `aHead` birth positions are static — tips spawn floating off the rotating surface.
**Evidence:** A: "`aTarget` is on-surface by construction — no shrink-wrap step needed" — true only if the rendered mesh never moves relative to the sampled frame. B §2: "The head/glasses also get an idle micro-rotation... applied the same additive way."
**Fix (minimal):** (1) Bake B's initial glasses pose into the geometry *before* sampling, so rendered mesh and `aTarget` agree through 0.88; the settle rotation starting at 0.88 is safe because wires/tips visibility-toggle off at `uReveal = 1` (=0.88). (2) Idle motion lives on the **camera only** — no mesh idle rotation, ever. (Alternative if mesh idle is sacred: pass the model matrix as a uniform and transform H/G in the wire shader — more plumbing, not worth it for ±2°.)

---

# IMPORTANT — will ship broken or ugly if not addressed

## I1. B's timeline has overlapping tweens on the same property — GSAP will fight itself
**Evidence:** `camZ`: tween 5.6→4.2 over **0.46–0.62** and tween →3.8 over **0.56–0.72** — both alive 0.56–0.62. `camYaw`: tween to −0.14 over **0.00–0.26** and tween to +0.18 over **0.24–0.56** — both alive 0.24–0.26. With default overwrite, both write every tick (insertion order wins, start values lock at first play) → visible jumps, worse when scrubbing backward. Also spec-internal drift: §1 says twist relaxes 1→0.65 over 0.48–0.58, but the timeline code has no such tween (it goes 1→0 at 0.54).
**Fix:** Make every property's keyframe spans strictly non-overlapping (end camZ's dolly-out at 0.56, start camYaw's swing at 0.26), or use a single `keyframes`-style tween per property. Reconcile the twist-relax text with the code (add the 0.48–0.58 relax tween or delete the prose).

## I2. Fog: A forbids it, B depends on it, and THREE fog + additive blending is wrong anyway
**Evidence:** A §5: "No fog." B tweens `fog 0.020→0.045→0.015` and leans on it: "strands above dissolve into depth — sells infinite fall." Even if added, `scene.fog` doesn't apply to A's ShaderMaterials without fog chunks, and mixing additive fragments toward any non-black fog color adds uniform haze/banding over the whole frame.
**Fix:** Implement B's intent as a `uFogDensity` uniform in the wire/tip shaders attenuating `vAlpha` by view distance (fade to zero contribution, which is correct under additive). B's fog values re-tuned against that. No `scene.fog`.

## I3. Wire count and the perf budget disagree by 10×, and C's budget table omits half of A's draws
**Evidence:** A: 20,480 wires × 25 verts = 512k verts (math checks out: 983,040 indices ✓). C budgets **2,048 × 24 = 98k verts @ ~0.5 ms** and never accounts for A's 20k tips, 32k dust, or the second full 100k-tri back-shell head draw (~another 0.6 ms). A's ALU estimate is also undercounted: `snoise3` is vec3-valued = 3 scalar simplex evals ≈ 180+ ALU/vertex, not part of "~60 scalar ALU" — call it ~2.5–3 ms of vertex work at 512k verts on Iris Xe, not noise. Still inside C's 10 ms GPU budget, but the table as published is fiction for the fuse phase.
**Fix:** Make N_WIRES the tier knob both specs already gesture at: HIGH 20,480 / MID 8,192–10,240 / LOW 2,048 (A's 4096-wide DataTexture layout and `texel()` bit-math tolerate any count ≤ 20,480). Rerun C's budget with tips+dust+back-shell included; acceptance test stays the fuse phase.

## I4. Dust velocity is time-integrated — breaks scrub reversibility and A's own stateless rule
**Evidence:** A §3: dust "on birth they get normal-direction velocity + slow downward drift" — velocity implies integration over `uTime`. Scrub backward and the dust keeps drifting forward; park the scroll and dust positions diverge from the dissolve front. Contradicts the project constraint ("everything per-frame must be GPU-side uniforms") and B's reversibility test ("every stage must read as a sensible film backward").
**Fix:** Parameterize dust displacement by scroll progress since birth — `offset = N · k · max(0, uDissolve − dBias)` plus a small `uTime` *oscillation* (oscillation is fine; net drift is not).

## I5. LOW tier deletes bloom, but A's wire aesthetic IS bloom
**Evidence:** A: "the bloom IS your line width — a 1px HDR-bright line blooms into a 2–4px glowing filament." C LOW: "none — skip composer entirely... the particle sprite's soft radial falloff... gives ~80% of the look" — true for **points**, false for **1px lines**, which on LOW (DPR 1.25, MSAA 0) become barely-visible crawling hairlines; HDR values just clip. Also LOW's 768 wires → 768 tips makes the dissolve a near-empty constellation.
**Fix:** On LOW, shift the look points-forward: keep dust count high (points are cheap), render wires as short "pearl chains" (points along the curve) or fatten line alpha and accept the thinner look; or keep one quarter-res bloom-only composite (a single downsample+blur+add is far cheaper than full UnrealBloom). Decide in week-1 device testing, but do not ship the spec'd LOW as-is.

## I6. The funnel waist will nuclear-detonate under additive blending
**Evidence:** A's pinch pulls 20,480 additive wires into a waist at 30% radius exactly when B peaks bloom strength at 1.45 (0.70). Thousands of overlapping HDR fragments sum unbounded → ACES clips to a featureless white core with a screen-filling bloom flare. Possibly "wow," more likely "blown-out blob" — and it's the money shot.
**Fix:** Energy conservation in the shader: `vAlpha *= mix(1.0, 0.3, pinch)` (or scale by estimated local density via `uFuse`). One line; tune on the debug scrub slider parked at 0.68.

## I7. Dissolve mechanism contradiction: per-vertex attribute (C) vs per-fragment field (A)
**Evidence:** C §4: head patch "discards triangles past a **per-vertex threshold attribute**"; A §4a: per-fragment analytic noise field evaluated in world space, mirrored in JS at sample points. These produce different erosion patterns; only A's matches the particle biases by construction (samples lie on faces, not at vertices).
**Fix:** A wins. C's `chunks/dissolve.glsl` shared-include idea is kept — it's how A's "identical formula" requirement is enforced across the two patches, the wire shader, and the JS port.

## I8. Scroll plumbing: three small but direct contradictions
**Evidence:** Track height 650vh (B) vs 600vh (C). Scrub 0.9 (B, with rationale) vs 0.6 (C, with rationale). `ScrollTrigger.normalizeScroll(true)` unconditional (B) vs "opt in, don't default — it has side effects" (C, correct: it hijacks native scrolling and misbehaves with some trackpads/a11y tools).
**Fix:** 650vh (B owns pacing; the wire centerpiece earned it). Scrub 0.9 (B owns feel; C's 0.6 rationale is the same argument with a smaller number). normalizeScroll opt-in behind iOS touch detection after device testing (C wins).

## I9. Render-loop and file-tree ownership collide
**Evidence:** B's `camera.js` registers the `gsap.ticker` callback and calls `syncUniformsAndRender()`; C's `App.ts` claims "composer.render() is called in exactly one place (App.render)". A ships `.js` files under `src/gl/`; C mandates TypeScript under `src/core|scene|scroll`; B proposes `src/choreography/`. Three trees, two render-loop owners, two languages.
**Fix:** C's tree + TypeScript wins (it's the architecture spec). One ticker callback in `App.ts` that: applies B's camera composition (from `camState` extended with B's `camYaw/lookY` + additive idle), copies nothing (uniforms are tweened in place per C), renders. A's modules map: `Stage.js→core/Stage.ts`, `SamplingPipeline.js→assets/normalize.ts + scene/sampling.ts`, `WireSystem.js→scene/WireSystem.ts`, `SeamMaterials.js→scene/HeadMesh.ts + GlassesMesh.ts`. B's timeline → `scroll/Timeline.ts`.

## I10. Tips z-fight the surfaces they sit on
**Evidence:** A: tips end "exactly on its sampled surface position" with `depthTest: true` while the revealed glasses (and the eroding head, at birth) write depth at the same z → equal-depth flicker, shimmering through the absorb window. Note also `uTexB` stores no glasses normal, so the obvious fix (offset along surface normal) has no data to use.
**Fix:** Push tips/wire-endpoints toward the camera by a small view-space epsilon in the vertex shader (`gl_Position.z -= 0.001 * gl_Position.w` or mvPosition nudge). One line, no new data.

---

# NICE-TO-FIX

## N1. "Particles in front of the lens are unaffected" is false
A draws the lens (NormalBlending, depthWrite off, renderOrder 20) *after* additive particles; lens fragments don't depth-test against particles (which wrote no depth), so the lens blends over particles that are physically in front of it, dimming them by ~0.75 inside the lens silhouette. Unsolvable exactly without depth peeling; at alpha 0.25 it's mild, and lens-targeted wires already fade early. Accept, or fade any wire whose `uu > 0.9` slightly as `uReveal` rises. Document the artifact; don't claim correctness.

## N2. B's "wow #1" pulse occupies ~3% of scroll (~16vh ≈ 130 px of trackpad)
A bloom pulse keyed to absolute progress 0.23–0.26 is scroll-speed-dependent: invisible at slow scrub, a strobe at fast. Fix: widen to ~6% or modulate by `U.flow` (velocity) so it's a flourish, not a keyframe. Same caution applies to the 0.08-wide glint.

## N3. A's "≤7 scene draws" miscounts
`mergeGeometries` with material groups still issues one draw per group — frame+trim is 2 draws minimum (different materials), so it's 8, and on MID/HIGH that's irrelevant. Fix the claim, not the code.

## N4. B's camera-tracking math assumes a clean wavefront that doesn't exist
"Tips ride ~1.1–1.2 units below camera center, pinned to the lower third (verified at p=0.40, y=−3.49)" uses a linear-altitude model; the actual front is a cubic Bézier with ±15% stagger and head anchors spread over 2 full units of Y — the wavefront is a ragged band >1.5 units tall (and Bézier altitude at p=0.40 is ~−3.3, not −3.49). The framing intent is fine; the precision is false. Re-derive camY keyframes empirically with the debug master-scrub slider (C's risk-1 mitigation, which is the single best idea in any of the three specs — keep it).

## N5. Meshopt 8-bit octahedral normals on the hero head
The opening shot is a full-frame untextured marble surface under rim light — 8-bit oct normals can band on smooth curvature. Fix: `--compress meshopt` but keep head normals at higher precision (gltf-transform `--quantize-normal 12` or exempt normals); costs ~300 KB.

## N6. MSAA 2 at MID with 1px twisting lines
Sub-pixel lines under rotation crawl badly at 2×; A assumes 4×. The grain pass masks some of it. Prefer MSAA 4 at MID (the budget table shows headroom); demote MSAA before demoting DPR in the quality ladder.

## N7. Duplicate lens-glint mechanisms
A: one-shot envMapIntensity ×3 "ping" around `uReveal ≈ 0.9`; B: `glint` uniform sweeping 0.84–0.92. Two implementations of one moment. Keep B's `uGlint` as the single driver; A's material patch consumes it (sweep a fresnel/specular boost across X by `uGlint`).

## N8. `ignoreMobileResize` (B) vs custom debounced height-tolerant refresh (C)
Redundant solutions to the iOS URL-bar problem. Keep B's `ScrollTrigger.config({ ignoreMobileResize: true })` for ScrollTrigger; keep C's coalesced resize only for renderer/composer sizing; delete C's custom refresh-skip logic.

---

# UNIFIED DECISIONS (one line each)

1. **Layout:** B wins — head 2.0u @ origin, glasses 1.8u wide @ (0,−6,0), facing +Z; A's 2.4u/−3.5 and C's 1.0u/0.65 deleted.
2. **Glasses pose:** initial yaw −0.17/pitch 0.06 baked into geometry before sampling; settle rotation untouched (starts at 0.88, after wires die at reveal=1).
3. **Idle motion:** camera only; meshes never idle-rotate.
4. **Particle architecture:** A's unified wires/tips/dust; C's ParticleSystem.ts and particles.*.glsl deleted.
5. **Counts:** wires 20,480/8,192/2,048 by tier (HIGH/MID/LOW); dust stays ≥32k on all tiers (points are cheap and carry the LOW look).
6. **Uniform contract:** A's names + `uErode`, `uWireAlpha`, `uGlint` added; `uScatter` (0.10–0.24) and `uRelease` (0.58–0.80) tweens added to B's timeline; B's `growth→uGrow`, `converge→uFuse`; C's `uWireGrow` deleted.
7. **Stagger:** `st = mix(1.0, 1.3, seed)` so all wires reach h=1 at uGrow=1.
8. **Dissolve field:** A's formula with the Y term un-inverted (`0.4·(y−yMin)/height`), biases remapped to [0.02, 0.92], birth band moved early (`dBias−0.06..dBias`), edge-glow gated at both rest states.
9. **Seam offsets:** two uniforms (`uDissolve`/`uErode`, `uHarden` lead on `uReveal`), equal tween durations, constant start offset — never different rates.
10. **Dissolve mechanism:** A's per-fragment analytic field; C's per-vertex threshold attribute deleted; C's shared `chunks/dissolve.glsl` include kept as the enforcement mechanism.
11. **Fog:** no `scene.fog`; B's fog arc becomes a `uFogDensity` distance-fade-to-zero in the wire/tip shaders.
12. **Funnel:** alpha energy-conservation `vAlpha *= mix(1, 0.3, pinch)`.
13. **Scroll:** 650vh track, scrub 0.9, snap-to-1.0 kept, `normalizeScroll` opt-in on touch after testing, ScrollTrigger created only post-load (B+C agree).
14. **Timeline hygiene:** no overlapping tweens on any single property; camZ/camYaw keyframes re-spanned.
15. **Render loop:** single `gsap.ticker` callback owned by `App.ts`; B's camera composition runs inside it.
16. **Language/tree:** TypeScript, C's file tree; A's `src/gl/*` and B's `src/choreography/*` mapped into it.
17. **Lens:** render order/blending per A; B's `uGlint` is the only glint mechanism; the front-particle dimming artifact is accepted and documented.
18. **Bloom:** A's pipeline (threshold 0.85, HalfFloat, OutputPass last) with B driving strength; LOW tier gets a points-forward look or a one-pass cheap bloom — never bare 1px lines.
19. **Assets:** C's meshopt pipeline kept, head normals at higher precision.
20. **Versions:** C's package.json verified correct today; pin `three` exact as specced.
21. **Tooling kept:** debug master-scrub slider + lil-gui + stats-gl behind `?debug` (this is the tool every CRITICAL fix above gets tuned with).
22. **v1 cuts:** C's ParticleSystem, C's runtime demotion ladder beyond DPR-step-down, B's `U.flow` velocity streaks, C's bake-anchors script and Worker fallback, A's envMap ping (superseded by uGlint).

### Critical Files for Implementation
- /Users/vincentfeng/Documents/particles/src/state/uniforms.ts — the canonical uniform contract that resolves C2/C3/I7 (single source of truth all three workstreams write/read)
- /Users/vincentfeng/Documents/particles/src/assets/normalize.ts — B's layout numbers + glasses pose baked pre-sampling (C1/C6) + bias remap (C3d)
- /Users/vincentfeng/Documents/particles/src/scene/WireSystem.ts — stagger fix (C4), funnel alpha conservation (I6), fog-as-shader-fade (I2), tip depth bias (I10)
- /Users/vincentfeng/Documents/particles/src/scroll/Timeline.ts — B's timeline with non-overlapping property spans (I1) plus the missing uScatter/uRelease tweens (C2)
- /Users/vincentfeng/Documents/particles/src/scene/HeadMesh.ts — dissolve field sign fix, uErode split, birth-band/edge-glow gating (C3a–d)