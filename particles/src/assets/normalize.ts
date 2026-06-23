/**
 * GLB normalization: bake node/world transforms into geometry (the Sketchfab
 * axis-swaps, the meshopt quantization node scales), de-quantize attributes
 * to Float32, recenter, and rescale into the world-space contract:
 *   head 2.0 units tall at the origin, facing +Z
 *   glasses 1.8 units wide at local origin (group adds (0,-6,0)), facing +Z,
 *   presentation pose BAKED before sampling so sampled targets and the
 *   rendered mesh always agree.
 */

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../state/uniforms';

export interface HeadAsset {
  geometry: BufferGeometry;
  yMin: number;
  height: number;
}

export interface GlassesAsset {
  frame: BufferGeometry;
  trim: BufferGeometry;
  lens: BufferGeometry;
}

type AnyAttr = BufferAttribute | InterleavedBufferAttribute;

/** De-quantize (KHR_mesh_quantization) / de-interleave into plain Float32.
 *  Quantized normalized-int attributes CLAMP if transformed in place — they
 *  must become float before any matrix bake. */
function toFloat32(attr: AnyAttr): BufferAttribute {
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) {
      out[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
  }
  return new BufferAttribute(out, attr.itemSize);
}

/** Position + normal only (nothing here is textured), world matrix baked in. */
function bakeMesh(mesh: Mesh): BufferGeometry {
  const src = mesh.geometry;
  const g = new BufferGeometry();
  g.setAttribute('position', toFloat32(src.attributes.position));
  if (src.attributes.normal) g.setAttribute('normal', toFloat32(src.attributes.normal));
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

function collectMeshes(root: Object3D): Mesh[] {
  root.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  return meshes;
}

export function normalizeHead(root: Object3D): HeadAsset {
  const meshes = collectMeshes(root);
  // main mesh is the 300k-vert one; solid_volume_fill (2.5k) is dropped
  let main = meshes[0];
  for (const m of meshes) {
    if (m.geometry.attributes.position.count > main.geometry.attributes.position.count) main = m;
  }
  const geometry = bakeMesh(main);

  const box = new Box3().setFromBufferAttribute(geometry.attributes.position as BufferAttribute);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const scale = WORLD.HEAD_HEIGHT / size.y;

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const bb = geometry.boundingBox!;
  return { geometry, yMin: bb.min.y, height: bb.max.y - bb.min.y };
}

export function normalizeGlasses(root: Object3D): GlassesAsset {
  const meshes = collectMeshes(root);

  const frameGeos: BufferGeometry[] = [];
  const trimGeos: BufferGeometry[] = [];
  const lensGeos: BufferGeometry[] = [];

  for (const mesh of meshes) {
    const mat = mesh.material as MeshStandardMaterial;
    const baked = bakeMesh(mesh);
    if (mat.transparent || (mat.userData?.alphaMode === 'BLEND')) lensGeos.push(baked);
    else if (mat.color && mat.color.r > 0.5) trimGeos.push(baked);
    else frameGeos.push(baked);
  }

  const merge = (geos: BufferGeometry[]): BufferGeometry =>
    geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;

  const frame = merge(frameGeos);
  const trim = merge(trimGeos);
  const lens = merge(lensGeos);
  const all = [frame, trim, lens];

  // shared recenter + rescale so the three parts stay registered
  const box = new Box3();
  for (const g of all) {
    box.union(new Box3().setFromBufferAttribute(g.attributes.position as BufferAttribute));
  }
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const scale = WORLD.GLASSES_WIDTH / size.x;

  // presentation pose baked BEFORE sampling (pitch first, then yaw)
  const pose = new Matrix4()
    .makeRotationY(WORLD.BAKED_YAW)
    .multiply(new Matrix4().makeRotationX(WORLD.BAKED_PITCH));

  for (const g of all) {
    g.translate(-center.x, -center.y, -center.z);
    g.scale(scale, scale, scale);
    g.applyMatrix4(pose);
    g.computeBoundingBox();
  }

  // re-center AFTER the pose bake: the yaw rotates the bbox-centered shape
  // about an origin that sits behind the front frame (temple arms skew the
  // bbox), shifting the lenses ~0.13 units sideways — without this the
  // glasses land visibly off-center
  const posedBox = new Box3();
  for (const g of all) posedBox.union(g.boundingBox!);
  const posedCenter = posedBox.getCenter(new Vector3());
  for (const g of all) {
    g.translate(-posedCenter.x, -posedCenter.y, -posedCenter.z);
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }

  return { frame, trim, lens };
}
