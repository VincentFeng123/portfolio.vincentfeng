/**
 * THE canonical contract between scroll choreography (GSAP writes), the GPU
 * systems (shaders read), and the render loop (App composes).
 *
 * GSAP tweens `.value` on the U entries directly; the same objects are passed
 * by reference into every ShaderMaterial and onBeforeCompile patch, so there
 * is no copy/sync layer.
 */

import type { IUniform } from 'three';

export const U = {
  /** particle-birth threshold against the head dissolve field (LEADS uErode) */
  uDissolve: { value: 0 },
  /** solid-head pixel-death threshold — same field, constant lag behind uDissolve */
  uErode: { value: 0 },
  /** particle lift off the head surface along normals */
  uScatter: { value: 0 },
  /** global wire (line) emissive fade in/out */
  uWireAlpha: { value: 0 },
  /** wire leading-edge progress: draws downward, tips reach glasses at 1 */
  uGrow: { value: 0 },
  /** helical vortex twist amplitude */
  uTwist: { value: 0 },
  /** wire tail progress: detaches from head, energy packet travels down */
  uRelease: { value: 0 },
  /** convergence funnel pinch toward the bundle axis */
  uFuse: { value: 0 },
  /** jitter -> 0, tips shrink onto the glasses surface */
  uHarden: { value: 0 },
  /** solid-glasses materialization threshold (LAGS uHarden) */
  uReveal: { value: 0 },
  /** lens specular sweep — the single glint mechanism */
  uGlint: { value: 0 },
  /** view-distance fade-to-zero in the additive shaders (replaces scene.fog) */
  uFogDensity: { value: 0.02 },
  /** seconds — ambient shimmer only; oscillation OK, net drift forbidden */
  uTime: { value: 0 },
} satisfies Record<string, IUniform<number>>;

/** JS-side tweened state: camera rig + post. Composed in App's ticker. */
export const S = {
  camY: 0.15,
  camZ: 5.2,
  camYaw: 0,
  lookY: 0.15,
  bloom: 0.35,
  vignette: 0.65,
  /** end-state presentation pose; baked pose is subtracted in App per tick */
  glassesYaw: -0.17,
  glassesPitch: 0.06,
};

/** World-space contract (section 1 of the plan). */
export const WORLD = {
  HEAD_HEIGHT: 2.0,
  GLASSES_WIDTH: 1.8,
  GLASSES_POS_Y: -6,
  /** presentation pose baked into the glasses geometry before sampling */
  BAKED_YAW: -0.17,
  BAKED_PITCH: 0.06,
  CAMERA_FOV: 35,
};

export function resetState(): void {
  for (const key of Object.keys(U) as (keyof typeof U)[]) U[key].value = 0;
  U.uFogDensity.value = 0.02;
  S.camY = 0.15;
  S.camZ = 5.2;
  S.camYaw = 0;
  S.lookY = 0.15;
  S.bloom = 0.35;
  S.vignette = 0.65;
  S.glassesYaw = WORLD.BAKED_YAW;
  S.glassesPitch = WORLD.BAKED_PITCH;
}
