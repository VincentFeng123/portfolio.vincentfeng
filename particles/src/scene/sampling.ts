/**
 * Deterministic surface sampling + head->glasses pairing + DataTexture
 * construction. Runs once at load on the CPU.
 *
 * Pairing is azimuth-rank: sort head points and glasses points by angle
 * around Y, pair rank<->rank (left cheek -> left lens, back of head ->
 * temple arms), then re-sort consecutive windows by height so the crown
 * maps to the top frame edge. Wires never cross chaotically.
 */

import {
  BufferGeometry,
  BufferAttribute,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Vector3,
} from 'three';
import { fieldGlasses, fieldHead } from './simplex';
import { WORLD } from '../state/uniforms';
import type { HeadAsset, GlassesAsset } from '../assets/normalize';

export const TEX_WIDTH = 4096;

export interface FieldRemap {
  min: number;
  range: number;
}

export interface WireData {
  count: number;
  texA: DataTexture; // rgb = head pos, a = seed
  texB: DataTexture; // rgb = glasses target pos (world), a = matId + revealBias
  texC: DataTexture; // rgb = head normal, a = dissolveBias
  headRemap: FieldRemap;
  glassesRemap: FieldRemap;
  glassesCenter: Vector3;
  glassesMaxDist: number;
  dust: {
    positions: Float32Array;
    normals: Float32Array;
    seeds: Float32Array;
    biases: Float32Array;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sample {
  px: number; py: number; pz: number;
  nx: number; ny: number; nz: number;
}

/** Area-weighted triangle sampling with a seeded RNG (MeshSurfaceSampler is
 *  not deterministic, and determinism is what keeps biases reproducible). */
class DeterministicSampler {
  private cum: Float64Array;
  private total: number;
  private pos: BufferAttribute;
  private nor: BufferAttribute | undefined;
  private index: ArrayLike<number>;

  constructor(geometry: BufferGeometry, private rng: () => number) {
    this.pos = geometry.attributes.position as BufferAttribute;
    this.nor = geometry.attributes.normal as BufferAttribute | undefined;
    if (!geometry.index) throw new Error('sampler expects indexed geometry');
    this.index = geometry.index.array;

    const triCount = this.index.length / 3;
    this.cum = new Float64Array(triCount);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const ab = new Vector3();
    const ac = new Vector3();
    let total = 0;
    for (let t = 0; t < triCount; t++) {
      a.fromBufferAttribute(this.pos, this.index[t * 3]);
      b.fromBufferAttribute(this.pos, this.index[t * 3 + 1]);
      c.fromBufferAttribute(this.pos, this.index[t * 3 + 2]);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      total += ab.cross(ac).length() * 0.5;
      this.cum[t] = total;
    }
    this.total = total;
  }

  sample(out: Sample): void {
    const r = this.rng() * this.total;
    // binary search the cumulative-area table
    let lo = 0;
    let hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const i0 = this.index[lo * 3];
    const i1 = this.index[lo * 3 + 1];
    const i2 = this.index[lo * 3 + 2];

    // uniform barycentric point
    const sq = Math.sqrt(this.rng());
    const u = 1 - sq;
    const v = this.rng() * sq;
    const w = 1 - u - v;

    const p = this.pos;
    out.px = p.getX(i0) * u + p.getX(i1) * v + p.getX(i2) * w;
    out.py = p.getY(i0) * u + p.getY(i1) * v + p.getY(i2) * w;
    out.pz = p.getZ(i0) * u + p.getZ(i1) * v + p.getZ(i2) * w;

    if (this.nor) {
      const n = this.nor;
      let nx = n.getX(i0) * u + n.getX(i1) * v + n.getX(i2) * w;
      let ny = n.getY(i0) * u + n.getY(i1) * v + n.getY(i2) * w;
      let nz = n.getZ(i0) * u + n.getZ(i1) * v + n.getZ(i2) * w;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      out.nx = nx / len;
      out.ny = ny / len;
      out.nz = nz / len;
    } else {
      out.nx = 0;
      out.ny = 1;
      out.nz = 0;
    }
  }
}

interface HeadPoint extends Sample {
  theta: number;
  seed: number;
}

interface GlassesPoint extends Sample {
  theta: number;
  matId: number; // 0 frame, 1 lens, 2 trim
}

function remapBias(raw: number, remap: FieldRemap): number {
  return 0.02 + ((raw - remap.min) / remap.range) * 0.9;
}

export function buildWireData(
  head: HeadAsset,
  glasses: GlassesAsset,
  wireCount: number,
  dustCount: number,
): WireData {
  const rng = mulberry32(0xc0ffee);
  const tmp: Sample = { px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 };

  // ---- head samples -------------------------------------------------------
  const headSampler = new DeterministicSampler(head.geometry, rng);
  const headPts: HeadPoint[] = new Array(wireCount);
  for (let i = 0; i < wireCount; i++) {
    headSampler.sample(tmp);
    headPts[i] = { ...tmp, theta: Math.atan2(tmp.px, tmp.pz), seed: rng() };
  }

  // ---- glasses samples (per-material quotas) ------------------------------
  const lensN = Math.round(wireCount * 0.12);
  const trimN = Math.round(wireCount * 0.08);
  const frameN = wireCount - lensN - trimN;

  // pivot BEHIND the glasses: angles then order monotonically from the bridge
  // (theta 0) out through the lenses to the temple tips (theta max) — the
  // rank order is what matters, not the absolute values
  let zMin = Infinity;
  for (const g of [glasses.frame, glasses.trim, glasses.lens]) {
    zMin = Math.min(zMin, g.boundingBox!.min.z);
  }
  const zPivot = zMin - 0.25;

  // landing targets stay on the FRONT band of the glasses: strands that land
  // on the rear-reaching temple arms wrap around the model like a horizontal
  // ring. The solid reveal still materializes the temples on its own.
  let zMax = -Infinity;
  for (const g of [glasses.frame, glasses.trim, glasses.lens]) {
    zMax = Math.max(zMax, g.boundingBox!.max.z);
  }
  const zCut = zMax - 0.45;

  const glassesPts: GlassesPoint[] = [];
  const sampleInto = (geometry: BufferGeometry, count: number, matId: number) => {
    const sampler = new DeterministicSampler(geometry, rng);
    for (let i = 0; i < count; i++) {
      sampler.sample(tmp);
      for (let tries = 0; tries < 40 && tmp.pz < zCut; tries++) sampler.sample(tmp);
      glassesPts.push({ ...tmp, theta: Math.atan2(tmp.px, tmp.pz - zPivot), matId });
    }
  };
  sampleInto(glasses.frame, frameN, 0);
  sampleInto(glasses.lens, lensN, 1);
  sampleInto(glasses.trim, trimN, 2);

  // ---- azimuth rank pairing + Y-window refinement --------------------------
  headPts.sort((a, b) => a.theta - b.theta);
  glassesPts.sort((a, b) => a.theta - b.theta);
  const WINDOW = 80;
  for (let start = 0; start < wireCount; start += WINDOW) {
    const end = Math.min(start + WINDOW, wireCount);
    const hw = headPts.slice(start, end).sort((a, b) => b.py - a.py);
    const gw = glassesPts.slice(start, end).sort((a, b) => b.py - a.py);
    for (let k = 0; k < hw.length; k++) {
      headPts[start + k] = hw[k];
      glassesPts[start + k] = gw[k];
    }
  }

  // ---- biases (shared dissolve/reveal fields, then remap to [0.02, 0.92]) --
  const glassesCenter = new Vector3(0, WORLD.GLASSES_POS_Y, 0);

  const dHeadRaw = new Float32Array(wireCount);
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < wireCount; i++) {
    const f = fieldHead(headPts[i].px, headPts[i].py, headPts[i].pz, head.yMin, head.height);
    dHeadRaw[i] = f;
    if (f < dMin) dMin = f;
    if (f > dMax) dMax = f;
  }

  let maxDist = 0;
  for (const g of glassesPts) {
    const d = Math.sqrt(g.px * g.px + g.py * g.py + g.pz * g.pz);
    if (d > maxDist) maxDist = d;
  }

  const rRaw = new Float32Array(wireCount);
  let rMin = Infinity;
  let rMax = -Infinity;
  for (let i = 0; i < wireCount; i++) {
    const g = glassesPts[i];
    // world position of the target (group offset applied)
    const f = fieldGlasses(
      g.px, g.py + WORLD.GLASSES_POS_Y, g.pz,
      glassesCenter.x, glassesCenter.y, glassesCenter.z,
      maxDist,
    );
    rRaw[i] = f;
    if (f < rMin) rMin = f;
    if (f > rMax) rMax = f;
  }

  // ---- dust (own samples + biases, same field/remap as the wires) ----------
  const dustPositions = new Float32Array(dustCount * 3);
  const dustNormals = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount);
  const dustBiasRaw = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    headSampler.sample(tmp);
    dustPositions[i * 3] = tmp.px;
    dustPositions[i * 3 + 1] = tmp.py;
    dustPositions[i * 3 + 2] = tmp.pz;
    dustNormals[i * 3] = tmp.nx;
    dustNormals[i * 3 + 1] = tmp.ny;
    dustNormals[i * 3 + 2] = tmp.nz;
    dustSeeds[i] = rng();
    const f = fieldHead(tmp.px, tmp.py, tmp.pz, head.yMin, head.height);
    dustBiasRaw[i] = f;
    if (f < dMin) dMin = f;
    if (f > dMax) dMax = f;
  }

  const headRemap: FieldRemap = { min: dMin, range: Math.max(dMax - dMin, 1e-6) };
  const glassesRemap: FieldRemap = { min: rMin, range: Math.max(rMax - rMin, 1e-6) };

  const dustBiases = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) dustBiases[i] = remapBias(dustBiasRaw[i], headRemap);

  // ---- DataTextures ---------------------------------------------------------
  const texHeight = Math.ceil(wireCount / TEX_WIDTH);
  const texels = TEX_WIDTH * texHeight;
  const dataA = new Float32Array(texels * 4);
  const dataB = new Float32Array(texels * 4);
  const dataC = new Float32Array(texels * 4);

  for (let i = 0; i < wireCount; i++) {
    const hp = headPts[i];
    const gp = glassesPts[i];
    const o = i * 4;

    dataA[o] = hp.px;
    dataA[o + 1] = hp.py;
    dataA[o + 2] = hp.pz;
    dataA[o + 3] = hp.seed;

    dataB[o] = gp.px;
    dataB[o + 1] = gp.py + WORLD.GLASSES_POS_Y; // world-space target
    dataB[o + 2] = gp.pz;
    const rBias = Math.min(Math.max(remapBias(rRaw[i], glassesRemap), 0.02), 0.92);
    dataB[o + 3] = gp.matId + rBias;

    dataC[o] = hp.nx;
    dataC[o + 1] = hp.ny;
    dataC[o + 2] = hp.nz;
    dataC[o + 3] = Math.min(Math.max(remapBias(dHeadRaw[i], headRemap), 0.02), 0.92);
  }

  const makeTex = (data: Float32Array): DataTexture => {
    const tex = new DataTexture(data, TEX_WIDTH, texHeight, RGBAFormat, FloatType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    count: wireCount,
    texA: makeTex(dataA),
    texB: makeTex(dataB),
    texC: makeTex(dataC),
    headRemap,
    glassesRemap,
    glassesCenter,
    glassesMaxDist: maxDist,
    dust: { positions: dustPositions, normals: dustNormals, seeds: dustSeeds, biases: dustBiases },
  };
}
