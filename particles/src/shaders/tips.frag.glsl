// Soft radial disc, HDR-bright so bloom picks it up; brighter while flashing.

varying float vAlpha;
varying float vHot;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float disc = exp(-r * r * 6.0);
  vec3 col = vec3(1.0, 1.05, 1.15) * (1.0 + vHot);
  gl_FragColor = vec4(col, disc * vAlpha);
}
