// Silver tail (below bloom threshold) -> HDR white-hot tip (bloom ignites it).
// AdditiveBlending(SrcAlpha, One): contribution = rgb * alpha.
// vAcross fades the ribbon edges so thick wires read as glowing filaments.

varying float vTip;
varying float vAlpha;
varying float vAcross;

void main() {
  vec3 cold = vec3(0.55, 0.60, 0.68);
  vec3 hot = vec3(1.3, 1.3, 1.4);
  vec3 col = mix(cold, hot, vTip * vTip);
  float across = 1.0 - vAcross * vAcross;
  gl_FragColor = vec4(col, vAlpha * across);
}
