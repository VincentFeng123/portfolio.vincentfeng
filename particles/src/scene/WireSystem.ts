/**
 * The unified particle representation: wires ARE the particles.
 * One LineSegments draw (all wires), one Points draw (tips riding the leading
 * edges), one Points draw (dust garnish during dissolve). All motion lives in
 * the vertex shaders, driven by the shared U uniforms.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MathUtils,
  Mesh,
  Points,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import { U, WORLD } from '../state/uniforms';
import type { WireData } from './sampling';
import type { Tier } from '../core/Quality';
import noiseChunk from '../shaders/chunks/noise.glsl';
import curveChunk from '../shaders/chunks/curve.glsl';
import wiresVert from '../shaders/wires.vert.glsl';
import wiresFrag from '../shaders/wires.frag.glsl';
import tipsVert from '../shaders/tips.vert.glsl';
import tipsFrag from '../shaders/tips.frag.glsl';
import dustVert from '../shaders/dust.vert.glsl';
import dustFrag from '../shaders/dust.frag.glsl';

// vite-plugin-glsl strips comments on import, so inject the shared chunks
// before a code token that survives the transform (first occurrence only)
const INJECT_TOKEN = 'ivec2 texelCoord(int i)';

function withChunks(src: string): string {
  if (!src.includes(INJECT_TOKEN)) throw new Error('shader missing chunk injection token');
  return src.replace(INJECT_TOKEN, `${noiseChunk}\n${curveChunk}\n${INJECT_TOKEN}`);
}

// generous bound: head at origin to glasses at -6, plus scatter/jitter room
const BOUNDS = new Sphere(new Vector3(0, WORLD.GLASSES_POS_Y / 2, 0), 6.5);

export class WireSystem {
  readonly group = new Group();
  readonly wires: Mesh;
  readonly tips: Points;
  readonly dust: Points;

  private readonly wireMat: ShaderMaterial;
  private readonly tipMat: ShaderMaterial;
  private readonly dustMat: ShaderMaterial;

  constructor(data: WireData, tier: Tier) {
    const segments = tier.wireSegments;
    const count = data.count;

    // ---- wires: one screen-space quad instance per curve segment -----------
    const wireGeo = new InstancedBufferGeometry();
    // position.x = endpoint select (0/1), position.y = side (-1/+1)
    wireGeo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3),
    );
    wireGeo.setIndex([0, 2, 1, 2, 3, 1]);
    const instCount = count * segments;
    const aWire = new Float32Array(instCount);
    const aSeg = new Float32Array(instCount);
    for (let w = 0; w < count; w++) {
      for (let s = 0; s < segments; s++) {
        const i = w * segments + s;
        aWire[i] = w;
        aSeg[i] = s;
      }
    }
    wireGeo.setAttribute('aWire', new InstancedBufferAttribute(aWire, 1));
    wireGeo.setAttribute('aSeg', new InstancedBufferAttribute(aSeg, 1));
    wireGeo.instanceCount = instCount;
    wireGeo.boundingSphere = BOUNDS.clone();

    const texUniforms = {
      uTexA: { value: data.texA },
      uTexB: { value: data.texB },
      uTexC: { value: data.texC },
    };

    // total additive energy stays constant whether a tier draws 192 or 512 wires
    const countScale = { value: Math.min(2.0, Math.max(0.4, 512 / count)) };

    this.wireMat = new ShaderMaterial({
      vertexShader: withChunks(wiresVert),
      fragmentShader: wiresFrag,
      uniforms: {
        ...texUniforms,
        uDissolve: U.uDissolve,
        uScatter: U.uScatter,
        uGrow: U.uGrow,
        uRelease: U.uRelease,
        uTwist: U.uTwist,
        uFuse: U.uFuse,
        uHarden: U.uHarden,
        uWireAlpha: U.uWireAlpha,
        uFogDensity: U.uFogDensity,
        uTime: U.uTime,
        uCountScale: countScale,
        uResolution: { value: new Vector2(1, 1) },
        uLineWidth: { value: 3.5 },
        uSegments: { value: segments },
      },
      side: DoubleSide, // screen-space expansion can flip winding
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    this.wires = new Mesh(wireGeo, this.wireMat);
    this.wires.frustumCulled = false;
    this.wires.renderOrder = 10;

    // ---- tips ----------------------------------------------------------------
    const tipPos = new Float32Array(count * 3);
    for (let w = 0; w < count; w++) tipPos[w * 3] = w;
    const tipGeo = new BufferGeometry();
    tipGeo.setAttribute('position', new BufferAttribute(tipPos, 3));
    tipGeo.boundingSphere = BOUNDS.clone();

    this.tipMat = new ShaderMaterial({
      vertexShader: withChunks(tipsVert),
      fragmentShader: tipsFrag,
      uniforms: {
        ...texUniforms,
        uDissolve: U.uDissolve,
        uScatter: U.uScatter,
        uGrow: U.uGrow,
        uRelease: U.uRelease,
        uTwist: U.uTwist,
        uFuse: U.uFuse,
        uHarden: U.uHarden,
        uReveal: U.uReveal,
        uFogDensity: U.uFogDensity,
        uTime: U.uTime,
        uScale: { value: 1000 },
        uTipSize: { value: 0.028 },
        uCountScale: countScale,
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    this.tips = new Points(tipGeo, this.tipMat);
    this.tips.frustumCulled = false;
    this.tips.renderOrder = 11;

    // ---- dust ----------------------------------------------------------------
    const dustGeo = new BufferGeometry();
    dustGeo.setAttribute('position', new BufferAttribute(data.dust.positions, 3));
    dustGeo.setAttribute('aNormal', new BufferAttribute(data.dust.normals, 3));
    dustGeo.setAttribute('aSeed', new BufferAttribute(data.dust.seeds, 1));
    dustGeo.setAttribute('aBias', new BufferAttribute(data.dust.biases, 1));
    dustGeo.boundingSphere = BOUNDS.clone();

    this.dustMat = new ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      uniforms: {
        uDissolve: U.uDissolve,
        uGrow: U.uGrow,
        uFogDensity: U.uFogDensity,
        uTime: U.uTime,
        uScale: { value: 1000 },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    this.dust = new Points(dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 12;

    this.group.add(this.wires, this.tips, this.dust);
  }

  /** projection scales for points + ribbon width; call on resize/DPR change */
  setViewport(bufferWidth: number, bufferHeight: number, fovDeg: number, dpr: number): void {
    const scale = bufferHeight / (2 * Math.tan(MathUtils.degToRad(fovDeg) / 2));
    this.tipMat.uniforms.uScale.value = scale;
    this.dustMat.uniforms.uScale.value = scale;
    (this.wireMat.uniforms.uResolution.value as Vector2).set(bufferWidth, bufferHeight);
    this.wireMat.uniforms.uLineWidth.value = 3.5 * dpr; // constant CSS-px width
  }

  /** real perf, not hygiene: skips the biggest draws outside their stages */
  updateVisibility(): void {
    const dissolveActive = U.uDissolve.value > 0.001;
    const absorbed = U.uReveal.value >= 0.999;
    this.wires.visible = U.uGrow.value > 0.001 && U.uWireAlpha.value > 0.001 && !absorbed;
    this.tips.visible = dissolveActive && !absorbed;
    this.dust.visible = dissolveActive && U.uGrow.value < 0.6;
  }
}
