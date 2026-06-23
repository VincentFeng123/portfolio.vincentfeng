# Artwork "View Process" Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Codebase reality (overrides default TDD/commit steps):** single-file app `title-screen.html` (inline CSS/JS); **no git** (skip commits; one-time `.bak` checkpoint instead) and **no unit-test framework** — verification is the house **render-verify** pattern: a puppeteer `drive-*.mjs` script that drives the page at `http://localhost:8123/title-screen.html`, plus `window.__PROCESS` hook checks and `pageerror` capture. Spec: `docs/superpowers/specs/2026-06-16-artwork-process-timeline-design.md`.

**Goal:** Add a scroll-driven, full-black "Process Mode" to the artwork detail overlay — a sticky bottom-center button toggles an organic centerline that fills gray→white as you scroll, with 6 image+caption nodes alternating above/below.

**Architecture:** A self-contained DOM/SVG module (`processMode`) added inside the existing `.artwork-detail` overlay in `title-screen.html`, mirroring the `morph2`/`morph3` house pattern (early state, build/enter/exit/onScroll, `window.__PROCESS` hook). A tall `.process-mode__rail` + `position:sticky` stage gives native vertical scroll range; `scrollTop → --p (0..1)` drives `translateX` on a node track and `stroke-dashoffset` on a white SVG fill path. Fully decoupled from Lenis/`updateScrollScene` (Lenis is `stop()`ed while the detail is open).

**Tech Stack:** Vanilla JS, CSS custom properties + transforms, inline SVG. Verify with `puppeteer-core` (in `fracture-verification/`) against the running `python -m http.server 8123`.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `title-screen.html` | the whole app | add CSS block, DOM markup, JS module, 4 wiring edits |
| `fracture-verification/drive-process.mjs` | render-verify the feature | create |

All JS lives in the existing `<script>` (function declarations are hoisted, so `setArtworkDetailContent` may call `setProcessModeContent` even though the module is defined just after it). Element-ref `const`s go beside the other artwork-detail refs (2307–2314), before any function runs.

---

## Task 1: Checkpoint + CSS

**Files:** Modify `title-screen.html` (CSS, after the `.artwork-detail__process-item` block ~line 876; or anywhere in the `<style>`).

- [ ] **Step 1: One-time backup checkpoint**

Run:
```bash
cd "/Users/vincentfeng/Documents/ap art" && cp title-screen.html "title-screen.pre-process-$(date +%Y%m%d-%H%M%S).html.bak" && ls -t *.bak | head -1
```
Expected: prints the new `.bak` filename.

- [ ] **Step 2: Add the Process Mode CSS**

Insert this block in the `<style>` (e.g. right after the `.artwork-detail__process-item::before` rule, ~line 876):

```css
/* ░░░ Artwork "View Process" timeline ░░░ */
.artwork-detail__process-toggle{
  position: fixed; left: 50%; bottom: clamp(22px, 4vh, 52px);
  transform: translate3d(-50%, 12px, 0); z-index: 4;
  display: inline-flex; align-items: center; gap: 10px;
  height: 40px; padding: 0 22px;
  border: 1px solid rgba(3,3,3,0.18); border-radius: 999px;
  background: rgba(255,255,255,0.6);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  color: rgba(3,3,3,0.78); font-family: var(--sans);
  font-size: 11px; line-height: 1; letter-spacing: 0.22em; text-transform: uppercase;
  cursor: pointer; opacity: 0; pointer-events: none;
  transition: color 180ms ease, border-color 220ms ease, background 220ms ease,
    opacity 520ms cubic-bezier(.18,.78,.28,1), transform 520ms cubic-bezier(.18,.78,.28,1);
}
.artwork-detail.is-ready .artwork-detail__process-toggle{
  opacity: 1; pointer-events: auto; transform: translate3d(-50%, 0, 0);
}
.artwork-detail__process-toggle:hover,
.artwork-detail__process-toggle:focus-visible{ color: var(--ink); border-color: rgba(3,3,3,0.42); outline: none; }
.artwork-detail.is-process .artwork-detail__process-toggle{
  color: rgba(255,255,255,0.82); border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.04);
}
.artwork-detail.is-process .artwork-detail__process-toggle:hover,
.artwork-detail.is-process .artwork-detail__process-toggle:focus-visible{ color: #fff; border-color: rgba(255,255,255,0.6); }

.artwork-detail.is-process .artwork-detail__back{ opacity: 0; pointer-events: none; }
.artwork-detail.is-process .artwork-detail__viewport{
  opacity: 0; pointer-events: none; transition: opacity 360ms cubic-bezier(.18,.78,.28,1);
}

.process-mode{
  position: absolute; inset: 0; z-index: 2; background: #060606;
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 460ms cubic-bezier(.18,.78,.28,1), visibility 0s linear 460ms;
}
.artwork-detail.is-process .process-mode{
  opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s;
}
.process-mode__scroll{
  position: absolute; inset: 0; overflow-x: hidden; overflow-y: auto;
  overscroll-behavior: contain; scrollbar-width: none;
}
.process-mode__scroll::-webkit-scrollbar{ display: none; }
.process-mode__rail{ position: relative; width: 100%; height: var(--rail-h, 460vh); }
.process-mode__stage{ position: sticky; top: 0; height: 100vh; overflow: hidden; }
.process-mode__track{
  position: absolute; top: 0; left: 0; height: 100%; width: var(--track-w, 320vw);
  transform: translate3d(calc(var(--p, 0) * (100vw - var(--track-w, 320vw))), 0, 0);
  will-change: transform;
}
.process-mode__line{ position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; }
.process-mode__line-base{ fill: none; stroke: rgba(255,255,255,0.16); stroke-width: 2.2; stroke-linecap: round; }
.process-mode__line-fill{
  fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round;
  stroke-dasharray: var(--line-len, 0);
  stroke-dashoffset: calc((1 - var(--p, 0)) * var(--line-len, 0));
}
.process-mode__node{
  position: absolute; left: var(--x, 50%); top: var(--y, 50%); width: 0; height: 0;
  opacity: var(--reveal, 0); transition: opacity 140ms linear;
}
.process-mode__node-dot{
  position: absolute; left: 0; top: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px;
  border-radius: 50%; background: #fff; box-shadow: 0 0 0 4px #060606, 0 0 16px rgba(255,255,255,0.45);
}
.process-mode__node-body{
  position: absolute; left: 0; display: flex; align-items: center;
  gap: clamp(14px, 1.4vw, 26px); width: max-content; max-width: 38vw;
}
.process-mode__node--above .process-mode__node-body{ bottom: 0; transform: translate(-50%, calc(-1 * clamp(26px, 6vh, 64px))); }
.process-mode__node--below .process-mode__node-body{ top: 0; transform: translate(-50%, clamp(26px, 6vh, 64px)); }
.process-mode__node-img{
  flex: 0 0 auto; width: clamp(140px, 16vw, 260px); aspect-ratio: 4 / 5;
  background-image: var(--img); background-size: cover; background-position: center;
  filter: grayscale(1) contrast(1.04) brightness(0.96); box-shadow: 0 24px 60px rgba(0,0,0,0.5);
}
.process-mode__node-caption{ flex: 0 1 auto; max-width: 220px; color: rgba(255,255,255,0.82); font-family: var(--sans); }
.process-mode__node-index{ display: block; margin-bottom: 8px; color: rgba(255,255,255,0.4); font-size: 11px; letter-spacing: 0.2em; }
.process-mode__node-text{ margin: 0; font-size: clamp(13px, 1vw, 15px); line-height: 1.6; }

@media (prefers-reduced-motion: reduce){
  .process-mode__rail{ height: auto; }
  .process-mode__stage{ position: static; height: auto; min-height: 100vh; }
  .process-mode__track{
    position: static; width: 100%; transform: none;
    display: flex; flex-direction: column; gap: 8vh; padding: 12vh clamp(20px,6vw,80px);
  }
  .process-mode__line{ display: none; }
  .process-mode__node{ position: static; width: auto; height: auto; opacity: 1 !important; }
  .process-mode__node-dot{ display: none; }
  .process-mode__node-body{ position: static; transform: none; }
  .artwork-detail__process-toggle, .process-mode{ transition: none !important; }
}
```

- [ ] **Step 3: Verify CSS parses (no visual change yet)**

Run: `cd "/Users/vincentfeng/Documents/ap art" && node -e "const s=require('fs').readFileSync('title-screen.html','utf8'); console.log('process-mode rules:', (s.match(/\.process-mode/g)||[]).length)"`
Expected: a count > 20.

---

## Task 2: DOM markup + element refs

**Files:** Modify `title-screen.html` — markup before `</section>` at line 1736; refs after line 2314.

- [ ] **Step 1: Inject the toggle button + process layer**

Insert immediately before the closing `</section>` of `#artwork-detail` (line 1736, after the `</div>` that closes `.artwork-detail__viewport` at 1735):

```html
  <button type="button" class="artwork-detail__process-toggle" aria-pressed="false">
    <span class="artwork-detail__process-toggle-label">View Process</span>
  </button>
  <div class="process-mode" aria-hidden="true">
    <div class="process-mode__scroll" data-lenis-prevent tabindex="-1">
      <div class="process-mode__rail">
        <div class="process-mode__stage">
          <div class="process-mode__track">
            <svg class="process-mode__line" viewBox="0 0 3200 1000" preserveAspectRatio="none" aria-hidden="true">
              <path class="process-mode__line-base" d="" />
              <path class="process-mode__line-fill" d="" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Add element refs**

After line 2314 (`const artworkDetailCopy = document.getElementById('artwork-detail-copy');`) add:

```js
const processModeEl = document.querySelector('.process-mode');
const processScrollEl = processModeEl?.querySelector('.process-mode__scroll');
const processStageEl = processModeEl?.querySelector('.process-mode__stage');
const processTrackEl = processModeEl?.querySelector('.process-mode__track');
const processLineBase = processModeEl?.querySelector('.process-mode__line-base');
const processLineFill = processModeEl?.querySelector('.process-mode__line-fill');
const processToggle = document.querySelector('.artwork-detail__process-toggle');
const processToggleLabel = processToggle?.querySelector('.artwork-detail__process-toggle-label');
```

- [ ] **Step 3: Verify markup present**

Run: `cd "/Users/vincentfeng/Documents/ap art" && grep -c "process-mode__track\|artwork-detail__process-toggle\|processTrackEl" title-screen.html`
Expected: ≥ 4.

---

## Task 3: JS module + wiring

**Files:** Modify `title-screen.html` — module after `setArtworkDetailContent` (~line 3810); wiring at 3808/4485/4341.

- [ ] **Step 1: Add the `processMode` module**

Insert right after the closing brace of `setArtworkDetailContent` (line 3810):

```js
/* ░░░ Artwork "View Process" timeline (self-contained; DOM/SVG only) ░░░ */
const PROCESS = { active: false, built: false, busy: false, p: 0, count: 6, lineLen: 0 };
const PROCESS_IMAGES = [
  'black-white-acrylic-painting.jpg',
  'bright-turquoise-yellow-paint.jpg',
  'rm167batch2-sasi-51.jpg',
  'vertical-grey-scale-shot-textured-black-white-surface.jpg'
];
const PROCESS_CAPTIONS = [
  'Collect raw references and let the first gestures land without correction.',
  'Test digital and physical variations until a rhythm starts to emerge.',
  'Isolate the marks that carry the most physical presence.',
  'Build contrast and weight so the surface reads from across the room.',
  'Edit ruthlessly — remove anything that competes with the focus.',
  'Resolve the final composition and place it in the portfolio sequence.'
];
const PROCESS_WAVE = { amp: 0.085, waves: 2.4, phase: 0.6, vbw: 3200, vbh: 1000 };
const PROCESS_NODE_X = [0.09, 0.26, 0.42, 0.58, 0.74, 0.91];

function processWaveY(xf){
  return 0.5 + PROCESS_WAVE.amp * Math.sin(xf * PROCESS_WAVE.waves * Math.PI * 2 + PROCESS_WAVE.phase);
}
function processBuildPathD(){
  const { vbw, vbh } = PROCESS_WAVE;
  const steps = 120;
  let d = '';
  for (let i = 0; i <= steps; i++){
    const xf = i / steps;
    d += (i === 0 ? 'M' : 'L') + (xf * vbw).toFixed(2) + ' ' + (processWaveY(xf) * vbh).toFixed(2) + ' ';
  }
  return d.trim();
}
function setProcessModeContent(index){
  if (!processModeEl || !processTrackEl) return;
  const safeIndex = safeArtworkIndex(index);
  const d = processBuildPathD();
  if (processLineBase) processLineBase.setAttribute('d', d);
  if (processLineFill){
    processLineFill.setAttribute('d', d);
    const len = processLineFill.getTotalLength ? processLineFill.getTotalLength() : 0;
    PROCESS.lineLen = len;
    processStageEl?.style.setProperty('--line-len', len.toFixed(2));
  }
  processTrackEl.querySelectorAll('.process-mode__node').forEach((n) => n.remove());
  const frag = document.createDocumentFragment();
  for (let i = 0; i < PROCESS.count; i++){
    const xf = PROCESS_NODE_X[i] != null ? PROCESS_NODE_X[i] : ((i + 0.5) / PROCESS.count);
    const yf = processWaveY(xf);
    const above = i % 2 === 0;
    const img = PROCESS_IMAGES[(safeIndex + i) % PROCESS_IMAGES.length];
    const cap = PROCESS_CAPTIONS[i % PROCESS_CAPTIONS.length];
    const node = document.createElement('figure');
    node.className = 'process-mode__node ' + (above ? 'process-mode__node--above' : 'process-mode__node--below');
    node.style.setProperty('--x', (xf * 100).toFixed(3) + '%');
    node.style.setProperty('--y', (yf * 100).toFixed(3) + '%');
    node.dataset.xf = String(xf);
    node.innerHTML =
      '<span class="process-mode__node-dot"></span>' +
      '<div class="process-mode__node-body">' +
        '<div class="process-mode__node-img" style="--img:url(\'' + img + '\')"></div>' +
        '<figcaption class="process-mode__node-caption">' +
          '<span class="process-mode__node-index">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<p class="process-mode__node-text">' + escapeHTML(cap) + '</p>' +
        '</figcaption>' +
      '</div>';
    frag.appendChild(node);
  }
  processTrackEl.appendChild(frag);
  PROCESS.built = true;
  processApplyProgress(0);
}
function processApplyProgress(p){
  PROCESS.p = clamp01(p);
  processStageEl?.style.setProperty('--p', PROCESS.p.toFixed(4));
  if (!processTrackEl) return;
  const vw = window.innerWidth || 1;
  const trackW = processTrackEl.getBoundingClientRect().width || vw;
  const shift = PROCESS.p * (vw - trackW);
  for (const node of processTrackEl.querySelectorAll('.process-mode__node')){
    const xf = parseFloat(node.dataset.xf || '0');
    const t = (xf * trackW + shift) / vw;
    const reveal = smoothstep(-0.10, 0.14, t) * (1 - smoothstep(0.86, 1.10, t));
    node.style.setProperty('--reveal', reveal.toFixed(3));
  }
}
let processScrollFrame = 0;
function onProcessScroll(){
  processScrollFrame = 0;
  if (!processScrollEl) return;
  const max = processScrollEl.scrollHeight - processScrollEl.clientHeight;
  processApplyProgress(max > 0 ? processScrollEl.scrollTop / max : 0);
}
function requestProcessScroll(){
  if (processScrollFrame) return;
  processScrollFrame = requestAnimationFrame(onProcessScroll);
}
function onProcessResize(){
  if (!PROCESS.active) return;
  if (processLineFill && processLineFill.getTotalLength){
    PROCESS.lineLen = processLineFill.getTotalLength();
    processStageEl?.style.setProperty('--line-len', PROCESS.lineLen.toFixed(2));
  }
  requestProcessScroll();
}
function enterProcessMode(){
  if (!artworkDetail || !processModeEl || PROCESS.active || PROCESS.busy) return;
  if (artworkDetailState.transitioning) return;
  PROCESS.busy = true;
  if (!PROCESS.built) setProcessModeContent(artworkDetailState.index);
  if (processScrollEl) processScrollEl.scrollTop = 0;
  processApplyProgress(0);
  artworkDetail.classList.add('is-process');
  processModeEl.setAttribute('aria-hidden', 'false');
  processToggle?.setAttribute('aria-pressed', 'true');
  if (processToggleLabel) processToggleLabel.textContent = 'Exit';
  PROCESS.active = true;
  requestAnimationFrame(() => { processScrollEl?.focus?.({ preventScroll: true }); PROCESS.busy = false; });
}
function exitProcessMode(options = {}){
  if (!artworkDetail || !processModeEl) return;
  artworkDetail.classList.remove('is-process');
  processModeEl.setAttribute('aria-hidden', 'true');
  processToggle?.setAttribute('aria-pressed', 'false');
  if (processToggleLabel) processToggleLabel.textContent = 'View Process';
  if (processScrollEl) processScrollEl.scrollTop = 0;
  processApplyProgress(0);
  PROCESS.active = false;
  PROCESS.busy = false;
  if (!options.immediate) requestAnimationFrame(() => artworkDetailBack?.focus?.({ preventScroll: true }));
}
function toggleProcessMode(){ if (PROCESS.active) exitProcessMode(); else enterProcessMode(); }
window.__PROCESS = {
  state: PROCESS,
  enter: enterProcessMode,
  exit: exitProcessMode,
  build(i){ setProcessModeContent(typeof i === 'number' ? i : artworkDetailState.index); },
  park(p){ if (!PROCESS.active) enterProcessMode(); processApplyProgress(typeof p === 'number' ? p : PROCESS.p); },
  get nodes(){ return processTrackEl ? Array.from(processTrackEl.querySelectorAll('.process-mode__node')) : []; }
};
```

- [ ] **Step 2: Build content + reset on each open**

In `setArtworkDetailContent` (ends line 3810), before its final `}`:

```js
  if (typeof PROCESS !== 'undefined' && PROCESS.active) exitProcessMode({ immediate: true });
  setProcessModeContent(safeIndex);
```
(`safeIndex` is already in scope at the top of that function.)

- [ ] **Step 3: Wire events**

After line 4485 (`artworkDetailBack?.addEventListener('click', requestCloseArtworkDetail);`) add:

```js
processToggle?.addEventListener('click', toggleProcessMode);
processScrollEl?.addEventListener('scroll', requestProcessScroll, { passive: true });
window.addEventListener('resize', onProcessResize);
```

- [ ] **Step 4: Reset on close**

In `closeArtworkDetail`, after line 4340 (`if (!artwork) return;`) add:

```js
  if (typeof PROCESS !== 'undefined') exitProcessMode({ immediate: true });
```

- [ ] **Step 5: Make Escape process-aware**

Run: `cd "/Users/vincentfeng/Documents/ap art" && grep -n "Escape\|key === 'Esc\|keydown" title-screen.html | head`
Then in whichever keydown handler closes the artwork detail on `Escape`, add at the top of the Escape branch:
```js
if (typeof PROCESS !== 'undefined' && PROCESS.active){ exitProcessMode(); return; }
```
If no such handler exists, add one near line 4485:
```js
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (typeof PROCESS !== 'undefined' && PROCESS.active){ exitProcessMode(); }
});
```

- [ ] **Step 6: JS sanity (load + hook + no errors)**

Create and run `fracture-verification/_process-sanity.mjs` (delete after):
```js
import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist','--no-sandbox']});
const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/title-screen.html',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,2500));
const has=await p.evaluate(()=>!!(window.__PROCESS && typeof window.__PROCESS.enter==='function'));
console.log('hasHook=',has,'errors=',errs.slice(0,5).join(' | ')||'none');
await b.close();
```
Run: `cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && node _process-sanity.mjs`
Expected: `hasHook= true errors= none`.

---

## Task 4: Render-verify script + visual iteration

**Files:** Create `fracture-verification/drive-process.mjs`.

- [ ] **Step 1: Write the driver**

```js
// Render-verify the artwork "View Process" timeline.
// Usage: node drive-process.mjs [tag] [artworkIndex]
import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT='../shots';
const tag=process.argv[2]||'process';
const idx=+(process.argv[3]||0);
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist','--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900,deviceScaleFactor:1.2});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/title-screen.html',{waitUntil:'domcontentloaded',timeout:60000});
await p.evaluate(()=>{document.documentElement.classList.remove('is-loading');const l=document.getElementById('loader'); if(l)l.style.display='none';});
await new Promise(r=>setTimeout(r,1800));
// open artwork detail + build process content for the chosen artwork
await p.evaluate((i)=>{ window.openArtworkDetail ? window.openArtworkDetail(i) : (window.__openArtwork&&window.__openArtwork(i)); }, idx).catch(()=>{});
await new Promise(r=>setTimeout(r,1200));
// enter process mode and sweep progress
for(const pr of [0,0.25,0.5,0.75,1]){
  await p.evaluate((v)=>window.__PROCESS.park(v), pr);
  await new Promise(r=>setTimeout(r,450));
  const st=await p.evaluate(()=>({p:+window.__PROCESS.state.p.toFixed(3), nodes:window.__PROCESS.nodes.length, active:window.__PROCESS.state.active}));
  const name=`${OUT}/${tag}-${String(Math.round(pr*100)).padStart(3,'0')}.png`;
  await p.screenshot({path:name});
  console.log(`p=${pr} -> p=${st.p} nodes=${st.nodes} active=${st.active} ${name}`);
}
// exit back to detail
await p.evaluate(()=>window.__PROCESS.exit());
await new Promise(r=>setTimeout(r,700));
await p.screenshot({path:`${OUT}/${tag}-exit.png`});
if(errs.length) console.log('ERRORS:',errs.slice(0,5).join(' | '));
await b.close();
```

> Note: `openArtworkDetail` is a top-level function in the page scope; if it is not reachable on `window`, expose it by adding `window.openArtworkDetail = openArtworkDetail;` near the `window.__PROCESS` hook, or drive the open by clicking the active plate's "View More". Confirm during this step and pick whichever works.

- [ ] **Step 2: Run + inspect**

Run: `cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && node drive-process.mjs process 0`
Expected: prints `p=… nodes=6 active=true` for each step, `ERRORS:` absent. Then **Read** `shots/process-000.png` … `process-100.png` + `process-exit.png` and confirm:
- 000: all-black, gray organic line, button reads "Exit", first node(s) visible at left.
- 050: line ~half white, track shifted, mid nodes visible (alternating above/below, image+caption right).
- 100: line fully white, last node visible.
- exit: back to white artwork detail with image + copy, button reads "View Process".

- [ ] **Step 3: Iterate**

If composition is off (node overlap, line amplitude, track length/feel), tune `PROCESS_WAVE`, `PROCESS_NODE_X`, `--rail-h`, `--track-w`, node sizes; re-run Step 2 until it reads cleanly. Delete `_process-sanity.mjs`.

---

## Task 5: Polish — enter transition, reduced motion, a11y

**Files:** Modify `title-screen.html`.

- [ ] **Step 1: Confirm the enter transition reads**

Visually confirm (extend the driver or manual) that on enter the hero image/copy fade out and the black layer + line fade in (not a hard cut). If the cut is abrupt, add to the `.artwork-detail.is-process .artwork-detail__viewport` rule a small scale: `transform: scale(0.97);` and a matching transition. Re-run Task 4 Step 2.

- [ ] **Step 2: Reduced-motion render**

Run: `cd "/Users/vincentfeng/Documents/ap art/fracture-verification" && node -e "0" ` then drive with reduced motion — add to `drive-process.mjs` a variant or set `await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}])` before goto in a one-off run. Confirm the process layer becomes a static vertical stack (line hidden, all nodes visible) and the toggle still flips label. (`reduceScrollMotion` is read once at load, so emulate before `goto`.)

- [ ] **Step 3: A11y check**

Confirm in `drive-process.mjs` or a quick eval: `processToggle.getAttribute('aria-pressed')` is `"true"` in process mode and `"false"` after exit; `.process-mode` `aria-hidden` toggles; focus moves to the scroll container on enter and back button on exit. Fix any mismatch.

- [ ] **Step 4: Final full-frame review + update memory**

Re-run `node drive-process.mjs process 0` and `node drive-process.mjs process 1` (a second artwork) — confirm node images differ per artwork (image cycling by index) and no `ERRORS`. Update `MEMORY.md` + a new `project-process-timeline.md` memory describing the feature, the `window.__PROCESS` hook, `drive-process.mjs`, and the `.bak` checkpoint.

---

## Self-review notes (filled during writing)

- **Spec coverage:** enter/exit transition (Task 3 enter/exitProcessMode + Task 1 CSS + Task 5), sticky toggle morph (Task 1/2/3), scroll→progress tall-spacer (Task 1 rail/stage + Task 3 onProcessScroll), gray→white fill (Task 1 line-fill + Task 3 line-len), 6 alt nodes image+caption-right (Task 3 setProcessModeContent), back-button hides (Task 1), reset on close (Task 3 Step 4), reduced motion (Task 1 media query + Task 5), resize (Task 3 onProcessResize), `window.__PROCESS` + driver (Task 3/4). ✔ all mapped.
- **Type consistency:** functions `setProcessModeContent / processApplyProgress / onProcessScroll / requestProcessScroll / enterProcessMode / exitProcessMode / toggleProcessMode / onProcessResize` and refs `processModeEl/processScrollEl/processStageEl/processTrackEl/processLineBase/processLineFill/processToggle/processToggleLabel` used consistently across tasks. CSS vars `--p/--line-len/--rail-h/--track-w/--x/--y/--reveal/--img` consistent. ✔
- **Placeholders:** captions/images are intentional placeholders per spec; no TBD/TODO in steps. ✔
