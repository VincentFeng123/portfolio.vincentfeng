/**
 * Scalar TypeScript port of the Ashima/Gustavson simplex 3D noise in
 * src/shaders/chunks/noise.glsl — MUST stay algorithm-identical. The dissolve
 * biases precomputed here are compared against the same field evaluated in
 * the fragment shaders; the 0.06-wide seam bands absorb f32/f64 drift.
 */

function mod289(x: number): number {
  return x - Math.floor(x * (1 / 289)) * 289;
}

function permute(x: number): number {
  return mod289((x * 34 + 10) * x);
}

function taylorInvSqrt(r: number): number {
  return 1.79284291400159 - 0.85373472095314 * r;
}

function step(edge: number, x: number): number {
  return x < edge ? 0 : 1;
}

const Cx = 1 / 6;
const Cy = 1 / 3;
const NSx = 2 / 7;
const NSy = 0.5 / 7 - 1;
const NSz = 1 / 7;

export function snoise(vx: number, vy: number, vz: number): number {
  const s = (vx + vy + vz) * Cy;
  let ix = Math.floor(vx + s);
  let iy = Math.floor(vy + s);
  let iz = Math.floor(vz + s);
  const t = (ix + iy + iz) * Cx;
  const x0x = vx - ix + t;
  const x0y = vy - iy + t;
  const x0z = vz - iz + t;

  const gx = step(x0y, x0x);
  const gy = step(x0z, x0y);
  const gz = step(x0x, x0z);
  const lx = 1 - gx;
  const ly = 1 - gy;
  const lz = 1 - gz;
  const i1x = Math.min(gx, lz);
  const i1y = Math.min(gy, lx);
  const i1z = Math.min(gz, ly);
  const i2x = Math.max(gx, lz);
  const i2y = Math.max(gy, lx);
  const i2z = Math.max(gz, ly);

  const x1x = x0x - i1x + Cx;
  const x1y = x0y - i1y + Cx;
  const x1z = x0z - i1z + Cx;
  const x2x = x0x - i2x + Cy;
  const x2y = x0y - i2y + Cy;
  const x2z = x0z - i2z + Cy;
  const x3x = x0x - 0.5;
  const x3y = x0y - 0.5;
  const x3z = x0z - 0.5;

  ix = mod289(ix);
  iy = mod289(iy);
  iz = mod289(iz);

  const p0_ = permute(permute(permute(iz + 0) + iy + 0) + ix + 0);
  const p1_ = permute(permute(permute(iz + i1z) + iy + i1y) + ix + i1x);
  const p2_ = permute(permute(permute(iz + i2z) + iy + i2y) + ix + i2x);
  const p3_ = permute(permute(permute(iz + 1) + iy + 1) + ix + 1);
  const p = [p0_, p1_, p2_, p3_];

  const x = new Array<number>(4);
  const y = new Array<number>(4);
  const h = new Array<number>(4);
  for (let k = 0; k < 4; k++) {
    const j = p[k] - 49 * Math.floor(p[k] * NSz * NSz);
    const x_ = Math.floor(j * NSz);
    const y_ = Math.floor(j - 7 * x_);
    x[k] = x_ * NSx + NSy;
    y[k] = y_ * NSx + NSy;
    h[k] = 1 - Math.abs(x[k]) - Math.abs(y[k]);
  }

  // b0 = (x0, x1, y0, y1), b1 = (x2, x3, y2, y3)
  const b0 = [x[0], x[1], y[0], y[1]];
  const b1 = [x[2], x[3], y[2], y[3]];
  const s0 = b0.map((v) => Math.floor(v) * 2 + 1);
  const s1 = b1.map((v) => Math.floor(v) * 2 + 1);
  const sh = h.map((v) => -step(v, 0));

  // a0 = b0.xzyw + s0.xzyw * sh.xxyy ; a1 = b1.xzyw + s1.xzyw * sh.zzww
  const a0 = [
    b0[0] + s0[0] * sh[0],
    b0[2] + s0[2] * sh[0],
    b0[1] + s0[1] * sh[1],
    b0[3] + s0[3] * sh[1],
  ];
  const a1 = [
    b1[0] + s1[0] * sh[2],
    b1[2] + s1[2] * sh[2],
    b1[1] + s1[1] * sh[3],
    b1[3] + s1[3] * sh[3],
  ];

  let g0x = a0[0], g0y = a0[1], g0z = h[0];
  let g1x = a0[2], g1y = a0[3], g1z = h[1];
  let g2x = a1[0], g2y = a1[1], g2z = h[2];
  let g3x = a1[2], g3y = a1[3], g3z = h[3];

  const n0 = taylorInvSqrt(g0x * g0x + g0y * g0y + g0z * g0z);
  const n1 = taylorInvSqrt(g1x * g1x + g1y * g1y + g1z * g1z);
  const n2 = taylorInvSqrt(g2x * g2x + g2y * g2y + g2z * g2z);
  const n3 = taylorInvSqrt(g3x * g3x + g3y * g3y + g3z * g3z);
  g0x *= n0; g0y *= n0; g0z *= n0;
  g1x *= n1; g1y *= n1; g1z *= n1;
  g2x *= n2; g2y *= n2; g2z *= n2;
  g3x *= n3; g3y *= n3; g3z *= n3;

  let m0 = Math.max(0.5 - (x0x * x0x + x0y * x0y + x0z * x0z), 0);
  let m1 = Math.max(0.5 - (x1x * x1x + x1y * x1y + x1z * x1z), 0);
  let m2 = Math.max(0.5 - (x2x * x2x + x2y * x2y + x2z * x2z), 0);
  let m3 = Math.max(0.5 - (x3x * x3x + x3y * x3y + x3z * x3z), 0);
  m0 *= m0; m1 *= m1; m2 *= m2; m3 *= m3;

  return (
    105 *
    (m0 * m0 * (g0x * x0x + g0y * x0y + g0z * x0z) +
      m1 * m1 * (g1x * x1x + g1y * x1y + g1z * x1z) +
      m2 * m2 * (g2x * x2x + g2y * x2y + g2z * x2z) +
      m3 * m3 * (g3x * x3x + g3y * x3y + g3z * x3z))
  );
}

export function snoise01(x: number, y: number, z: number): number {
  return 0.5 + 0.5 * snoise(x, y, z);
}

/** Mirror of fieldHead in dissolve.glsl */
export function fieldHead(px: number, py: number, pz: number, yMin: number, height: number): number {
  return 0.6 * snoise01(px * 1.8, py * 1.8, pz * 1.8) + 0.4 * ((py - yMin) / height);
}

/** Mirror of fieldGlasses in dissolve.glsl */
export function fieldGlasses(
  px: number, py: number, pz: number,
  cx: number, cy: number, cz: number,
  maxDist: number,
): number {
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return 0.5 * snoise01(px * 3.0, py * 3.0, pz * 3.0) + 0.5 * (Math.sqrt(dx * dx + dy * dy + dz * dz) / maxDist);
}
