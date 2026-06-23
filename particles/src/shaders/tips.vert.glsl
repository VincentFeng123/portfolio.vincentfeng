// Tip sprites: one glowing point per wire riding the leading edge (uu = h).
// position attribute: x = wire index.

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uTexC;

uniform float uDissolve;
uniform float uScatter;
uniform float uGrow;
uniform float uRelease;
uniform float uTwist;
uniform float uFuse;
uniform float uHarden;
uniform float uReveal;
uniform float uFogDensity;
uniform float uTime;
uniform float uScale;   // drawingBufferHeight / (2 * tan(fov/2))
uniform float uTipSize; // world-ish size
uniform float uCountScale;

varying float vAlpha;
varying float vHot;

//__CHUNKS__ (noise.glsl + curve.glsl injected here by WireSystem.ts)

ivec2 texelCoord(int i) { return ivec2(i & 4095, i >> 12); }

void main() {
  int wi = int(position.x + 0.5);

  vec4 A = texelFetch(uTexA, texelCoord(wi), 0);
  vec4 B = texelFetch(uTexB, texelCoord(wi), 0);
  vec4 C = texelFetch(uTexC, texelCoord(wi), 0);
  vec3 H = A.xyz;
  float seed = A.w;
  vec3 G = B.xyz;
  float matId = floor(B.w);
  float rBias = fract(B.w);
  vec3 N = C.xyz;
  float dBias = C.w;

  // born exactly when (just before) the head surface erodes here
  float born = smoothstep(dBias - 0.06, dBias, uDissolve);
  // brief flash at birth — the spark off the eroding edge
  float dd = (uDissolve - dBias) / 0.05;
  float flash = 1.0 + 1.2 * exp(-dd * dd);
  // shrinks to nothing exactly as the glasses surface materializes underneath
  float absorb = 1.0 - smoothstep(rBias, rBias + 0.05, uReveal);

  float st = mix(1.0, 1.15, seed); // must match wires.vert
  float h = clamp(uGrow * st, 0.0, 1.0);

  float pinch;
  vec3 p = wirePoint(H, N, G, seed, h, pinch);

  float lensFade = (matId > 0.5 && matId < 1.5) ? (1.0 - smoothstep(0.2, 0.6, uHarden)) : 1.0;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float fogFade = exp(-uFogDensity * dist * dist) * smoothstep(0.5, 1.4, dist);

  // flash boosts brightness fully but size only mildly
  float size = uTipSize * born * (0.7 + 0.3 * flash) * absorb * lensFade * mix(1.0, 0.3, uHarden) * mix(1.0, 0.55, pinch);
  gl_PointSize = max(size * uScale / dist, 0.0);

  // ember: bright on the dissolve front, dim in its wake — thousands of
  // full-brightness additive sprites would sum to a white mass otherwise
  float ember = mix(1.0, 0.3, smoothstep(dBias + 0.08, dBias + 0.3, uDissolve));
  // once the wires own the frame, tips recede to wavefront markers
  ember *= mix(1.0, 0.55, smoothstep(0.05, 0.4, uGrow));

  vHot = flash - 1.0;
  vAlpha = born * absorb * lensFade * fogFade * ember * uCountScale * 0.30 * mix(1.0, 0.35, pinch);

  gl_Position = projectionMatrix * mv;
  // nudge toward the camera so tips never z-fight the surface they sit on
  gl_Position.z -= 0.001 * gl_Position.w;
}
