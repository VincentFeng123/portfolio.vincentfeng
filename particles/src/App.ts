/**
 * Orchestrator. Owns THE single gsap.ticker callback: GSAP updates first
 * (ScrollTrigger scrub -> timeline -> U/S), then this composes the camera,
 * applies JS-side state, and renders. Exactly one rAF in the page; rendering
 * pauses for free when the tab hides.
 */

import { Timer } from 'three';
import gsap from 'gsap';
import { Stage } from './core/Stage';
import { Viewport } from './core/Viewport';
import { FrameGovernor, type Tier } from './core/Quality';
import { HeadMesh } from './scene/HeadMesh';
import { GlassesMesh } from './scene/GlassesMesh';
import { WireSystem } from './scene/WireSystem';
import { buildWireData } from './scene/sampling';
import { S, U, WORLD } from './state/uniforms';
import type { HeadAsset, GlassesAsset } from './assets/normalize';

export class App {
  readonly stage: Stage;
  readonly wireSystem: WireSystem;
  readonly head: HeadMesh;
  readonly glasses: GlassesMesh;

  /** debug hook (stats-gl) */
  onAfterRender: (() => void) | null = null;

  private readonly viewport = new Viewport();
  private readonly governor: FrameGovernor;
  private readonly timer = new Timer();
  private readonly tier: Tier;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement, tier: Tier, headAsset: HeadAsset, glassesAsset: GlassesAsset) {
    this.tier = tier;
    this.dpr = Math.min(window.devicePixelRatio || 1, tier.dprCap);

    this.stage = new Stage(canvas, tier);

    const data = buildWireData(headAsset, glassesAsset, tier.wireCount, tier.dustCount);

    this.head = new HeadMesh(headAsset, data.headRemap);
    this.glasses = new GlassesMesh(glassesAsset, data.glassesRemap, data.glassesCenter, data.glassesMaxDist);
    this.wireSystem = new WireSystem(data, tier);

    this.stage.scene.add(this.head.group, this.glasses.group, this.wireSystem.group);

    this.governor = new FrameGovernor(this.dpr, (dpr) => {
      this.dpr = dpr;
      this.viewport.force();
    });

    this.applySize(window.innerWidth, window.innerHeight);
  }

  private applySize(width: number, height: number): void {
    this.stage.setSize(width, height, this.dpr);
    this.wireSystem.setViewport(width * this.dpr, height * this.dpr, WORLD.CAMERA_FOV, this.dpr);
  }

  /** compile every program + prime the bloom targets before first scroll */
  async warmup(): Promise<void> {
    const objects = [
      ...this.head.group.children,
      ...this.glasses.group.children,
      ...this.wireSystem.group.children,
    ];
    for (const o of objects) o.visible = true;
    await this.stage.renderer.compileAsync(this.stage.scene, this.stage.camera);
    this.stage.composer.render();
    this.syncVisibility();
  }

  start(): void {
    // lag smoothing stays OFF — Lenis (registered earlier on the same ticker)
    // requires it; tab-resume jumps are handled by Lenis's own clamping
    gsap.ticker.lagSmoothing(0);
    gsap.ticker.add(this.tick);
  }

  private syncVisibility(): void {
    this.head.updateVisibility();
    this.glasses.updateVisibility();
    this.wireSystem.updateVisibility();
  }

  private tick = (): void => {
    const resize = this.viewport.consume();
    if (resize) this.applySize(resize.width, resize.height);

    this.governor.tick();

    this.timer.update();
    const t = this.timer.getElapsed();
    U.uTime.value = t;

    // idle drift: additive, time-based, NEVER written into S (GSAP would
    // fight it). Three unsynced sine periods = non-looping organic motion.
    const ix = Math.sin(t * 0.23) * 0.06;
    const iy = Math.sin(t * 0.31) * 0.04;
    const iz = Math.sin(t * 0.17) * 0.05;

    const cam = this.stage.camera;
    cam.position.set(
      Math.sin(S.camYaw) * S.camZ + ix,
      S.camY + iy,
      Math.cos(S.camYaw) * S.camZ + iz,
    );
    cam.lookAt(0, S.lookY, 0);

    // lighting follows the journey so the look angle stays consistent
    this.stage.lightRig.position.y = S.lookY;

    this.glasses.tick(S.glassesYaw, S.glassesPitch);
    this.syncVisibility();

    this.stage.bloomPass.strength = S.bloom;
    this.stage.gradePass.uniforms.uVignette.value = S.vignette;
    this.stage.gradePass.uniforms.uTime.value = t;

    this.stage.composer.render();
    this.onAfterRender?.();
  };
}
