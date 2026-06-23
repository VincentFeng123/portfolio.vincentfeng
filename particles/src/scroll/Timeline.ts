/**
 * The master scrubbed timeline. Duration is exactly 1.0, so every position
 * parameter IS a scroll fraction.
 *
 * Rules (they matter under scrub):
 *  - default ease "none" for anything the eye tracks continuously — the
 *    user's hand plus scrub smoothing is the easing
 *  - symmetric gentle eases for crossfades (read the same backward)
 *  - aggressive eases only on short spans (power3.in converge, back.out settle)
 *  - NO two tweens on the same property may overlap (GSAP fights itself)
 *
 * Stage map: S0 HERO 0-0.10 | S1 PARTICLEIZE 0.08-0.26 | S2 WIRES 0.22-0.56
 *            S3 CONVERGE 0.54-0.74 | S4 HARDEN 0.72-0.88 | S5 SETTLE 0.86-1.0
 */

import gsap from 'gsap';
import { S, U } from '../state/uniforms';
import type { Overlay } from '../ui/Overlay';

export function buildTimeline(overlay: Overlay): gsap.core.Timeline {
  const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });

  tl
    // ---- S0 HERO: proof of life within the first 2% of scroll --------------
    .to(S, { camZ: 4.6, duration: 0.1 }, 0)
    .to(S, { camYaw: -0.06, duration: 0.1 }, 0)

    // ---- S1 PARTICLEIZE: chin-up unravel ------------------------------------
    // seam rule: particle birth (uDissolve) LEADS pixel death (uErode) by a
    // constant 0.015 — equal durations, offset start only
    .to(U.uDissolve, { value: 1, duration: 0.16 }, 0.08)
    .to(U.uErode, { value: 1, duration: 0.16 }, 0.095)
    .to(U.uScatter, { value: 1, duration: 0.14 }, 0.1)
    .to(U.uWireAlpha, { value: 1, duration: 0.12, ease: 'sine.inOut' }, 0.1)
    .to(S, { bloom: 0.7, duration: 0.13, ease: 'sine.inOut' }, 0.1)
    .to(S, { camYaw: -0.14, duration: 0.16 }, 0.1)

    // ---- S2 WIRES: the centerpiece ------------------------------------------
    .to(U.uGrow, { value: 1, duration: 0.34 }, 0.22)
    // wow #1: bloom pulse as the first strands shoot down + descent begins
    .to(S, { bloom: 1.0, duration: 0.04, ease: 'power2.out' }, 0.23)
    .to(S, { bloom: 0.85, duration: 0.05 }, 0.27)
    .to(S, { bloom: 0.9, duration: 0.16 }, 0.34)
    // dip at the comet-arrival beat — the condensed wavefront is the
    // brightest object in the journey right before fuse unfurls it
    .to(S, { bloom: 0.72, duration: 0.06, ease: 'sine.inOut' }, 0.5)
    .to(U.uTwist, { value: 1, duration: 0.18, ease: 'sine.inOut' }, 0.26)
    // linear descent: scroll speed = travel speed, hand-cranked. lookY leads
    // camY so the camera tracks the wavefront — the growing strand ends ride
    // near screen center instead of sinking to the bottom third
    .to(S, { camY: -5.0, lookY: -5.9, duration: 0.3 }, 0.24)
    .to(S, { camZ: 5.6, duration: 0.16 }, 0.26)
    // counter-orbit against the twist — parallax makes the helix read as 3D
    .to(S, { camYaw: 0.18, duration: 0.3 }, 0.26)
    .to(U.uFogDensity, { value: 0.045, duration: 0.2 }, 0.3)
    .to(S, { vignette: 0.5, duration: 0.2 }, 0.3)

    // ---- S3+S4 COMPRESSED: the lines become the glasses IMMEDIATELY — fuse,
    // harden and reveal fire back-to-back as growth completes, no dead gap ---
    .to(U.uWireAlpha, { value: 0.65, duration: 0.12, ease: 'sine.inOut' }, 0.44)
    .to(S, { camZ: 4.2, duration: 0.1 }, 0.46)
    .to(U.uTwist, { value: 0, duration: 0.12, ease: 'sine.inOut' }, 0.46)
    .to(U.uFuse, { value: 1, duration: 0.16, ease: 'sine.inOut' }, 0.5)
    .to(U.uRelease, { value: 1, duration: 0.18 }, 0.54)
    .to(S, { camY: -6.0, lookY: -6.0, duration: 0.1 }, 0.54)
    .to(S, { camZ: 3.8, duration: 0.08 }, 0.56)
    .to(S, { camYaw: -0.05, duration: 0.16 }, 0.56)
    .to(S, { bloom: 0.95, duration: 0.08, ease: 'power1.in' }, 0.56)
    .to(U.uHarden, { value: 1, duration: 0.12, ease: 'power1.inOut' }, 0.56)
    // seam rule #2 mirror: points lock to the surface before solid pixels appear
    .to(U.uReveal, { value: 1, duration: 0.12 }, 0.58)
    .to(U.uWireAlpha, { value: 0, duration: 0.1, ease: 'sine.in' }, 0.64)
    .to(S, { camZ: 3.5, duration: 0.12 }, 0.66)
    .to(S, { bloom: 0.5, duration: 0.14, ease: 'power2.out' }, 0.64)
    .to(U.uFogDensity, { value: 0.015, duration: 0.14 }, 0.62)
    .to(S, { vignette: 0.7, duration: 0.14 }, 0.62)
    .to(U.uGlint, { value: 1, duration: 0.08 }, 0.72)

    // ---- S5 SETTLE: the only overshoot in the piece --------------------------
    .to(S, { glassesYaw: 0, glassesPitch: 0, duration: 0.12, ease: 'back.out(1.4)' }, 0.88)
    .to(S, { camZ: 3.4, duration: 0.1, ease: 'sine.out' }, 0.9)
    .to(S, { camYaw: 0, duration: 0.1, ease: 'sine.out' }, 0.9)
    .to(S, { bloom: 0.45, duration: 0.08 }, 0.92);

  overlay.addTo(tl);
  tl.set({}, {}, 1); // pin total duration to exactly 1.0
  return tl;
}

/** prefers-reduced-motion: two gentle crossfades, no travel, no twist. */
export function buildReducedTimeline(overlay: Overlay): gsap.core.Timeline {
  const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });

  tl
    .to(U.uDissolve, { value: 1, duration: 0.3 }, 0.05)
    .to(U.uErode, { value: 1, duration: 0.3 }, 0.065)
    .to(U.uScatter, { value: 0.35, duration: 0.3 }, 0.05)
    .to(S, { bloom: 0.7, duration: 0.25, ease: 'sine.inOut' }, 0.08)

    // jump cut to the glasses framing; wires pre-collapsed onto their targets
    .set(S, { camY: -6, lookY: -6, camZ: 3.6, camYaw: 0 }, 0.5)
    .set(U.uGrow, { value: 1 }, 0.5)
    .set(U.uRelease, { value: 1 }, 0.5)
    .set(U.uFuse, { value: 1 }, 0.5)
    .set(U.uScatter, { value: 0 }, 0.5)

    .to(U.uHarden, { value: 1, duration: 0.15, ease: 'power1.inOut' }, 0.55)
    .to(U.uReveal, { value: 1, duration: 0.25 }, 0.6)
    .to(S, { bloom: 0.5, duration: 0.2 }, 0.7)
    .set(S, { glassesYaw: 0, glassesPitch: 0 }, 0.88);

  overlay.addTo(tl);
  tl.set({}, {}, 1);
  return tl;
}
