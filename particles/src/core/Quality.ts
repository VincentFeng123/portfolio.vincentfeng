/** Device tier detection + a demote-only DPR ladder. Detection is heuristic
 *  by design — the demotion ladder catches anything the heuristic misses. */

export interface Tier {
  name: 'HIGH' | 'MID' | 'LOW';
  wireCount: number;
  wireSegments: number;
  dustCount: number;
  dprCap: number;
  msaa: number;
  /** divisor of render size for the bloom pass resolution */
  bloomDivisor: number;
}

// few, thick, sweeping ribbons — segment counts are high because the grand
// S-sweep adds real curvature and thick ribbons show polygonal kinks
const HIGH: Tier = { name: 'HIGH', wireCount: 512, wireSegments: 96, dustCount: 32768, dprCap: 2.0, msaa: 4, bloomDivisor: 2 };
const MID: Tier = { name: 'MID', wireCount: 384, wireSegments: 64, dustCount: 32768, dprCap: 1.5, msaa: 4, bloomDivisor: 2 };
const LOW: Tier = { name: 'LOW', wireCount: 192, wireSegments: 40, dustCount: 32768, dprCap: 1.25, msaa: 0, bloomDivisor: 4 };

export function detectTier(): Tier {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  if (coarse && shortSide < 820) return LOW;

  let gpu = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* detection is best-effort */
  }

  if (/Apple M|RTX|RX 6\d|RX 7\d|RX 9\d|Arc/i.test(gpu)) return HIGH;
  return MID;
}

/** Rolling frame-time monitor; demotes DPR in 0.25 steps (floor 1.0), never promotes. */
export class FrameGovernor {
  private samples = 0;
  private accum = 0;
  private slowWindows = 0;
  private last = performance.now();

  constructor(
    private dpr: number,
    private readonly onDemote: (dpr: number) => void,
  ) {}

  tick(): void {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    if (dt > 250) return; // tab was hidden / debugger pause — not a real frame
    this.accum += dt;
    this.samples++;
    if (this.samples < 120) return;
    const mean = this.accum / this.samples;
    this.samples = 0;
    this.accum = 0;
    if (mean > 17) {
      this.slowWindows++;
      if (this.slowWindows >= 2 && this.dpr > 1.0) {
        this.dpr = Math.max(1.0, this.dpr - 0.25);
        this.slowWindows = 0;
        this.onDemote(this.dpr);
      }
    } else {
      this.slowWindows = 0;
    }
  }
}
