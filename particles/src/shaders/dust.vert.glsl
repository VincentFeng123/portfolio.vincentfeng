// Dust: cheap secondary points so the 300k-vert head doesn't dissolve into a
// sparse constellation. Alive only from dissolve until the wire stage owns
// the frame. Per-point attributes (no DataTexture needed at this count).
// Displacement is parameterized by scroll progress since birth — NEVER
// time-integrated velocity (scrub must be reversible).

attribute vec3 aNormal;
attribute float aSeed;
attribute float aBias;

uniform float uDissolve;
uniform float uGrow;
uniform float uFogDensity;
uniform float uTime;
uniform float uScale;

varying float vAlpha;

void main() {
  float born = smoothstep(aBias - 0.06, aBias, uDissolve);

  // drift outward along the normal with a downward pull, driven by how far
  // the dissolve front has passed this point
  float travel = max(0.0, uDissolve - aBias);
  vec3 dir = normalize(aNormal + vec3(0.0, -0.8, 0.0));
  vec3 p = position + dir * travel * (0.5 + 0.7 * aSeed);

  // bounded shimmer
  p += vec3(
    sin(uTime * 0.9 + aSeed * 40.0),
    sin(uTime * 1.1 + aSeed * 71.0),
    sin(uTime * 0.7 + aSeed * 23.0)) * 0.008;

  // dead by the wire stage
  float fadeOut = 1.0 - smoothstep(0.1, 0.6, uGrow);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float fogFade = exp(-uFogDensity * dist * dist);

  vAlpha = born * fadeOut * fogFade * (1.0 - smoothstep(0.05, 0.4, travel));
  gl_PointSize = max(0.010 * uScale / dist * born * fadeOut, 0.0);
  gl_Position = projectionMatrix * mv;
}
