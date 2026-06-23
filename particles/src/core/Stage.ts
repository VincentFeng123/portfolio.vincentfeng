/**
 * Renderer + scene + camera + composer chain + lighting.
 * Composer: Render -> UnrealBloom (HDR threshold 0.85) -> Grade (vignette +
 * animated grain, kills near-black banding) -> OutputPass (ACES + sRGB, last).
 */

import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Group,
  HalfFloatType,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WORLD } from '../state/uniforms';
import type { Tier } from './Quality';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.65 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uVignette;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  // vignette: uVignette is the radius where darkening begins (lower = tighter)
  float d = distance(vUv, vec2(0.5)) * 1.4142;
  float dark = smoothstep(uVignette, 1.35, d);
  c.rgb *= 1.0 - 0.75 * dark;
  // animated film grain — dithers away banding on the near-black field
  float g = hash(vUv * vec2(1921.0, 1083.0) + fract(uTime) * 91.7) - 0.5;
  c.rgb += g * 0.016;
  gl_FragColor = c;
}`,
};

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloomPass: UnrealBloomPass;
  readonly gradePass: ShaderPass;
  /** rim/key rig — App slides it down with lookY so lighting follows the journey */
  readonly lightRig = new Group();

  private readonly bloomDivisor: number;

  constructor(canvas: HTMLCanvasElement, tier: Tier) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x070a0e, 1);

    this.camera = new PerspectiveCamera(WORLD.CAMERA_FOV, 1, 0.1, 50);
    this.camera.position.set(0, 0.15, 5.2);

    // soft IBL so marble and gloss plastic read — no HDR asset needed
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // key + the money lights: two cool rims from behind for silver silhouettes
    const target = new Object3D();
    this.lightRig.add(target);

    const key = new DirectionalLight(0xffffff, 0.65);
    key.position.set(-2.5, 3, 4);
    key.target = target;

    const rimL = new DirectionalLight(0xccd9ff, 1.3);
    rimL.position.set(-3, 0.8, -4);
    rimL.target = target;

    const rimR = new DirectionalLight(0xccd9ff, 1.3);
    rimR.position.set(3, 0.8, -4);
    rimR.target = target;

    this.lightRig.add(key, rimL, rimR);
    this.scene.add(this.lightRig);

    const rt = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: tier.msaa,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.5, 0.85);
    this.composer.addPass(this.bloomPass);
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());

    this.bloomDivisor = tier.bloomDivisor;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    // UnrealBloom internally halves its input size, so feeding the full
    // buffer size gives half-res bloom (divisor 2); feed half size on the
    // LOW tier for quarter-res (divisor 4)
    const bw = Math.max(2, Math.round((width * dpr * 2) / this.bloomDivisor));
    const bh = Math.max(2, Math.round((height * dpr * 2) / this.bloomDivisor));
    this.bloomPass.setSize(bw, bh);
  }
}
