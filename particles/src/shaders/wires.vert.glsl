// Ribbon wire vertex shader: each instance is ONE curve segment expanded to a
// screen-space quad (Line2-style), so wires have real pixel thickness.
// Base quad: position.x = endpoint select (0/1), position.y = side (-1/+1).
// Per-instance: aWire = wire index, aSeg = segment index.

attribute float aWire;
attribute float aSeg;

uniform sampler2D uTexA; // rgb = head surface pos, a = seed
uniform sampler2D uTexB; // rgb = glasses target pos, a = matId + revealBias
uniform sampler2D uTexC; // rgb = head surface normal, a = dissolveBias

uniform float uDissolve;
uniform float uScatter;
uniform float uGrow;
uniform float uRelease;
uniform float uTwist;
uniform float uFuse;
uniform float uHarden;
uniform float uWireAlpha;
uniform float uFogDensity;
uniform float uTime;
uniform float uCountScale; // keeps total additive energy constant across tiers
uniform vec2 uResolution;  // drawing buffer size in device px
uniform float uLineWidth;  // ribbon width in device px
uniform float uSegments;

varying float vTip;
varying float vAlpha;
varying float vAcross;

ivec2 texelCoord(int i) { return ivec2(i & 4095, i >> 12); }

void main() {
  int wi = int(aWire + 0.5);

  vec4 A = texelFetch(uTexA, texelCoord(wi), 0);
  vec4 B = texelFetch(uTexB, texelCoord(wi), 0);
  vec4 C = texelFetch(uTexC, texelCoord(wi), 0);
  vec3 H = A.xyz;
  float seed = A.w;
  vec3 G = B.xyz;
  float matId = floor(B.w);
  vec3 N = C.xyz;
  float dBias = C.w;

  // seam A gate: the particle exists BEFORE the solid pixel beneath it dies
  float born = smoothstep(dBias - 0.06, dBias, uDissolve);

  // stagger only ever speeds wires up, so every wire reaches h=1 at uGrow=1
  // (narrow band: the tips travel as one coherent front)
  float st = mix(1.0, 1.15, seed);
  float h = clamp(uGrow * st, 0.0, 1.0);
  float t = clamp(uRelease * st, 0.0, h);

  // both segment endpoints — needed for the screen-space direction
  float u0 = aSeg / uSegments;
  float u1 = (aSeg + 1.0) / uSegments;
  float uu0 = mix(t, h, u0);
  float uu1 = mix(t, h, u1);
  float pinch0;
  float pinch1;
  vec3 p0 = wirePoint(H, N, G, seed, uu0, pinch0);
  vec3 p1 = wirePoint(H, N, G, seed, uu1, pinch1);
  vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
  vec4 c1 = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);

  float endSel = step(0.5, position.x);
  vec4 cl = mix(c0, c1, endSel);
  float uu = mix(uu0, uu1, endSel);
  float pinch = mix(pinch0, pinch1, endSel);

  // screen-space perpendicular expansion
  vec2 ndc0 = c0.xy / max(c0.w, 1e-4);
  vec2 ndc1 = c1.xy / max(c1.w, 1e-4);
  vec2 dir = (ndc1 - ndc0) * uResolution;
  float dl = length(dir);
  dir = dl > 1e-5 ? dir / dl : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  // the hot leading zone narrows as wires converge — 1k simultaneous
  // full-length hot tips stacking on the glasses would whiteout the climax
  vTip = 1.0 - smoothstep(0.0, mix(0.2, 0.06, uFuse), h - uu);
  // taper: slim silver tail, fuller white-hot head
  float width = uLineWidth * mix(0.55, 1.25, vTip);
  cl.xy += nrm * position.y * (width / uResolution) * cl.w;

  // lens-targeted wires fade during harden — glass must not look assembled
  // from opaque particles
  float lensFade = (matId > 0.5 && matId < 1.5) ? (1.0 - smoothstep(0.2, 0.6, uHarden)) : 1.0;

  // energy conservation in the funnel waist
  float conserve = mix(1.0, 0.22, pinch);

  float dist = max(cl.w, 0.1); // == -mvPosition.z for a perspective camera
  float fogFade = exp(-uFogDensity * dist * dist);
  // fade strands that fly very close to the camera — a single ribbon crossing
  // the lens would otherwise fill the frame with additive white
  float nearFade = smoothstep(0.5, 1.6, dist);

  // fade wires in as they extend, dim while the bundle is compact, trade
  // brightness for density at convergence, vanish as the packet collapses
  float lengthFade = smoothstep(0.02, 0.25, h);
  float bundleSpread = mix(0.3, 1.0, smoothstep(0.05, 0.5, uGrow));
  float fuseDim = mix(1.0, 0.5, uFuse);
  float packet = smoothstep(0.0, 0.04, h - t);

  vAlpha = born * lensFade * conserve * fogFade * nearFade * uWireAlpha * uCountScale
    * lengthFade * bundleSpread * fuseDim * packet * mix(0.025, 0.28, vTip);
  vAcross = position.y;

  gl_Position = cl;
}
