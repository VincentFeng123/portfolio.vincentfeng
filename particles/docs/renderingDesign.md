Directory confirmed: only the two GLBs. Below is the complete rendering/shader architecture design.

---

# GPU Rendering System: David Head → Wires → Sunglasses

## 0. Scene-space contract (other engineers build against this)

After load-time preprocessing, everything lives in normalized scene units:

- **Head**: recentered to origin (subtract bbox center `(7.26, -30.3, 175.37)`), scaled so height = **2.0 units**, placed at `(0, 0, 0)`, facing +Z.
- **Glasses**: every mesh baked to world space (`updateWorldMatrix(true,true)` then `geometry.clone().applyMatrix4(mesh.matrixWorld)` — this kills the Sketchfab axis-swap rotations and the 0.245/0.01 node scales), recentered, scaled so width = **2.4 units**, placed at `(0, -3.5, 0)`, facing +Z, temple arms extending −Z.
- The wire bundle's vortex axis is the world Y axis (x=z=0), which passes through both objects' centers. Camera framing/travel is choreography's problem; everything below is camera-independent.

All stage uniforms live in **one shared `uniforms` object** passed by reference into every material (head patch, wires, tips, dust, glasses patch). The scroll engineer writes ~9 floats per frame; nothing else crosses the boundary.

---

## 1. SAMPLING

### Counts and budget

- **N_WIRES = 20,480** (exactly 4096 × 5 — sized to the data-texture layout below).
- **N_TIPS = 20,480** (one glowing point sprite per wire — the wire's leading "energy packet").
- **N_DUST = 32,768** (cheap secondary points, alive only during dissolve/scatter, for density at seam A).
- Wires: 24 segments each → 25 shared verts/wire → **512,000 vertices, 983,040 Uint32 indices, ONE indexed `THREE.LineSegments` draw call** (`gl.LINES`).

Perf justification: the system is vertex-bound. 512k verts × (~60 scalar ALU: one cubic Bézier, one 2D rotation, 3 simplex evaluations, 3 `texelFetch`es) ≈ 30M vertex ALU/frame — comfortable at 60fps on any 2018+ discrete GPU or Apple Silicon, since 1px additive lines have near-zero fill cost and the bloom pass dominates fragment time anyway. Points are noise. A `QUALITY` constant halves N_WIRES and drops segments to 16 for low-tier GPUs (288k verts).

### Why native 1px lines, not Line2 instanced quads

Line2/LineSegments2 at this count = ~492k quad instances ≈ 2M verts plus real fill cost. On a near-black background with **additive blending + bloom, the bloom IS your line width** — a 1px HDR-bright line blooms into a 2–4px glowing filament, which is exactly the wanted aesthetic. Cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` so lines don't get too thin on 3x displays. Decision: native `LineSegments`, save the budget.

### Point-pair generation (head point i → glasses point i)

At load, once, on CPU:

1. **Head**: `MeshSurfaceSampler` (`three/addons/math/MeshSurfaceSampler.js`) on the 300k-vert Mesh0 only (ignore `solid_volume_fill_mesh` for sampling; see §4a for its real job). Sample 20,480 positions + normals. Area-weighted by default — correct.
2. **Glasses**: one sampler per material group with quotas: **frame meshes 80%, tan trim 8%, lens 12%**. Lens-targeted wires never "harden" — they fade out early (transparent glass must not appear to be built from opaque particles, see §4b).
3. **Matching — azimuth rank pairing** (this is what makes the flow look intentional):
   - Head key: `θ_h = atan2(x, z)` in the centered head frame (front-centered, signed −π..π).
   - Glasses key: `θ_g = atan2(x, z − zPivot)` where `zPivot` = front of the glasses bbox. Pushing the pivot to the front face means the temple arms (which extend in −Z) get angles near ±π — so **back-of-head points wrap around onto the temple arms, face points land on the front frame and lenses**. Left cheek → left lens. Intentional by construction.
   - Sort both arrays by θ, pair rank↔rank. Monotonic angular order means wires never cross azimuthally; with a globally coherent vortex twist (§3) the bundle reads as one organized stream, not spaghetti.
   - **Vertical refinement**: walk the paired arrays in consecutive windows of 80 (≈ one θ-slice), re-sort each window's head points and glasses points by Y descending, re-pair. Crown of head → top frame edge; chin → bottom rim. Kills vertical crossings within slices.

### Per-wire data: DataTextures, not fat attributes

Duplicating 17 floats across 25 verts/wire = 34 MB of attributes. Instead store per-wire data in **three RGBA32F `DataTexture`s, 4096 × 5** (WebGL2 guarantees vertex texture fetch), and give the line geometry only `position = (wireIndex, u, 0)`:

| Texture | rgb | a |
|---|---|---|
| `uTexA` | `aHead` (head surface pos, scene space) | `aSeed` (0..1 random) |
| `uTexB` | `aTarget` (glasses surface pos, scene space) | `floor(w)` = matId (0 frame / 1 lens / 2 trim), `fract(w)` = `aRevealBias` clamped 0.001–0.999 |
| `uTexC` | `aHeadNormal` | `aDissolveBias` |

Tips (`Points`, 20,480 verts, `position.x = wireIndex`) fetch the **same textures** — single source of truth, so a tip and its wire can never disagree about where the energy is.

**The two biases are the seam glue** (precomputed once in JS):
- `aDissolveBias = field_head(aHead)` where `field_head(p) = 0.6 * snoise01(p * 1.8) + 0.4 * (1 − (p.y − yMin)/height)` — the *identical* formula the head's dissolve fragment shader uses (port Gustavson simplex 3D to JS; small numeric mismatch is absorbed by the 0.06-wide edge band).
- `aRevealBias = field_glasses(aTarget)` where `field_glasses(p) = 0.5 * snoise01(p * 3.0) + 0.5 * radialDist(p)/maxDist` — glasses materialize from the bridge outward to temple tips, matching wire arrival order.

Geometry memory: 512k × vec3 position (6 MB) + 4 MB index + 1.3 MB textures. Set `geometry.boundingSphere` manually and `frustumCulled = false` on wires/tips/dust (positions are shader-generated).

---

## 2. WIRE GEOMETRY + CURVES

### The curve

Cubic Bézier per wire, **control points computed in the vertex shader** (a few ALU from fetched data — nothing to precompute or store):

```glsl
vec3 H2 = H + N * scatterLift;                      // scatter-displaced head anchor (§3)
float D  = distance(H2, G);                          // ≈ 3.5–4.5 units
vec3 P0 = H2;
vec3 P1 = H2 + N * 0.35 + vec3(0.0, -0.35 * D, 0.0); // leave along surface normal, bend down
vec3 P2 = G  + vec3(0.0,  0.30 * D, 0.0);            // arrive at glasses from above
vec3 P3 = G;
```

This guarantees: wires exit the head perpendicular to its surface (looks like the surface is unraveling), sag downward, and dive vertically onto the glasses.

**Twist is NOT baked into control points.** It is a dynamic rotation about the bundle axis applied to the evaluated point, because it must animate with scroll:

```glsl
float ang = uTwist * 4.0 * uu * (1.0 - uu) * (0.8 + 0.4 * seed); // parabola: 0 at both ends
p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
```

`uu(1−uu)` anchors both endpoints exactly (head and glasses never twist away from their anchors); the shared global angle + tiny seed variance keeps the θ-sorted bundle rotating as one coherent helix — wires twist *together*, no chaotic crossing.

**Convergence funnel** (the "flow together" beat) is a scroll-driven pinch toward the axis in a band of the lower span:

```glsl
float pinch = uFuse * smoothstep(0.30, 0.70, uu) * (1.0 - smoothstep(0.80, 1.0, uu));
p.xz = mix(p.xz, p.xz * 0.30, pinch);   // waist forms above the glasses, releases onto exact targets
```

### Geometry representation

One `BufferGeometry`:
- `position` attribute repurposed: `x = wireIndex` (0..20479), `y = u` (0, 1/24, … 1), `z = 0`. No other attributes.
- Index buffer: per wire, pairs `(base+s, base+s+1)` for s in 0..23 → `gl.LINES` with shared verts.
- **1 draw call** for all 20,480 wires. Plus 1 for tips, 1 for dust, 1 for head front, 1 for head back-shell, 2 for glasses (merged opaque frame+trim via `BufferGeometryUtils.mergeGeometries` grouped by material, lens separate). **≤ 7 scene draws total** + composer passes.

---

## 3. SHADER DESIGN

### Uniform set (each 0→1 unless noted, driven by overlapping scroll ramps)

| Uniform | Meaning |
|---|---|
| `uDissolve` | head erosion threshold; 1 = head fully gone |
| `uScatter` | particle lift off the surface along normals + drift amplitude |
| `uGrow` | leading-edge progress `h` along the curve (wire draws in downward) |
| `uRelease` | tail progress `t`; tail detaches from head, packet travels |
| `uTwist` | vortex angle scalar (0..~2.5 rad effective) |
| `uFuse` | convergence funnel pinch |
| `uHarden` | noise/jitter amplitude → 0, color white-hot → cool silver, tips shrink |
| `uReveal` | glasses materialization threshold; 1 = fully solid |
| `uTime` | seconds, for ambient noise life while scroll is idle |

The whole journey of one wire is just two moving parameters: head-end `h = clamp(uGrow * st, 0, 1)` and tail-end `t = clamp(uRelease * st, 0, h)` with per-wire stagger `st = mix(0.85, 1.15, seed)`. The unifying trick: **every vertex's effective curve parameter is `uu = mix(t, h, aU)`** — vertices clamp into the live span, so:

- `h = t = 0`: all 25 verts collapse to one point at H → *the wire IS a particle* (the tip sprite provides the visible dot, since zero-length GL lines may not rasterize).
- `h` rises, `t = 0`: wire grows downward from the head, anchored — growth reveal with zero alpha tricks.
- `t` rises behind `h`: a glowing packet of length `(h−t)` detaches and travels down the curve.
- `h = t = 1`: wire re-collapses to a point ON the glasses surface — ready to be absorbed by the reveal.

Particles→wires→particles is one continuous system; there is no representational switch anywhere, which is why it can't pop.

### Wire vertex shader (load-bearing core, real GLSL)

```glsl
uniform sampler2D uTexA, uTexB, uTexC;
uniform float uDissolve, uScatter, uGrow, uRelease, uTwist, uFuse, uHarden, uTime;
varying float vTip, vAlpha;

ivec2 texel(int i) { return ivec2(i & 4095, i >> 12); }
vec3 bezier(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  float s = 1.0 - t;
  return s*s*s*a + 3.0*(s*s*t)*b + 3.0*(s*t*t)*c + (t*t*t)*d;
}

void main() {
  int wi = int(position.x);
  float au = position.y;
  vec4 A = texelFetch(uTexA, texel(wi), 0);   // H, seed
  vec4 B = texelFetch(uTexB, texel(wi), 0);   // G, matId+revealBias
  vec4 C = texelFetch(uTexC, texel(wi), 0);   // N, dissolveBias
  vec3 H = A.xyz;  float seed = A.w;
  vec3 G = B.xyz;  float matId = floor(B.w);  float rBias = fract(B.w);
  vec3 N = C.xyz;  float dBias = C.w;

  float born = smoothstep(dBias, dBias + 0.06, uDissolve);   // seam A gate
  float st = mix(0.85, 1.15, seed);
  float h  = clamp(uGrow * st, 0.0, 1.0);
  float t  = clamp(uRelease * st, 0.0, h);
  float uu = mix(t, h, au);

  vec3 H2 = H + N * (uScatter * (0.06 + 0.10 * seed));        // scatter lift
  float D = distance(H2, G);
  vec3 P1 = H2 + N * 0.35 + vec3(0.0, -0.35 * D, 0.0);
  vec3 P2 = G + vec3(0.0, 0.30 * D, 0.0);
  vec3 p  = bezier(H2, P1, P2, G, uu);

  float pinch = uFuse * smoothstep(0.30, 0.70, uu) * (1.0 - smoothstep(0.80, 1.0, uu));
  p.xz = mix(p.xz, p.xz * 0.30, pinch);                       // funnel

  float ang = uTwist * 4.0 * uu * (1.0 - uu) * (0.8 + 0.4 * seed);
  p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz; // vortex

  // organic jitter: free during scatter at the head end, always anchored at glasses end
  float env = mix(uScatter, 1.0, smoothstep(0.0, 0.15, uu)) * (1.0 - smoothstep(0.85, 1.0, uu));
  p += snoise3(p * 2.3 + seed * 17.0 + uTime * 0.15) * 0.05 * env * (1.0 - uHarden);

  vTip   = 1.0 - smoothstep(0.0, 0.35, h - uu);               // bright leading end
  float lensFade = (matId == 1.0) ? (1.0 - smoothstep(0.2, 0.6, uHarden)) : 1.0;
  vAlpha = born * lensFade * mix(0.10, 1.0, vTip);            // dim tail, hot tip

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
```

(`snoise3` = vec3-valued Ashima simplex chunk, shared via a `chunks/noise.glsl` include with the scalar `snoise01` used by both seam materials.)

### Wire fragment shader

```glsl
varying float vTip, vAlpha;
void main() {
  vec3 cold = vec3(0.55, 0.60, 0.68);          // silver, sub-bloom-threshold
  vec3 hot  = vec3(2.2);                       // HDR white — bloom catches this
  vec3 col  = mix(cold, hot, vTip * vTip);
  gl_FragColor = vec4(col * vAlpha, vAlpha);   // additive blending
}
```

Material: `ShaderMaterial { blending: AdditiveBlending, transparent: true, depthWrite: false, depthTest: true }`. Depth-testing against the still-solid head/glasses gives correct occlusion of wires behind geometry for free. Because tips output HDR values > bloom threshold and tails sit below it, **bloom does the bright-tip/fading-tail glow selection automatically — no selective bloom rig needed.**

### Tip sprites (Points)

Same data fetch; position = curve point at `uu = h`. `gl_PointSize = uTipSize * dpr * birth * flash * absorb / -mvPosition.z` where:
- `birth = smoothstep(dBias, dBias + 0.06, uDissolve)` — born exactly when the head surface erodes there;
- `flash = 1.0 + 2.0 * bell(uDissolve, dBias, 0.05)` — brief size/brightness spike at birth (the "spark off the eroding edge");
- `absorb = 1.0 - smoothstep(rBias, rBias + 0.05, uReveal)` — shrinks to nothing exactly as the glasses surface materializes underneath it (seam B).

Fragment: radial `exp(-r*6.0)` soft disc, HDR brightness ~3.0 at flash, additive.

### Dust (Points, seam-A garnish)

32,768 extra head-surface samples with their own dissolve biases; on birth they get normal-direction velocity + slow downward drift, fade over `uGrow`'s ramp, dead by the wire stage. Purely additive sub-pixel sparkle so the 300k-vert head doesn't dissolve into a "sparse" 20k constellation.

---

## 4. THE TWO SEAMS

### 4a. Solid head → particles

**Technique: noise-threshold discard via `onBeforeCompile` on the head's `MeshStandardMaterial`** (keep PBR lighting; don't rewrite it). Inject into the fragment shader:

```glsl
float f = 0.6 * snoise01(vWorldPos * 1.8) + 0.4 * (1.0 - (vWorldPos.y - uYMin) / uHeight);
if (f < uDissolve) discard;                                    // eroded
float edge = 1.0 - smoothstep(uDissolve, uDissolve + 0.08, f); // burning front
totalEmissiveRadiance += vec3(3.0, 3.0, 3.2) * edge;           // HDR — bloom ignites the front
```

The bottom-biased field means the head erodes chin-up, visually "draining" downward into the forming wire stream. Because `aDissolveBias` is the *same field* evaluated at each sampled point, every tip sprite flashes into existence precisely on the glowing erosion front, at the surface, at the same scroll instant the solid disappears there. The bloom-bright edge and the bloom-bright birth flash are the same color and intensity — the eye cannot find the handoff.

**Hollow-shell fix**: discarding front faces exposes the empty interior. Render a second head draw — same geometry, cloned material with `side: BackSide`, same discard logic, but flat near-black output (`vec3(0.015)` unlit) — so mid-dissolve the head reads as a dark solid mass being eaten, not a paper shell. (The GLB's `solid_volume_fill_mesh` is too coarse, 2.5k verts, to substitute; the backface pass is cheaper and exact.)

### 4b. Particles → solid glasses

Mirror of seam A, run in reverse, on the **opaque** glasses materials (`onBeforeCompile` patch):

```glsl
float f = 0.5 * snoise01(vWorldPos * 3.0) + 0.5 * (length(vWorldPos - uGlassesCenter) / uMaxDist);
if (f > uReveal) discard;                                       // not yet materialized
float edge = 1.0 - smoothstep(uReveal - 0.08, uReveal, f);
totalEmissiveRadiance += vec3(2.0, 2.1, 2.4) * edge;            // silver-hot growth front
```

Sequencing that makes it invisible: as `uHarden` rises, jitter amplitude → 0 and `h=t→1`, so each wire's remaining energy is a stationary point sitting *exactly on* its sampled surface position (`aTarget` is on-surface by construction — no shrink-wrap step needed). `uReveal` then sweeps the materialization field from the bridge outward; each tip's `absorb` term shrinks it in the same 0.05-wide band where the surface appears under it. Particle light is replaced by edge-glow light of matched intensity → seamless.

**The transparent lens (alpha 0.25 BLEND, roughness 0)**:
- Lens-targeted wires (matId 1, 12%) **fade out during `uHarden`** instead of hardening — glass must not look assembled from opaque dots.
- Lens does NOT use discard (discard on a blended material reveals as crunchy holes). Instead: `opacity = 0.25 * smoothstep(0.55, 0.9, uReveal)` plus an injected fresnel sheen `pow(1.0 - NdotV, 3.0) * 1.5 * uReveal` so the lens reads on black, and a one-shot specular "ping" (envMapIntensity briefly ×3 around `uReveal ≈ 0.9`) — a bloom flare that *sells* the hardening moment.
- **Render order vs additive particles**: opaque frame (depth-written) → wires/tips (additive, depthWrite off, renderOrder 10/11) → lens **last** (`renderOrder 20`, `transparent: true`, `depthWrite: false`, NormalBlending). Particles behind the lens stay visible, correctly tinted by the lens blend; particles in front are unaffected. Bloom runs post on the composed HDR buffer so it is consistent across the blend — no special casing.

---

## 5. RENDER PIPELINE

### Scene graph & per-object state

| Object | Blend | depthWrite | depthTest | renderOrder | Visible during |
|---|---|---|---|---|---|
| Head front (patched Standard) | opaque | yes | yes | 0 | `uDissolve < 1` |
| Head back-shell (dark, BackSide) | opaque | yes | yes | 0 | `0 < uDissolve < 1` |
| Glasses frame+trim (patched Standard/Physical) | opaque | yes | yes | 0 | `uReveal > 0` |
| Wires (LineSegments) | Additive | no | yes | 10 | `uGrow > 0 && uReveal < 1` |
| Tips (Points) | Additive | no | yes | 11 | `uDissolve > 0 && uReveal < 1` |
| Dust (Points) | Additive | no | yes | 12 | dissolve→grow ramp only |
| Lens | Normal, transparent | no | yes | 20 | `uReveal > 0.5` |

Visibility toggles are flipped from the scroll callback at uniform thresholds — this is real perf, not hygiene: the 512k-vert wire draw is skipped entirely during the solid-head intro and the solid-glasses outro.

### Composer chain

```
EffectComposer (HalfFloatType targets — default since r152; set renderTarget samples: 4 for MSAA)
 ├─ RenderPass(scene, camera)
 ├─ UnrealBloomPass(resolution, strength 0.9, radius 0.6, threshold 0.85)
 ├─ ShaderPass(GradePass)   // vignette + animated film grain (dither — kills banding on near-black)
 └─ OutputPass()            // ACES tone map + sRGB — MUST be last; renderer.toneMapping = ACESFilmicToneMapping
```

Threshold 0.85 + HDR emissives (2.2–3.2) means only erosion fronts, wire tips, reveal edges, and the lens ping bloom — solids and dim tails stay clean. No selective-bloom second scene needed.

Renderer: `{ antialias: false, powerPreference: 'high-performance' }`, `outputColorSpace = SRGBColorSpace`, `toneMappingExposure = 1.1`, pixel ratio capped at 2.

### Background & lighting (gray untextured marble on near-black)

- Background: not pure black — `#050608` with a subtle radial gradient (fullscreen background shader or large inverted gradient sphere); the grain pass dithers away banding from bloom halos. No fog.
- **Environment**: `PMREMGenerator` + built-in `RoomEnvironment` (no HDR asset needed), `scene.environment` with `envMapIntensity ≈ 0.35` on head/glasses — broad soft speculars that make marble and gloss plastic read.
- **Key**: soft white directional, upper-front-left, intensity 1.2.
- **Rims (the money light)**: two cool directionals `(0.8, 0.9, 1.0)` from behind-left and behind-right, intensity ~2.0 — bright silver silhouette edges on the dark field.
- **Guaranteed rim via shader**: inject `pow(1.0 - NdotV, 3.0) * uRimStrength * vec3(0.7, 0.78, 0.9)` into both patched materials' emissive — silhouette glow independent of light angles, and it feeds bloom at grazing edges. Head material: keep `stone_fill` but set roughness 0.45, metalness 0.05 (consider swapping to `MeshPhysicalMaterial` with `clearcoat 0.3` for marble sheen — no UVs needed, all procedural).

### Module layout (rendering-owned files)

- `src/gl/Stage.js` — renderer, composer, lights, environment, the shared `uniforms` hub (the single object scroll choreography writes into).
- `src/gl/SamplingPipeline.js` — GLB loading, world-matrix baking, recenter/normalize, material-quota sampling, θ-rank pairing + window refinement, JS simplex for biases, DataTexture + wire/tip/dust geometry construction.
- `src/gl/WireSystem.js` — wires/tips/dust objects + ShaderMaterials, visibility threshold logic.
- `src/gl/SeamMaterials.js` — the two `onBeforeCompile` patches (head dissolve, glasses reveal) + lens fade/ping.
- `src/gl/shaders/` — `wires.vert.glsl`, `wires.frag.glsl`, `tips.vert.glsl`, `tips.frag.glsl`, `chunks/noise.glsl` (shared snoise01/snoise3, mirrored by the JS port).

Build order: SamplingPipeline (testable with debug `Points` of raw pairs) → WireSystem with uniforms on GUI sliders before any scroll wiring → SeamMaterials → composer polish.

### Critical Files for Implementation

- /Users/vincentfeng/Documents/particles/src/gl/SamplingPipeline.js
- /Users/vincentfeng/Documents/particles/src/gl/WireSystem.js
- /Users/vincentfeng/Documents/particles/src/gl/shaders/wires.vert.glsl
- /Users/vincentfeng/Documents/particles/src/gl/SeamMaterials.js
- /Users/vincentfeng/Documents/particles/src/gl/Stage.js