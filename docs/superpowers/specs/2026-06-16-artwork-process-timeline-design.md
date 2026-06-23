# Artwork "View Process" Timeline — Design Spec

**Date:** 2026-06-16
**File touched:** `title-screen.html` (single-file app; all CSS/JS inline)
**Status:** Approved design → ready for implementation plan

> Note: this project is not a git repo, so the "commit the spec" step is skipped; the spec lives on disk only.

---

## 1. Overview

Add a scroll-driven **Process Mode** to the existing in-page **artwork detail** overlay. From an
artwork detail page, a sticky bottom-center **"View Process"** button transitions the view into a
full-black, horizontally-scrubbed **process timeline**: an organic centerline that fills gray→white as
you scroll, with ~6 image+caption nodes alternating above and below the line. The same button becomes
**"Exit"**, which reverses back to the normal (white) artwork detail.

The feature is a **self-contained module** (`processMode`) following the house pattern used by
`morph2`/`morph3`: early-declared state, a `build`/`enter`/`exit`/`onScroll` lifecycle, and a
`window.__PROCESS` verification hook. It does **not** touch the Three.js scene, Lenis, or
`updateScrollScene`.

## 2. Goals / Non-goals

**Goals**
- A polished enter/exit transition layered on the existing artwork detail overlay.
- Vertical wheel/trackpad/touch scroll mapped to horizontal timeline progress (page does not move).
- Organic SVG centerline that fills gray→white with progress.
- ~6 nodes (image + caption to its right), alternating above/below the line, animating in as they cross.
- Sticky bottom-center button that morphs `View Process ⇄ Exit`.
- Graceful reduced-motion fallback (static vertical stack).
- A `window.__PROCESS` hook + a `fracture-verification/drive-process.mjs` script for render-verify.

**Non-goals (YAGNI)**
- No real per-artwork process content/authoring model yet — placeholder images + captions only.
- No deep-linking / URL hash for process mode.
- No 3D / WebGL; pure DOM + SVG + CSS transforms.
- No changes to the global scroll engine or morph features.

## 3. Decisions (locked)

| Topic | Decision |
|---|---|
| Scroll model | Vertical scroll → horizontal progress, via a dedicated **tall scroll spacer** inside the process layer (native scroll; Lenis already `stop()`ed while detail is open). |
| Content | **6 placeholder nodes**, decoupled from `artworks[].process`. Images cycle the 4 root jpgs; captions are placeholder text (e.g. `Step 0X` + a short phrase). |
| Node layout | Organic centerline; each node = image block with caption text to its **right**; consecutive nodes **alternate above/below** the centerline. |
| Minimized image | The detail hero image **fades away into the black** on enter; **Exit restores it**. (Not docked, not node 0.) |
| Exit | Reverses to the normal artwork detail (black→white, image back, copy back). |
| Button position | Bottom-center sticky (mirrors `.loader__status`), label morphs `View Process ⇄ Exit`. |

## 4. UX flow

```
artwork detail (white)
   │  click "View Process"  (bottom-center)
   ▼   ~700ms enter transition
PROCESS MODE (black)
   • hero image minimizes + fades into black
   • eyebrow/title/description/old process-list fade out
   • organic gray centerline fades in, button → "Exit"
   • scroll ↓ ⇒ track translates left, line fills gray→white,
     nodes (img + caption right, alt. above/below) sweep through
   │  click "Exit"  (same position)
   ▼   ~600ms exit transition (reverse)
artwork detail (white)   ← image + copy restored, scroll reset
```

Closing the artwork detail (back button / Esc / route) while in process mode auto-exits and resets.

## 5. Architecture

All additions live in `title-screen.html`. Three additions: CSS, DOM markup, and a JS module.

### 5.1 DOM markup (static, inside `.artwork-detail`)

Add two children to the existing `.artwork-detail` element (sibling to `.artwork-detail__back` and
`.artwork-detail__viewport`):

```html
<!-- sticky bottom-center toggle; label swapped in JS -->
<button type="button" class="artwork-detail__process-toggle" aria-pressed="false">
  <span class="artwork-detail__process-toggle-label">View Process</span>
</button>

<!-- black process layer, hidden until entered -->
<div class="process-mode" aria-hidden="true">
  <div class="process-mode__scroll" data-lenis-prevent tabindex="-1">
    <div class="process-mode__rail">              <!-- tall: provides scroll length -->
      <div class="process-mode__stage">           <!-- position: sticky; pinned 100vh viewport -->
        <div class="process-mode__track">         <!-- translateX by progress -->
          <svg class="process-mode__line" preserveAspectRatio="none">
            <path class="process-mode__line-base" />   <!-- gray full path -->
            <path class="process-mode__line-fill" />   <!-- white, dashoffset = (1-p)*len -->
          </svg>
          <!-- .process-mode__node × 6 injected by JS -->
        </div>
      </div>
    </div>
  </div>
</div>
```

Each node (built in JS):
```html
<figure class="process-mode__node process-mode__node--above" style="--x: 14%; --img: url(...)">
  <div class="process-mode__node-img"></div>
  <figcaption class="process-mode__node-caption">
    <span class="process-mode__node-index">01</span>
    <p class="process-mode__node-text">…placeholder…</p>
  </figcaption>
</figure>
```

### 5.2 CSS (in existing `<style>`, BEM `__`/`--` conventions, design tokens)

- **Toggle button** — mirror `.loader__status` centering + `.artwork-detail__back` typography:
  `position: fixed; left: 50%; bottom: clamp(22px,4vh,52px); transform: translate3d(-50%,0,0); z-index: 4;`
  uppercase 11px `--sans`, color `rgba(3,3,3,.76)` → hover `var(--ink)`. When process mode is active
  the button gets `.is-exit`: its color flips to light (`rgba(255,255,255,.8)` → `#fff`) so it reads on black.
  Reveal tied to `.artwork-detail.is-ready` (same as back button).
- **`.process-mode`** — `position: absolute; inset: 0; z-index: 2;` (between viewport z1 and back/toggle
  z3+), `background: #050505;` `opacity: 0; visibility: hidden;` transition `opacity 420ms` +
  `visibility 0s 420ms`. Active state `.artwork-detail.is-process .process-mode` → opacity 1, visible.
- **`.process-mode__scroll`** — `position:absolute; inset:0; overflow-y:auto; overflow-x:hidden;`
  `data-lenis-prevent` keeps Lenis out; hide scrollbar like `.artwork-detail__viewport`.
- **`.process-mode__rail`** — `position:relative; height: var(--rail-h, 460vh);` (scroll length).
- **`.process-mode__stage`** — `position: sticky; top: 0; height: 100vh; overflow: hidden;`
- **`.process-mode__track`** — `position:absolute; inset:0; width: var(--track-w, 320vw);`
  `transform: translate3d(calc(var(--p) * (100vw - var(--track-w))), 0, 0);` (driven by `--p` 0→1).
- **`.process-mode__line`** — full-size SVG spanning the track; centered vertically.
  `__line-base` stroke `rgba(255,255,255,.16)`; `__line-fill` stroke `#fff`, `stroke-dasharray:<len>;
  stroke-dashoffset: calc((1 - var(--p)) * <len>);` set in JS from measured path length.
- **`.process-mode__node`** — `position:absolute; left: var(--x); top: 50%;` translate to sit off the
  line; `--above` shifts up, default shifts down. Image block fixed size
  (`width: clamp(150px, 18vw, 280px); aspect-ratio: 4/5;`), caption to its right (`flex; gap`).
  Caption text `--sans`, light on black; index in `--ink-faint`-equivalent light tone.
  Reveal: nodes fade/slide in based on a per-node `--reveal` set in JS (distance from viewport center).
- **Reduced motion** (`@media (prefers-reduced-motion: reduce)` and/or `reduceScrollMotion` class):
  `.process-mode__rail` height auto; `__stage` static; `__track` becomes a vertical flex stack,
  full line white, all nodes visible. No scroll-scrub.

### 5.3 JS module `processMode`

Declared near the other artwork-detail helpers (~line 3781+). Reuses `clamp01`, `smoothstep`,
`cosineEase`, `escapeHTML`.

```
const PROCESS = { active: false, built: false, p: 0, nodes: 6 };
const PROCESS_IMAGES = ['black-white-acrylic-painting.jpg','bright-turquoise-yellow-paint.jpg',
                        'rm167batch2-sasi-51.jpg','vertical-grey-scale-shot-textured-black-white-surface.jpg'];
const PROCESS_CAPTIONS = [ /* 6 placeholder strings */ ];

processModeRefs()            // cache DOM nodes once (.process-mode, scroll, rail, stage, track, line paths, toggle)
setProcessModeContent(index) // build 6 .process-mode__node for artwork[index]; cycle images; set --x positions
                             //   (also (re)measure line path length → set dasharray/offset baseline)
enterProcessMode()           // guard !transitioning; artworkDetail.classList.add('is-process');
                             //   toggle button → 'Exit' + .is-exit + aria-pressed; reset scroll to 0; focus mgmt
exitProcessMode()            // remove 'is-process'; button → 'View Process'; reset scroll; restore detail focus
toggleProcessMode()          // click handler
onProcessScroll()            // rAF-debounced; p = clamp01(scrollTop/(scrollHeight-clientHeight));
                             //   stage.style.setProperty('--p', p); update each node --reveal from its screen x
window.__PROCESS = { state: PROCESS, park(p){…set --p + recompute…}, enter, exit, refs getters }
```

Wiring:
- Build content in `setArtworkDetailContent(index)` (call `setProcessModeContent(index)`), so process
  content matches the open artwork.
- Toggle button `click` → `toggleProcessMode`.
- `.process-mode__scroll` `scroll` listener → `onProcessScroll` (rAF-debounced, like
  `requestScrollSceneUpdate`).
- **Reset hook:** in `closeArtworkDetail` (after it clears classes, ~line 4356) call
  `exitProcessMode({ immediate: true })` so closing the detail always leaves process mode clean.
- Guard against `artworkDetailState.transitioning`.

## 6. Scroll → progress → visuals (the core mechanic)

1. `.process-mode__scroll` has a tall `.process-mode__rail` (~460vh) → real native scroll range.
2. `.process-mode__stage` is `position: sticky; top:0; height:100vh` → it pins for the rail duration.
3. On scroll: `p = clamp01(scrollTop / (scrollHeight - clientHeight))`.
4. `--p` on the stage drives: (a) `.process-mode__track` `translateX(p·(100vw − track-w))` → nodes sweep
   right→left; (b) `.process-mode__line-fill` `stroke-dashoffset = (1−p)·pathLength` → gray fills white.
5. Per-node reveal: each node's distance from the viewport horizontal center → `--reveal` (0..1) →
   opacity + slight Y translate, so nodes "arrive" as they cross.

No interaction with Lenis or `updateScrollScene`; everything is local to the process layer and only
runs while `PROCESS.active`.

## 7. Transitions

**Enter (~700ms):** add `.is-process`. CSS handles: detail `__media` fades+scales down (a `.is-process`
rule on `.artwork-detail` targeting `__media`, `__eyebrow`, `__title`, `__copy` → opacity 0 / scale
0.92), `.process-mode` fades in over black, line draws in (its container opacity), button morphs label +
`.is-exit`. Nodes start hidden and reveal on first scroll.

**Exit (~600ms):** remove `.is-process` → reverse. Reset `.process-mode__scroll` scrollTop to 0 and
`--p` to 0 so re-entry is clean.

**Back button in process mode:** the top-left `.artwork-detail__back` (which returns to the gallery)
**fades out on enter** and **fades back on exit**, so in process mode the only control is the
bottom-center **Exit** button. (Rule: `.artwork-detail.is-process .artwork-detail__back { opacity: 0;
pointer-events: none; }`.)

## 8. Edge cases

- **Reduced motion:** static vertical stack, full white line, all nodes shown; toggle still flips
  view↔exit but no scrubbing.
- **Resize:** recompute path length (dasharray) and node `--x` → keep fill + positions correct; listen
  on `resize` while active only.
- **Close while in process mode:** `closeArtworkDetail` force-exits (immediate) and resets state.
- **Open a different artwork:** `setProcessModeContent(index)` rebuilds nodes; ensure not stuck in
  `.is-process` from a prior open (open path starts with process off).
- **Focus/a11y:** toggle is a real `<button aria-pressed>`; `.process-mode` `aria-hidden` toggles with
  active; focus moves to the toggle on enter, back to back-button/last focus on exit. Background inert
  logic unchanged.
- **Double-click / rapid toggle:** guard with `artworkDetailState.transitioning` and a local
  `PROCESS.busy` flag.

## 9. Verification plan

- `window.__PROCESS.park(p)` sets `--p` and recomputes (mirrors `window.__MORPH2.park`).
- New `fracture-verification/drive-process.mjs`: open the page, open an artwork detail (via the existing
  hooks / clicking View More), click View Process, then `park` a sweep of `p` ∈ {0,.25,.5,.75,1} and
  screenshot — verify line fills gray→white, track translates, nodes sweep, button reads "Exit".
  Also capture enter/exit and a reduced-motion render.
- Manual: real wheel/trackpad scroll feel; Exit restores the white detail with image + copy intact.

## 10. Integration points (reference)

| What | Where (current) |
|---|---|
| `.artwork-detail` markup (add toggle + `.process-mode`) | HTML body, overlay block (~line 1700–1760, near `#artwork-detail-scroll` at 1725) |
| Design tokens | `:root` 77–90 (`--ink`, `--ink-dim`, `--ink-faint`, `--bg`, `--serif`, `--sans`) |
| Button style precedent | `.artwork-detail__back` 710–749; bottom-center `.loader__status` 1344–1362 |
| Build content per artwork | `setArtworkDetailContent` 3781–3810 |
| Open/ready lifecycle | `openArtworkDetail` 4277–4334; `setArtworkDetailClasses` 3757–3761 |
| Close + reset hook | `closeArtworkDetail` 4336–4371 (force-exit ~4356) |
| Reduced motion flag | `reduceScrollMotion` 2320; detail RM media query 1557–1593 |
| Module pattern + helpers | `morph2` 9499–9579; `clamp01/smoothstep/cosineEase` 2760–2772; `escapeHTML` 3700 |
| Self-contained-module skeleton + `window.__X` hook | `window.__MORPH2` 9550–9579 |

## 11. Out of scope / future

- Real authored process content per artwork (replace placeholders with a `artworks[].timeline` array).
- Per-node click → lightbox.
- URL/hash deep-linking to process mode.
