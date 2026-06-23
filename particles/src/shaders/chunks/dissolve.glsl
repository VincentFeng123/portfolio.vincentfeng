// The shared dissolve/reveal fields — ONE formula, three consumers (head
// fragment patch, glasses fragment patch, wire/tip birth gates) plus the JS
// bias precompute in src/scene/sampling.ts. Requires noise.glsl above it.

// Bottom of the head has the LOWEST field value, so it erodes first (chin-up
// unravel) — this pre-motivates the downward wire flow.
float fieldHead(vec3 p, float yMin, float height) {
  return 0.6 * snoise01(p * 1.8) + 0.4 * (p.y - yMin) / height;
}

// Glasses materialize from the bridge outward to the temple tips, matching
// the order in which wires arrive.
float fieldGlasses(vec3 p, vec3 center, float maxDist) {
  return 0.5 * snoise01(p * 3.0) + 0.5 * length(p - center) / maxDist;
}

// Remap raw field values into [0.02, 0.92] so the last-born particles fully
// appear and edge glow fully retires inside the 0..1 uniform range.
float remapField(float f, float fMin, float fRange) {
  return 0.02 + (f - fMin) / fRange * 0.90;
}
