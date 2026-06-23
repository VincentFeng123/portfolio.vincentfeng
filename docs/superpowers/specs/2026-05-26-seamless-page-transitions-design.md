# Seamless Page Transitions — Design

- **Date:** 2026-05-26
- **Status:** Approved (design); pending implementation plan
- **Scope:** `title-screen.html` (the "main page") and the project pages it links to

## Problem

Two transitions feel un-seamless:

- **P1 — In-page "More info" morph.** The `#artwork-detail` panel (opened by the "View More" button, `title-screen.html:1444`) already animates same-page with no reload (shared-element clone fly + `history.pushState`), but it flashes.
- **P2 — Project navigation.** Clicking a project loads a separate `projects/*.html` document (the original Immersive Garden Nuxt build) with a full browser reload → white flash. No View Transitions anywhere yet.

## Decisions

- Target environment: **served over HTTP, same origin, modern Chrome/Safari** (graceful degradation elsewhere). Confirmed with user.
- **P1: targeted fixes** to the existing clone morph (keep the effect, fix the two flash sources). Not a rewrite.
- **P2: cross-document View Transitions API** (`@view-transition { navigation: auto }`) — crossfade only, no cross-build shared-element morph.
- P1 and P2 are independent and can ship separately (P1 first).

## P1 — Targeted fixes — DONE (verified via harness)

Baseline render corrected the diagnosis:

1. **Background snap — NOT a real problem.** `#stage` has `transition: opacity 1.5s` (`:1166`) so the David scene *fades*, and the panel covers it by ~620ms anyway. No fix made or needed.
2. **Double-image / ghost — the real, visible defect (FIXED).** The real `__title`/`__media` were revealed at ~260ms (`is-ready`) while their clones kept flying to ~1100ms, so they coexisted and visibly doubled (clearest on the title; `close-00.jpg` baseline showed two overlapping titles).
   - **Fix shipped:** title + media are removed from the `is-ready` reveal. They now stay hidden during the clone flight and are snapped in instantly via a new `is-hero-in` class *after* the clones land (`playCloneTransition` gained a `keep` option so the clone isn't removed until the real element has painted one frame beneath it). On close, `is-hero-out` snaps them hidden the instant the clones are created, so only the clones fly back. Eyebrow/copy/back still fade in early via `is-ready`.

**Verification:** `fracture-verification/drive-transition.mjs` opacity timeline shows `title`/`media` = 0 for the entire flight, then a clean snap-in hand-off; `close-00.jpg` now shows a single title; `0 page errors`; reduced-motion routes through the instant (no-clone) branch which reveals both classes immediately.

## P2 — Cross-document View Transitions — IMPLEMENTED (visual confirmation pending in a real browser)

Opt-in shipped as two edits (instead of ~22) because all Nuxt pages share one stylesheet:

```css
@view-transition { navigation: auto; }
::view-transition-old(root), ::view-transition-new(root){
  animation-duration: 460ms;
  animation-timing-function: cubic-bezier(.18, .78, .28, 1);
}
@media (prefers-reduced-motion: reduce){
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*){ animation: none !important; }
}
```

- **Where:** appended to `assets/entry.CEhA1U0S.css` (loaded by every project page + `projects/index.html` + the original site pages) and added to `title-screen.html`'s `<style>`. So both ends of the `title-screen ↔ project` navigation opt in.
- **Confirmed:** project links on the title screen are plain `<a href="projects/*.html">` (title-screen does NOT boot Nuxt, so clicks are real navigations); both page types still render after the shared-CSS edit; `0` page errors; `document.startViewTransition` available. The cross-doc VT mechanism itself is verified in this browser via a minimal A→B harness test (`pageswap`/`pagereveal` report `viewTransition=true`).
- **Could NOT headlessly capture** the crossfade on the real `title-screen → project` nav (scripted clicks on the footer links are flaky; the heavy Nuxt destination clears sessionStorage / drops console logs; screencast missed the brief crossfade during the destination's load). **Action: confirm the feel by clicking a project from the title screen in Chrome/Safari.**
- **Known nuance (not yet handled):** project pages open on their own "IMMERSIVE GARDEN" intro loader, so the crossfade lands on that loader rather than directly on project content; and browser-Back to the title screen will crossfade into the title screen's own intro. Suppressing the intro on back-navigation (e.g. via `performance.getEntriesByType('navigation')[0].type === 'back_forward'`) is a follow-up if the feel warrants it.

## Verification

- **Before any change:** render the current transition with the existing harness (`fracture-verification/shoot.mjs` / `drive-real.mjs`, served at `localhost:8123`, Chrome-for-Testing via `CHROME` env) to capture the flash frames as a baseline.
- **After:** re-render the same open/close sequence and project nav; compare before/after frames. Confirm no flash, no ghost, no end-pop, and that reduced-motion still collapses to instant.

## Out of scope

- Shared-element morph between the title screen and the (different-build) project pages.
- Support for browsers without View Transitions beyond graceful fallback to normal navigation.
- Redesign of the artwork-detail layout or the project pages themselves.

## Risks / open questions

- Whether the title screen's project links are plain anchors (must confirm during planning).
- Back-nav intro-loader suppression may need a small flag (e.g., reading `navigation` type or a sessionStorage marker).
- Exact crossfade duration/easing is a feel decision — tune against rendered frames.
