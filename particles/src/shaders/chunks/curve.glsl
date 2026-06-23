// The per-wire path evaluation, shared verbatim by wires.vert and tips.vert so
// a tip and its wire can never disagree about where the energy is.
// Requires noise.glsl and these uniforms in the parent shader:
//   uScatter, uTwist, uFuse, uHarden, uTime

vec3 wirePoint(vec3 H, vec3 N, vec3 G, float seed, float uu, out float pinch) {
  // scatter-displaced head anchor: particles lift off along the surface normal
  vec3 H2 = H + N * (uScatter * (0.06 + 0.10 * seed));

  // cubic Bezier: exit perpendicular to the head surface, sag downward,
  // dive onto the glasses from above
  float D = distance(H2, G);
  vec3 P1 = H2 + N * 0.35 + vec3(0.0, -0.35 * D, 0.0);
  // hang slightly IN FRONT of the glasses plane before the drop — strands
  // must never pass behind the frame or they read as a ring around it
  vec3 P2 = G + vec3(0.0, 0.30 * D, 0.35);
  float s = 1.0 - uu;
  vec3 p = s * s * s * H2 + 3.0 * s * s * uu * P1 + 3.0 * s * uu * uu * P2 + uu * uu * uu * G;

  // lateral slalom: a moderate bow RIGHT, then a stronger sweep LEFT, in a
  // flat plane (planar = ribbon slalom; depth is what turns it into loops).
  // The growing weight makes the left arm the dominant move; the envelope
  // retires the whole sweep before the dive so the arrival stays straight.
  float sweepEnv = smoothstep(0.03, 0.18, uu) * (1.0 - smoothstep(0.66, 0.86, uu));
  float sweepShape = sin(uu * 6.2831853) * mix(0.65, 1.45, uu) * sweepEnv;
  // tight bundle: near-identical amplitudes keep the strands together
  float ampAvg = 1.5;
  float amp = 1.5 * (0.96 + 0.08 * seed);
  p.x += sweepShape * amp;
  // slim depth fan so the stream has volume, anchored at both ends
  p.z += sin(uu * 3.14159265) * (seed - 0.5) * 0.3;

  // BUNDLE-LOCAL BRAID: rotate each strand's offset from the shared stream
  // centerline, progressively along the length and slowly over time — the
  // cross-section spins as one, strands trade places, the stream reads as a
  // living rope. Envelope zeroes it at both anchors.
  float cx = sweepShape * ampAvg; // shared centerline (z ~ 0 on average)
  vec2 dev = vec2(p.x - cx, p.z);
  float bEnv = uu * (1.0 - uu) * 4.0;
  // gentle: at most ~a half-turn along the whole length — more reads as
  // spinning in circles
  float bAng = uTwist * bEnv * (uu * 2.5 + uTime * 0.18);
  float cb = cos(bAng);
  float sb = sin(bAng);
  dev = mat2(cb, -sb, sb, cb) * dev;
  p.x = cx + dev.x;
  p.z = dev.y;

  // cohesion: strands hug the stream centerline mid-flight — endpoint spread
  // (head ±0.5, glasses ±0.9) would otherwise loosen the bundle. Releases
  // early enough that the spread to targets is gradual, never a dart.
  float coh = 0.55 * smoothstep(0.05, 0.3, uu) * (1.0 - smoothstep(0.55, 0.8, uu));
  p.x = mix(p.x, cx, coh);
  p.z = mix(p.z, 0.0, coh);

  // early fan: a MILD spread toward each strand's own target through the
  // neck before the dive. Kept small — overshooting the target and swinging
  // back is what made the paths orbit the lenses in circles.
  float fanB = sin(3.14159265 * clamp((uu - 0.68) / 0.32, 0.0, 1.0));
  p.x += G.x * 0.25 * fanB * fanB;
  p.z += G.z * 0.15 * fanB * fanB;

  // one slow travelling bow — the gentlest possible undulation;
  // enveloped to zero at both ends and calmed by convergence/harden
  float waveEnv = uu * (1.0 - uu) * 4.0 * (1.0 - 0.6 * uFuse) * (1.0 - uHarden);
  p.x += sin(uu * 3.14159265 - uTime * 0.3) * 0.14 * waveEnv;
  p.z += sin(uu * 2.4 - uTime * 0.22 + seed * 1.2) * 0.08 * waveEnv;

  // convergence: one smooth C1 bump condensing the bundle toward its own
  // centerline (not the world axis — that would yank the stream sideways),
  // fully released by uu=0.85 so the final approach is a straight dive
  float pe = sin(3.14159265 * clamp((uu - 0.2) / 0.65, 0.0, 1.0));
  pinch = uFuse * pe * pe;
  p.x = mix(p.x, cx + (p.x - cx) * 0.30, pinch);
  p.z = mix(p.z, p.z * 0.30, pinch);

  // whisper of low-frequency jitter — extreme smoothness wants almost none
  float env = mix(uScatter, 1.0, smoothstep(0.0, 0.15, uu)) * (1.0 - smoothstep(0.85, 1.0, uu));
  p += snoise3(p * 0.9 + vec3(seed * 17.0 + uTime * 0.12)) * 0.008 * env * (1.0 - uHarden);

  return p;
}
