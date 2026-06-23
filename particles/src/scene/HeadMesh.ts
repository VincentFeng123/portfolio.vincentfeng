/**
 * The solid David head: PBR marble with a noise-threshold dissolve patch
 * (seam A), plus a near-black BackSide shell so the mid-dissolve head reads
 * as a solid mass being eaten, not a paper shell.
 */

import {
  BackSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  ShaderMaterial,
} from 'three';
import { U } from '../state/uniforms';
import type { HeadAsset } from '../assets/normalize';
import type { FieldRemap } from './sampling';
import noiseChunk from '../shaders/chunks/noise.glsl';
import dissolveChunk from '../shaders/chunks/dissolve.glsl';

export class HeadMesh {
  readonly group = new Group();
  private readonly front: Mesh;
  private readonly backShell: Mesh;

  constructor(asset: HeadAsset, remap: FieldRemap) {
    const fieldUniforms = {
      uErode: U.uErode,
      uYMin: { value: asset.yMin },
      uHeight: { value: asset.height },
      uFieldMin: { value: remap.min },
      uFieldRange: { value: remap.range },
    };

    // -- front: patched PBR marble -------------------------------------------
    const mat = new MeshPhysicalMaterial({
      color: 0x9a9da3,
      roughness: 0.45,
      metalness: 0.05,
      clearcoat: 0.3,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.35,
    });
    mat.customProgramCacheKey = () => 'head-dissolve';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fieldUniforms);
      shader.uniforms.uRimStrength = { value: 0.3 };

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
            'uniform float uErode;',
            'uniform float uYMin;',
            'uniform float uHeight;',
            'uniform float uFieldMin;',
            'uniform float uFieldRange;',
            'uniform float uRimStrength;',
            noiseChunk,
            dissolveChunk,
          ].join('\n'),
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
{
  float f = remapField(fieldHead(vWorldPos2, uYMin, uHeight), uFieldMin, uFieldRange);
  if (f < uErode) discard;
  // burning front — HDR so bloom ignites it; gated so the untouched hero
  // head never glows at rest
  float edge = (1.0 - smoothstep(uErode, uErode + 0.08, f)) * smoothstep(0.0, 0.02, uErode);
  totalEmissiveRadiance += vec3(2.1, 2.1, 2.3) * edge;
  // guaranteed silhouette rim, independent of light angles
  float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  totalEmissiveRadiance += fres * uRimStrength * vec3(0.7, 0.78, 0.9);
}`,
        );
    };

    this.front = new Mesh(asset.geometry, mat);

    // -- back shell: same discard, flat near-black ----------------------------
    const shellMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
varying vec3 vWorldPos2;
void main() {
  vWorldPos2 = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: [
        'varying vec3 vWorldPos2;',
        'uniform float uErode;',
        'uniform float uYMin;',
        'uniform float uHeight;',
        'uniform float uFieldMin;',
        'uniform float uFieldRange;',
        noiseChunk,
        dissolveChunk,
        /* glsl */ `
void main() {
  float f = remapField(fieldHead(vWorldPos2, uYMin, uHeight), uFieldMin, uFieldRange);
  if (f < uErode) discard;
  gl_FragColor = vec4(0.012, 0.013, 0.016, 1.0);
}`,
      ].join('\n'),
      uniforms: fieldUniforms,
      side: BackSide,
    });

    this.backShell = new Mesh(asset.geometry, shellMat);

    this.group.add(this.front, this.backShell);
  }

  updateVisibility(): void {
    const erode = U.uErode.value;
    this.front.visible = erode < 0.999;
    this.backShell.visible = erode > 0.001 && erode < 0.999;
  }
}
