varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float disc = exp(-r * r * 5.0);
  gl_FragColor = vec4(vec3(1.1, 1.15, 1.3), disc * vAlpha * 0.2);
}
