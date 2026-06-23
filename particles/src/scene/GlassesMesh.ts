/**
 * The solid sunglasses: opaque frame + trim with the mirror reveal patch
 * (seam B — surface materializes bridge-outward under the absorbing tips),
 * and the transparent lens (no discard — opacity fade + fresnel + uGlint).
 */

import {
  Group,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { U, WORLD } from '../state/uniforms';
import type { GlassesAsset } from '../assets/normalize';
import type { FieldRemap } from './sampling';
import noiseChunk from '../shaders/chunks/noise.glsl';
import dissolveChunk from '../shaders/chunks/dissolve.glsl';

export class GlassesMesh {
  readonly group = new Group();
  private readonly frame: Mesh;
  private readonly trim: Mesh;
  private readonly lens: Mesh;
  private readonly lensMat: MeshPhysicalMaterial;

  constructor(asset: GlassesAsset, remap: FieldRemap, center: Vector3, maxDist: number) {
    type PatchShader = {
      uniforms: Record<string, { value: unknown }>;
      vertexShader: string;
      fragmentShader: string;
    };
    const patchReveal = (shader: PatchShader) => {
      Object.assign(shader.uniforms, {
        uReveal: U.uReveal,
        uGlassesCenter: { value: center },
        uGlassesMaxDist: { value: maxDist },
        uFieldMinG: { value: remap.min },
        uFieldRangeG: { value: remap.range },
      });

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos2;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWorldPos2 = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'varying vec3 vWorldPos2;',
            'uniform float uReveal;',
            'uniform vec3 uGlassesCenter;',
            'uniform float uGlassesMaxDist;',
            'uniform float uFieldMinG;',
            'uniform float uFieldRangeG;',
            noiseChunk,
            dissolveChunk,
          ].join('\n'),
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
{
  float f = remapField(fieldGlasses(vWorldPos2, uGlassesCenter, uGlassesMaxDist), uFieldMinG, uFieldRangeG);
  if (f > uReveal) discard;
  // silver-hot growth front; gated off as uReveal -> 1 so the final product
  // shot is clean
  float edge = (1.0 - smoothstep(uReveal - 0.08, uReveal, f)) * (1.0 - smoothstep(0.93, 1.0, uReveal));
  totalEmissiveRadiance += vec3(2.0, 2.1, 2.4) * edge;
  float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  totalEmissiveRadiance += fres * 0.45 * uReveal * vec3(0.7, 0.78, 0.9);
}`,
        );
    };

    const frameMat = new MeshPhysicalMaterial({
      color: 0x16181c,
      roughness: 0.35,
      metalness: 0.1,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.6,
    });
    frameMat.customProgramCacheKey = () => 'glasses-reveal-physical';
    frameMat.onBeforeCompile = patchReveal;

    const trimMat = new MeshStandardMaterial({
      color: 0xccab94, // the model's tan hinge/trim base color
      roughness: 0.8,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });
    trimMat.customProgramCacheKey = () => 'glasses-reveal-standard';
    trimMat.onBeforeCompile = patchReveal;

    this.lensMat = new MeshPhysicalMaterial({
      color: 0x66788c, // smoky blue-gray — white reads as milk over the dark field
      roughness: 0.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      envMapIntensity: 0.22,
    });
    this.lensMat.customProgramCacheKey = () => 'glasses-lens';
    this.lensMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uReveal: U.uReveal,
        uGlint: U.uGlint,
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos2;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWorldPos2 = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'varying vec3 vWorldPos2;',
            'uniform float uReveal;',
            'uniform float uGlint;',
          ].join('\n'),
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
{
  // fresnel sheen so flat glass reads on a near-black field
  float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  totalEmissiveRadiance += fres * 0.25 * uReveal * vec3(0.7, 0.78, 0.9);
  // the glint: one specular band sweeping across both lenses
  float gx = mix(-1.1, 1.1, uGlint);
  float band = exp(-pow((vWorldPos2.x - gx) / 0.18, 2.0));
  float pulse = sin(3.14159265 * clamp(uGlint, 0.0, 1.0));
  totalEmissiveRadiance += vec3(2.2, 2.3, 2.5) * band * pulse * (0.35 + 0.65 * fres);
}`,
        );
    };

    this.frame = new Mesh(asset.frame, frameMat);
    this.trim = new Mesh(asset.trim, trimMat);
    this.lens = new Mesh(asset.lens, this.lensMat);
    this.lens.renderOrder = 20;

    this.group.add(this.frame, this.trim, this.lens);
    this.group.position.set(0, WORLD.GLASSES_POS_Y, 0);
    this.group.rotation.order = 'YXZ';
  }

  /** lens opacity + the settle rotation delta (baked pose subtracted) */
  tick(glassesYaw: number, glassesPitch: number): void {
    this.lensMat.opacity = 0.25 * MathUtils.smoothstep(U.uReveal.value, 0.55, 0.9);
    this.group.rotation.y = glassesYaw - WORLD.BAKED_YAW;
    this.group.rotation.x = glassesPitch - WORLD.BAKED_PITCH;
  }

  updateVisibility(): void {
    const reveal = U.uReveal.value;
    this.frame.visible = reveal > 0.001;
    this.trim.visible = reveal > 0.001;
    this.lens.visible = reveal > 0.5;
  }
}
