# Glasses → iPhone Morph (carousel image 1 → 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second scroll-scrubbed morph — the parked glasses particlize and reassemble as `iphone.glb` during the carousel's image1→2 transition — reusing the exact mechanic of the David→glasses morph.

**Architecture:** A self-contained `morph2*` stage (Approach ① from the spec) that reuses the shared GPU/sampler primitives (`MORPH_POINTS_VERT/FRAG`, `SigSampler`, `sigNoise`, `MORPH_NOISE_GLSL`/`MORPH_FIELD_GLSL`, `sigRemapBias`) but has its own uniforms (`morphU2`), state (`MORPH2`), build/timeline/update functions, and an iPhone reveal mesh. The working hero morph (`morph*`/`window.__MORPH`) is left untouched. Everything lives in `title-screen.html` and is parented to `statueGroup` so it rides the parked left-accent transform.

**Tech Stack:** Three.js r0.160.1, GLTFLoader + DRACOLoader, custom GLSL point/erode/reveal shaders, Lenis scroll, puppeteer-core render-verify harness (`fracture-verification/`, server :8123, system Chrome).

**Verification note:** This is WebGL visual work in one large HTML file with **no unit-test framework and no git** (`git` unavailable here). Per the project's established practice (see memory `reference-fracture-render-verify`), verification = the puppeteer render harness + screenshot inspection + the live `window.__MORPH2` hook. "Commit" steps are replaced with "save a `.bak` checkpoint" and render-verify gates.

---

## File Structure

- **Modify only:** `title-screen.html`
  - New code block placed **immediately after** the hero morph block (after `window.__MORPH` at ~line 9207, before `function tick()`): all `morph2*` functions + `MORPH2`/`morphU2`/`window.__MORPH2`.
  - State/uniform declarations (`MORPH2`, `morphU2`) placed **early**, right after `morphPoints`/`morphGlasses` (~line 2519), to avoid TDZ (same reason the hero morph declares early).
  - Edits to: `morphPatchGlassesMaterial` (add optional `uRevealUniform` param), `plateIndexForProgress` (+ hoisted weight consts + `firstMoveWeight`), `updateScrollScene` (call `morph2EvalTimeline`), `tick()` (add `MORPH2.yaw` + `morph2Update(t)`), the `morphKickoff()` call site (add `morph2Kickoff()`), the `SCROLL_CAROUSEL_VH` constant, and the `.scroll-space` CSS height.
- **Maybe add:** `fracture-verification/drive-morph2.mjs` (clone of `drive-morph.mjs` targeting the image1→2 window).

---

## Task 0: Backup checkpoint

**Files:** Create: `title-screen.pre-iphone-<timestamp>.html.bak`

- [ ] **Step 1: Save a backup of the working file**

Run:
```bash
cd "/Users/vincentfeng/Documents/ap art" && cp title-screen.html "title-screen.pre-iphone-$(date +%Y%m%d-%H%M%S).html.bak"
```
Expected: a new `.bak` file appears in `ls title-screen.*.bak`.

- [ ] **Step 2: Confirm the dev server is serving the file**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123/title-screen.html`
Expected: `200` (if not, the user must start the static server on :8123).

---

## Task 1: Declare stage-2 state + uniforms (early, no behavior change)

**Files:** Modify: `title-screen.html` (~line 2519, right after `let morphGlasses = null;`)

- [ ] **Step 1: Add `MORPH2` + `morphU2` declarations**

After the line `let morphGlasses = null;     // solid glasses mesh (child of statueGroup)` insert:

```js
/* ----- Stage 2 (glasses -> iPhone) morph: state + uniforms. Mirror of the hero
   MORPH/morphU, fully independent so the hero morph is untouched & both stay
   scroll-reversible. Declared EARLY (TDZ) like the hero morph. ----- */
const MORPH2 = { ready: false, failed: false, kicked: false, m: 0, yaw: 0 };
const morphU2 = {
  uDissolve: { value: 0 }, uErode: { value: 0 }, uMorph: { value: 0 },
  uScatter: { value: 0 }, uReveal: { value: 0 }, uTime: { value: 0 },
  uSize: { value: 13.0 },
  uPixelRatio: { value: Math.min(1.35, window.devicePixelRatio || 1) },
  uColor: { value: new THREE.Color(0x17120d) }   // same charcoal as the hero morph
};
let morph2Points = null;   // THREE.Points cloud (child of statueGroup)
let morph2Iphone = null;   // solid iPhone reveal mesh (child of statueGroup)
let morph2IphoneGeo = null;   // normalized iphone geometry, stashed by kickoff
let morph2IphoneMaxDist = 0;
// Live-tunable iPhone placement in the glasses' local slot (see morph2Build).
const PHONE_LOOK = { scaleMul: 1.0, offX: 0.0, offY: 0.0, offZ: 0.0, yawDeg: 0 };
```

- [ ] **Step 2: Render-verify the page still loads with no new errors**

Run:
```bash
cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && node drive-morph.mjs t1 "0.31,0.538,0.80" 1100 1400
```
Expected: three lines printed (`m=0`, `m=1`, `m=1`), **no `ERRORS:` line**. (TDZ or typos would surface as a page error here.)

---

## Task 2: Make the reveal-patch helper reusable for stage 2

**Files:** Modify: `title-screen.html:8893-8919` (`morphPatchGlassesMaterial`)

Stage 2's solid iPhone needs the same reveal seam but bound to `morphU2.uReveal`. Generalize the existing helper with an optional uniform param defaulting to the hero's — **zero change to existing call**.

- [ ] **Step 1: Add the `uRevealUniform` parameter**

Change the signature line:
```js
function morphPatchGlassesMaterial(material, maxDist, remap){
```
to:
```js
function morphPatchGlassesMaterial(material, maxDist, remap, uRevealUniform = morphU.uReveal){
```

- [ ] **Step 2: Bind the passed uniform instead of the hardcoded one**

Inside its `onBeforeCompile`, change:
```js
      uReveal: morphU.uReveal,
```
to:
```js
      uReveal: uRevealUniform,
```
(Leave everything else — `fieldGlasses`, the discard/seam — unchanged. The hero call passes no 4th arg, so it still uses `morphU.uReveal`.)

- [ ] **Step 3: Render-verify the hero morph reveal still works**

Run:
```bash
cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && node drive-morph.mjs t2 "0.40,0.49,0.538" 1100 1400
```
Expected: `reveal` rises to ~`1` by `f=0.538`; no `ERRORS:`. Visually open `shots/t2-54.png` — solid glasses present.

---

## Task 3: iPhone normalize helper

**Files:** Modify: `title-screen.html` (new function in the new stage-2 block, placed after `window.__MORPH`)

`morphNormalizeGlasses` scales to 1.8 **wide** (good for wide glasses, wrong for a tall phone). Add a dedicated normalize that scales by the **largest** dimension so the phone keeps proportions and a sane size.

- [ ] **Step 1: Add `morph2NormalizeIphone`** (in the stage-2 block created in Task 4)

```js
/* iphone normalization: bake transforms, merge, center, scale so the LARGEST
   dimension ~= 1.8 (phones are tall/thin; scale by max dim, not width). */
function morph2NormalizeIphone(root){
  root.updateMatrixWorld(true);
  const geos = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', sigToFloat32(o.geometry.attributes.position));
    if (o.geometry.attributes.normal) g.setAttribute('normal', sigToFloat32(o.geometry.attributes.normal));
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    geos.push(g);
  });
  if (!geos.length) throw new Error('iphone: no meshes');
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (!merged.attributes.normal) merged.computeVertexNormals();
  const box = new THREE.Box3().setFromBufferAttribute(merged.attributes.position);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = 1.8 / Math.max(size.x, size.y, size.z, 1e-4);
  merged.translate(-center.x, -center.y, -center.z);
  merged.scale(scale, scale, scale);
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  let maxDist = 0; const p = merged.attributes.position;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = Math.sqrt(x*x + y*y + z*z); if (d > maxDist) maxDist = d;
  }
  return { geometry: merged, maxDist };
}
```

- [ ] **Step 2:** (No standalone verify; covered by Task 6 load.)

---

## Task 4: `morph2Build` — sample glasses (source) + iPhone (target), build cloud + reveal mesh

**Files:** Modify: `title-screen.html` (new stage-2 block after `window.__MORPH`, ~line 9207)

This mirrors `morphBuild` (9004-9153) with these **substitutions** (source = the already-built `morphGlasses`, not David):
- Source geometry/placement come from `morphGlasses` (it stores `.geometry` and its local `.position/.quaternion/.scale`). No `statueGroup`-intact-mesh sampling, no head field, no `morphPatchStatueMaterials`.
- Source sampled positions = glasses local → `applyMatrix4(morphGlasses.matrix)` → statueGroup-local (same frame the hero cloud used).
- Target = iPhone, placed at the **glasses slot** (`morphGlasses` position/quaternion) with `PHONE_LOOK` adjustments; scale chosen so the phone reads at a comparable size to the glasses.
- Source dissolve bias `aD` from `fieldGlasses` over the **glasses local** positions; target reveal bias `aR` from `fieldGlasses` over the **iPhone local** positions.
- Points material bound to `morphU2`; reveal mesh patched via `morphPatchGlassesMaterial(..., morphU2.uReveal)`.

- [ ] **Step 1: Add `morph2Build()`**

```js
/* build (runs once morphGlasses exists AND iphone geometry is loaded) */
function morph2Build(){
  try {
    if (!morphGlasses || !morph2IphoneGeo) throw new Error('morph2: source/target not ready');
    statueGroup.updateMatrixWorld(true);
    morphGlasses.updateMatrix();

    // SOURCE: glasses geometry in statueGroup-local (= glasses local * morphGlasses.matrix)
    const srcGeo = morphGlasses.geometry;
    const srcMat4 = morphGlasses.matrix.clone();           // pos/quat/scale of the parked glasses slot
    const srcBox = new THREE.Box3().setFromBufferAttribute(srcGeo.attributes.position);
    const srcMaxDist = Math.max(1e-4, srcBox.getSize(new THREE.Vector3()).length() * 0.5);

    // TARGET: iphone placed at the glasses slot, sized to a comparable on-screen size.
    const gWidth = Math.max(1e-4, srcBox.getSize(new THREE.Vector3()).x) * morphGlasses.scale.x;
    const iBoxL = new THREE.Box3().setFromBufferAttribute(morph2IphoneGeo.attributes.position);
    const iSizeL = iBoxL.getSize(new THREE.Vector3());
    // match the phone's HEIGHT to ~the glasses width so it reads at a similar scale
    const phoneScale = (gWidth / Math.max(iSizeL.y, 1e-4)) * PHONE_LOOK.scaleMul;
    const phonePos = morphGlasses.position.clone().add(
      new THREE.Vector3(PHONE_LOOK.offX, PHONE_LOOK.offY, PHONE_LOOK.offZ));
    const phoneQuat = morphGlasses.quaternion.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), THREE.MathUtils.degToRad(PHONE_LOOK.yawDeg)));
    const phoneMat4 = new THREE.Matrix4().compose(
      phonePos, phoneQuat, new THREE.Vector3(phoneScale, phoneScale, phoneScale));

    const N = MORPH_COUNT;
    const rng = sigMulberry32(0x1ph0ne ^ 0); // deterministic; literal below
    const rng2 = sigMulberry32(0xa11ce5);
    const tmp = { px:0, py:0, pz:0, nx:0, ny:0, nz:0 };

    // sample SOURCE (glasses local), record local pos (for reveal-style field) + placed pos
    const srcSampler = new SigSampler(srcGeo, rng2);
    const srcPts = new Array(N);
    for (let i = 0; i < N; i++){
      srcSampler.sample(tmp);
      srcPts[i] = { lx: tmp.px, ly: tmp.py, lz: tmp.pz, nx: tmp.nx, ny: tmp.ny, nz: tmp.nz,
        theta: Math.atan2(tmp.px, tmp.pz), seed: rng2() };
    }
    // sample TARGET (iphone local)
    const dstSampler = new SigSampler(morph2IphoneGeo, rng2);
    const dstPts = new Array(N);
    for (let i = 0; i < N; i++){
      dstSampler.sample(tmp);
      dstPts[i] = { lx: tmp.px, ly: tmp.py, lz: tmp.pz, theta: Math.atan2(tmp.px, tmp.pz) };
    }
    // azimuth-rank + per-window height pairing (identical strategy to the hero morph)
    srcPts.sort((a,b)=>a.theta-b.theta);
    dstPts.sort((a,b)=>a.theta-b.theta);
    const WIN = 80;
    for (let s = 0; s < N; s += WIN){
      const e = Math.min(s + WIN, N);
      const sw = srcPts.slice(s, e).sort((a,b)=>b.ly-a.ly);
      const dw = dstPts.slice(s, e).sort((a,b)=>b.ly-a.ly);
      for (let k = 0; k < sw.length; k++){ srcPts[s+k]=sw[k]; dstPts[s+k]=dw[k]; }
    }
    // dissolve bias over glasses, reveal bias over iphone (same fields the shaders use)
    const dRaw = new Float32Array(N); let dMin=Infinity, dMax=-Infinity;
    for (let i=0;i<N;i++){ const s=srcPts[i];
      const f = sigNoise.fieldGlasses(s.lx, s.ly, s.lz, 0,0,0, srcMaxDist);
      dRaw[i]=f; if(f<dMin)dMin=f; if(f>dMax)dMax=f; }
    const srcRemap = { min:dMin, range:Math.max(dMax-dMin,1e-6) };
    const rRaw = new Float32Array(N); let rMin=Infinity, rMax=-Infinity;
    for (let i=0;i<N;i++){ const d=dstPts[i];
      const f = sigNoise.fieldGlasses(d.lx, d.ly, d.lz, 0,0,0, morph2IphoneMaxDist);
      rRaw[i]=f; if(f<rMin)rMin=f; if(f>rMax)rMax=f; }
    const dstRemap = { min:rMin, range:Math.max(rMax-rMin,1e-6) };

    const aHead=new Float32Array(N*3), aHeadN=new Float32Array(N*3), aGlass=new Float32Array(N*3);
    const aSeed=new Float32Array(N), aD=new Float32Array(N), aR=new Float32Array(N);
    const sv=new THREE.Vector3(), nv=new THREE.Vector3(), dv=new THREE.Vector3();
    const normalMat = new THREE.Matrix3().getNormalMatrix(srcMat4);
    for (let i=0;i<N;i++){
      const s=srcPts[i], d=dstPts[i];
      sv.set(s.lx,s.ly,s.lz).applyMatrix4(srcMat4);
      nv.set(s.nx,s.ny,s.nz).applyMatrix3(normalMat).normalize();
      dv.set(d.lx,d.ly,d.lz).applyMatrix4(phoneMat4);
      aHead[i*3]=sv.x; aHead[i*3+1]=sv.y; aHead[i*3+2]=sv.z;          // SOURCE (glasses) placed
      aHeadN[i*3]=nv.x; aHeadN[i*3+1]=nv.y; aHeadN[i*3+2]=nv.z;
      aGlass[i*3]=dv.x; aGlass[i*3+1]=dv.y; aGlass[i*3+2]=dv.z;        // TARGET (iphone) placed
      aSeed[i]=s.seed;
      aD[i]=Math.min(Math.max(sigRemapBias(dRaw[i], srcRemap),0.02),0.92);
      aR[i]=Math.min(Math.max(sigRemapBias(rRaw[i], dstRemap),0.02),0.92);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(aHead.slice(),3));
    geo.setAttribute('aHead', new THREE.BufferAttribute(aHead,3));
    geo.setAttribute('aHeadN', new THREE.BufferAttribute(aHeadN,3));
    geo.setAttribute('aGlass', new THREE.BufferAttribute(aGlass,3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed,1));
    geo.setAttribute('aDBias', new THREE.BufferAttribute(aD,1));
    geo.setAttribute('aRBias', new THREE.BufferAttribute(aR,1));
    geo.boundingSphere = new THREE.Sphere(phonePos.clone(), 4.0);

    const mat = new THREE.ShaderMaterial({
      uniforms: morphU2,
      vertexShader: MORPH_POINTS_VERT, fragmentShader: MORPH_POINTS_FRAG,
      transparent:true, depthWrite:false, depthTest:true, blending:THREE.NormalBlending
    });
    morph2Points = new THREE.Points(geo, mat);
    morph2Points.frustumCulled = false;
    morph2Points.renderOrder = 8;
    morph2Points.visible = false;
    statueGroup.add(morph2Points);

    // solid iphone reveal mesh (child of statueGroup), reveal patch bound to morphU2.uReveal
    const iMat = new THREE.MeshPhysicalMaterial({
      color: 0x16181c, roughness: 0.34, metalness: 0.25, clearcoat: 0.5,
      clearcoatRoughness: 0.3, envMapIntensity: 0.7, side: THREE.DoubleSide
    });
    morphPatchGlassesMaterial(iMat, morph2IphoneMaxDist, dstRemap, morphU2.uReveal);
    const iMesh = new THREE.Mesh(morph2IphoneGeo, iMat);
    iMesh.frustumCulled = false;
    iMesh.renderOrder = 9;
    iMesh.position.copy(phonePos);
    iMesh.quaternion.copy(phoneQuat);
    iMesh.scale.setScalar(phoneScale);
    iMesh.visible = false;
    statueGroup.add(iMesh);
    morph2Iphone = iMesh;

    // source glasses must be able to fade out during the dissolve -> make it transparent-capable
    if (morphGlasses.material){ morphGlasses.material.transparent = true; }

    MORPH2.ready = true;
    requestScrollSceneUpdate();
  } catch (e){
    console.warn('morph2: build failed', e);
    MORPH2.failed = true;
  }
}
```

> Note: replace the placeholder `0x1ph0ne ^ 0` with a literal seed `const rng = sigMulberry32(0xb0bafe);` — only `rng2` is actually used; delete the unused `rng` line to avoid a dead var. (Self-correct during implementation.)

- [ ] **Step 2:** (Verification deferred to Task 6/7 once kickoff + wiring exist.)

---

## Task 5: Timeline, per-frame update, spin, source fade

**Files:** Modify: `title-screen.html` — new functions in the stage-2 block; edits to `tick()` (~9249 spin line and after the `morphUpdate(t)` call ~9252).

- [ ] **Step 1: Add `morph2EvalTimeline` + `morph2Update` + `window.__MORPH2`** (in the stage-2 block)

```js
/* same curve as the hero morphEvalTimeline, driving morphU2 + the stage-2 spin */
function morph2EvalTimeline(m){
  m = clamp01(m);
  MORPH2.m = m;
  MORPH2.yaw = smoothstep(0, 1, m) * Math.PI * 2.0;     // full turn, eased ends
  morphU2.uDissolve.value = clamp01((m - 0.06) / 0.44);
  morphU2.uErode.value    = clamp01((m - 0.075) / 0.44);
  morphU2.uMorph.value    = smoothstep(0.30, 0.82, m);
  morphU2.uScatter.value  = Math.sin(Math.PI * m);
  morphU2.uReveal.value   = clamp01((m - 0.60) / 0.40);
}

function morph2Update(t){
  if (!MORPH2.ready) return;
  morphU2.uTime.value = t;
  const m = MORPH2.m;
  if (morph2Points) morph2Points.visible = m > 0.001 && m < 0.999;
  if (morph2Iphone) morph2Iphone.visible = morphU2.uReveal.value > 0.002;
  // SOURCE erode = fade the solid glasses out as the cloud is born (morphUpdate ran
  // first this frame and set morphGlasses.visible from the hero uReveal=1, so override).
  if (morphGlasses){
    if (m > 0.001){
      const fade = 1.0 - smoothstep(0.0, 0.32, morphU2.uDissolve.value);
      morphGlasses.material.opacity = fade;
      morphGlasses.visible = fade > 0.003;
    } else {
      morphGlasses.material.opacity = 1.0;   // restored when scrolled back before the band
    }
  }
}

/* verification / live-tuning hook */
window.__MORPH2 = {
  U: morphU2, state: MORPH2, look: PHONE_LOOK,
  park(m){ morph2EvalTimeline(typeof m === 'number' ? m : MORPH2.m); requestScrollSceneUpdate(); },
  get points(){ return morph2Points; },
  get iphone(){ return morph2Iphone; }
};
```

- [ ] **Step 2: Add `MORPH2.yaw` to the spin composition** at `title-screen.html:9249`

Change:
```js
    statueGroup.rotation.y = current.rotY + scrollYaw + layoutYaw + MORPH.yaw + (STATUE_IDLE_SWAY ? Math.sin(t * 0.22) * 0.06 : 0);
```
to:
```js
    statueGroup.rotation.y = current.rotY + scrollYaw + layoutYaw + MORPH.yaw + MORPH2.yaw + (STATUE_IDLE_SWAY ? Math.sin(t * 0.22) * 0.06 : 0);
```

- [ ] **Step 3: Call `morph2Update(t)` right after `morphUpdate(t)`** (~line 9252)

Find:
```js
  morphUpdate(t);
```
and add immediately after it:
```js
  morph2Update(t);
```

- [ ] **Step 4: Render-verify no errors yet** (build/kickoff not wired, so MORPH2 stays not-ready — just confirm the page is healthy)

Run:
```bash
cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && node drive-morph.mjs t5 "0.31,0.538,0.80" 1100 1400
```
Expected: no `ERRORS:` line.

---

## Task 6: Load `iphone.glb` + trigger build after the glasses exist

**Files:** Modify: `title-screen.html` — `morph2Kickoff` in the stage-2 block; call site at `title-screen.html:8485`.

- [ ] **Step 1: Add `morph2Kickoff()`** (in the stage-2 block)

```js
function morph2Kickoff(){
  if (MORPH2.kicked || MORPH2.failed) return;
  MORPH2.kicked = true;
  fetch('iphone.glb')
    .then((res) => { if (!res.ok) throw new Error('iphone fetch ' + res.status); return res.arrayBuffer(); })
    .then((buffer) => new Promise((resolve, reject) => { new GLTFLoader().parse(buffer, '', resolve, reject); }))
    .then((gltf) => {
      const norm = morph2NormalizeIphone(gltf.scene);
      morph2IphoneGeo = norm.geometry;
      morph2IphoneMaxDist = norm.maxDist;
      // build only once the hero glasses mesh exists (stage-1 build done)
      const tryBuild = () => {
        if (MORPH.ready && morphGlasses) morph2Build();
        else if (!MORPH.failed) setTimeout(tryBuild, 120);
      };
      tryBuild();
    })
    .catch((e) => { console.warn('morph2: iphone load failed', e); MORPH2.failed = true; });
}
```

- [ ] **Step 2: Kick it off after the hero morph kickoff** at `title-screen.html:8485`

Find:
```js
      morphKickoff();
      resolve();
```
Change to:
```js
      morphKickoff();
      morph2Kickoff();
      resolve();
```

- [ ] **Step 3: Render-verify the iPhone builds and reveals when parked at m=1**

Run:
```bash
cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && cat > /tmp/p2.mjs <<'EOF'
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist','--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1100,height:1400,deviceScaleFactor:1.5});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/title-screen.html',{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction("window.__MORPH2 && window.__MORPH2.state.ready===true",{timeout:60000}).catch(()=>{});
await p.evaluate(()=>{document.documentElement.classList.remove('is-loading');const l=document.getElementById('loader'); if(l)l.style.display='none';});
await new Promise(r=>setTimeout(r,1500));
// park stage-2 at a few m's and screenshot (still center-ish: jump near the carousel later)
for(const m of [0,0.5,1]){ await p.evaluate((mm)=>window.__MORPH2.park(mm), m);
  await new Promise(r=>setTimeout(r,400));
  const st=await p.evaluate(()=>({ready:window.__MORPH2.state.ready, rev:+window.__MORPH2.U.uReveal.value.toFixed(2)}));
  await p.screenshot({path:`../shots/iph-park-${Math.round(m*100)}.png`});
  console.log('m=',m,'ready=',st.ready,'reveal=',st.rev); }
console.log('ERRORS:',errs.slice(0,5).join(' | ')||'none'); await b.close();
EOF
node /tmp/p2.mjs
```
Expected: `m= 0 ready= true reveal= 0`, `m= 0.5 ... reveal= 0`, `m= 1 ... reveal= 1`, `ERRORS: none`. The build ran (`ready=true`) and the iPhone reveal uniform tracks `m`. (The model is still center here because we parked it without scrolling; left-slot placement is verified in Task 8.)

---

## Task 7: Scroll wiring — lengthen image1→2, drive the morph, extend the page

**Files:** Modify: `title-screen.html` — `plateIndexForProgress` (~3553-3578), new helpers above it; `updateScrollScene` (reduced-motion branch ~4595 and main path ~4653); `SCROLL_CAROUSEL_VH` (~2486); `.scroll-space` CSS height (~1207).

- [ ] **Step 1: Hoist carousel weights + add the first-move helpers** — insert immediately **above** `function plateIndexForProgress(progress){`:

```js
/* Carousel filmstrip weighting (shared by plateIndexForProgress + morph2BandProgress).
   The FIRST move (image1->2) is much longer than the rest so the glasses->iPhone
   morph reads; SCROLL_CAROUSEL_VH is grown to match so per-image dwell stays equal. */
const CAROUSEL_DWELL_WEIGHT = 6.0;
const CAROUSEL_MOVE_WEIGHT  = 3.0;
const CAROUSEL_FIRST_MOVE_WEIGHT = 24.0;   // image1->2 morph window (~150vh)
const CAROUSEL_EXIT_WEIGHT = 0.32;
function carouselMoveWeight(index){ return index === 0 ? CAROUSEL_FIRST_MOVE_WEIGHT : CAROUSEL_MOVE_WEIGHT; }
function carouselTotalWeight(count){
  let w = count * CAROUSEL_DWELL_WEIGHT + CAROUSEL_EXIT_WEIGHT;
  for (let i = 0; i < count - 1; i++) w += carouselMoveWeight(i);
  return w;
}
/* linear 0..1 position within the (lengthened) image1->2 move window; 0 before, 1 after */
function morph2BandProgress(galleryProgress){
  const count = Math.max(1, platePreviewCards.length);
  if (count < 2) return 0;
  const totalWeight = carouselTotalWeight(count);
  const start = CAROUSEL_DWELL_WEIGHT / totalWeight;     // after image-0 dwell
  const span  = CAROUSEL_FIRST_MOVE_WEIGHT / totalWeight;
  return clamp01((galleryProgress - start) / span);
}
```

- [ ] **Step 2: Refactor `plateIndexForProgress`** to use the hoisted weights + per-index move weight. Replace the whole function body (`title-screen.html:3553-3578`) with:

```js
function plateIndexForProgress(progress){
  const count = Math.max(1, platePreviewCards.length);
  const totalWeight = carouselTotalWeight(count);
  let cursor = 0;
  for (let index = 0; index < count; index++){
    const dwellSpan = CAROUSEL_DWELL_WEIGHT / totalWeight;
    if (progress < cursor + dwellSpan) return index;
    cursor += dwellSpan;
    if (index < count - 1){
      const moveSpan = carouselMoveWeight(index) / totalWeight;
      if (progress < cursor + moveSpan){
        return index + cosineEase((progress - cursor) / moveSpan);
      }
      cursor += moveSpan;
    } else {
      const exitSpan = CAROUSEL_EXIT_WEIGHT / totalWeight;
      return index + cosineEase((progress - cursor) / exitSpan) * 0.18;
    }
  }
  return count - 1;
}
```

- [ ] **Step 3: Drive the morph from the main scroll path.** In `updateScrollScene`, find `const galleryProgress = clamp01(slideProg / 0.82);` (~line 4653) and add **after** it:

```js
  if (MORPH2.ready) morph2EvalTimeline(morph2BandProgress(galleryProgress));
```

- [ ] **Step 4: Reduced-motion branch.** In the `if (reduceScrollMotion){ ... }` block, find `morphEvalTimeline(1);` (~line 4595) and add after it:

```js
    if (MORPH2.ready) morph2EvalTimeline(1);   // iPhone already assembled in reduced-motion
```

- [ ] **Step 5: Extend the page.** Change `SCROLL_CAROUSEL_VH` (~line 2486):

```js
const SCROLL_CAROUSEL_VH    = 908;   // was 607; +~300vh holds the image1->2 morph window while dwell stays equal
```

And update the `.scroll-space` CSS height (`title-screen.html:1207`) to match the new `SCROLL_TOTAL_VH` (408+300+908 = **1616**):

```css
    height: 1616vh; /* == SCROLL_TOTAL_VH in JS. hero 558vh + morph 300vh + carousel 908vh (incl. the ~150vh image1->2 glasses->iPhone morph window) */
```

- [ ] **Step 6: Render-verify no errors + boundaries moved**

Run:
```bash
cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && node drive-morph.mjs t7 "0.31,0.42,0.538,0.70,0.85,0.95" 1100 1400
```
Expected: no `ERRORS:`; the hero `m` still hits 0/0.5/1 across 0.31–0.538 (boundaries unchanged because they're vh-derived).

---

## Task 8: Verify the full glasses→iPhone sequence, tune placement, confirm dwell unchanged

**Files:** Maybe create: `fracture-verification/drive-morph2.mjs`. Tune: `PHONE_LOOK` (via `window.__MORPH2.look` live, then bake values into the source).

- [ ] **Step 1: Find the image1→2 scroll window + screenshot the sequence.** Sweep the carousel, log stage-2 `m` and the filmstrip index, screenshot glasses→cloud→iPhone:

```bash
cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && cat > "$CLAUDE_JOB_DIR/tmp/seq.mjs" <<'EOF'
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist','--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1100,height:1400,deviceScaleFactor:1.5});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/title-screen.html',{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction("window.__MORPH2 && window.__MORPH2.state.ready===true",{timeout:60000}).catch(()=>{});
await p.evaluate(()=>{document.documentElement.classList.remove('is-loading');const l=document.getElementById('loader'); if(l)l.style.display='none';});
await new Promise(r=>setTimeout(r,1500));
for(let f=0.60; f<=0.92; f+=0.02){
  await p.evaluate((frac)=>{const m=document.documentElement.scrollHeight-window.innerHeight; (window.__lenis?window.__lenis.scrollTo(frac*m,{immediate:true,force:true}):window.scrollTo(0,frac*m));}, f);
  await new Promise(r=>setTimeout(r,140));
  const st=await p.evaluate(()=>{const fs=document.getElementById('plate-filmstrip');const t=(fs&&fs.style.transform)||'';const mm=t.match(/translate3d\(([-0-9.]+)%/);return {m2:+window.__MORPH2.state.m.toFixed(3), rev:+window.__MORPH2.U.uReveal.value.toFixed(2), u:mm?+(-mm[1]/100).toFixed(2):null};});
  if(st.m2>0.001 && st.m2<0.999) await p.screenshot({path:`../shots/seq-${Math.round(f*100)}.png`});
  console.log(`f=${f.toFixed(2)} m2=${st.m2} rev=${st.rev} u=${st.u}`);
}
console.log('ERRORS:',errs.slice(0,5).join(' | ')||'none'); await b.close();
EOF
node "$CLAUDE_JOB_DIR/tmp/seq.mjs"
```
Expected: a contiguous scroll band where `m2` ramps 0→1 **while `u` ramps 0→1** (morph + image slide simultaneous); `m2` is solid-glasses(0) at the start of the window and solid-iPhone(1, rev=1) at the end; `ERRORS: none`.

- [ ] **Step 2: Visually inspect** `shots/seq-*.png` — at low `m2`: glasses in the left accent slot; mid `m2`: charcoal particle cloud (spinning); high `m2`: solid iPhone parked left. Open the three representative frames.

- [ ] **Step 3: Tune `PHONE_LOOK` if the phone is mis-sized/posed.** Live-tune without rebuilding the page by adjusting and re-baking: set values in the `PHONE_LOOK` declaration (Task 1) — `scaleMul` (size), `offX/offY/offZ` (nudge in the slot), `yawDeg` (face direction) — then re-run Step 1. Target: the iPhone reads at a comparable size to the glasses and faces the gallery like the glasses did.

- [ ] **Step 4: Confirm per-image dwell is unchanged** and only image1→2 lengthened. Reuse the dwell/slide probe approach (sweep filmstrip `u` across [MORPH_BAND_END, 1], measure scroll-steps each integer index holds). Expected: middle-image dwell ≈ same vh as before this change; the 0→1 transition now ≈150vh; transitions 1→2→3→4 ≈ short.

- [ ] **Step 5: Confirm the hero morph is unaffected.** Run `node drive-morph.mjs final "0.28,0.31,0.42,0.538"` — David settled at 0.31, cloud at 0.42, glasses solid at 0.538; no `ERRORS:`.

- [ ] **Step 6: Update memory** (`project-spin-to-glasses.md` + index) with the stage-2 morph: `MORPH2`/`morphU2`/`morph2*`, `window.__MORPH2`, `PHONE_LOOK`, the `CAROUSEL_FIRST_MOVE_WEIGHT` image1→2 window, and `SCROLL_CAROUSEL_VH`/total-height change.

---

## Self-Review

**Spec coverage:**
- In-place left-slot staging → morph2 objects are children of `statueGroup` (Task 4), no center restructure. ✓
- Extend only image1→2 (~150vh), other slides short, page taller, dwell unchanged → Task 7 (`CAROUSEL_FIRST_MOVE_WEIGHT` + `SCROLL_CAROUSEL_VH`), verified Task 8 Step 4. ✓
- Same mechanic + 360° spin, no word → `morph2EvalTimeline` same curve + `MORPH2.yaw` (Task 5); no word code added. ✓
- Charcoal particles → `morphU2.uColor = 0x17120d` (Task 1). ✓
- iPhone persists for images 2→5 → morph2 driven by `morph2BandProgress` which is 1 after the first move; iPhone mesh stays as left accent. ✓
- Dark monochrome iPhone material → `MeshPhysicalMaterial color 0x16181c` (Task 4). ✓
- Preload to avoid hitching → `morph2Kickoff` fetches early at the glasses kickoff site (Task 6). ✓
- Reversibility → morph2 is a pure function of scroll via `morph2BandProgress`; glasses opacity restored at `m≤0.001` (Task 5). ✓
- `window.__MORPH2` + `PHONE_LOOK` hooks (Task 5/1). ✓
- Backup before work (Task 0). ✓

**Placeholder scan:** One intentional placeholder flagged in Task 4 (the `0x1ph0ne` seed) with an explicit fix instruction. No other TBD/TODO.

**Type/name consistency:** `MORPH2`, `morphU2`, `morph2Points`, `morph2Iphone`, `morph2IphoneGeo`, `morph2IphoneMaxDist`, `PHONE_LOOK`, `morph2Build`, `morph2EvalTimeline`, `morph2Update`, `morph2Kickoff`, `morph2NormalizeIphone`, `morph2BandProgress`, `carouselMoveWeight`/`carouselTotalWeight` — used consistently across tasks. `morphPatchGlassesMaterial`'s new 4th param `uRevealUniform` is defined in Task 2 and used in Task 4. ✓

**Known tuning risks (expected, not blockers):** exact `firstMoveWeight`/`SCROLL_CAROUSEL_VH` to hit ~150vh and keep dwell identical (tuned in Task 8 Step 4); `PHONE_LOOK` size/pose (Task 8 Step 3); thin-phone-edge-on during spin (acceptable — cloud covers mid-spin).
