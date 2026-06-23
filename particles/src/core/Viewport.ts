/**
 * Coalesced resize tracking. The App consumes pending resizes at the top of
 * its ticker callback so sizing always happens in deterministic order before
 * a render. ScrollTrigger handles its own refresh (with ignoreMobileResize
 * filtering iOS URL-bar noise) — this is renderer/composer sizing only.
 */

export class Viewport {
  private dirty = true;

  constructor() {
    window.addEventListener('resize', this.invalidate);
    window.addEventListener('orientationchange', this.invalidate);
  }

  private invalidate = (): void => {
    this.dirty = true;
  };

  /** returns the new size once per change, else null */
  consume(): { width: number; height: number } | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return { width: window.innerWidth, height: window.innerHeight };
  }

  force(): void {
    this.dirty = true;
  }
}
