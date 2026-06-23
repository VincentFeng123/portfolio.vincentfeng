/**
 * Lenis smooth scrolling + one ScrollTrigger driving the master timeline
 * across the 650vh track. Lenis supplies the scroll smoothing (scrub is
 * direct, so the journey maps 1:1 onto the smoothed scroll). Created only
 * after assets are loaded and the first frame is primed, so a mid-page hard
 * refresh can never show a broken intermediate state.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { resetState } from '../state/uniforms';
import { buildTimeline, buildReducedTimeline } from './Timeline';
import type { Overlay } from '../ui/Overlay';

gsap.registerPlugin(ScrollTrigger);

export class ScrollRig {
  private mm: gsap.MatchMedia;
  /** current trigger — recreated when the reduced-motion preference flips */
  trigger: ScrollTrigger | null = null;
  lenis: Lenis | null = null;

  constructor(overlay: Overlay, onProgress: (p: number) => void) {
    ScrollTrigger.config({ ignoreMobileResize: true });

    const create = (reduced: boolean) => {
      resetState();

      let lenisTick: ((time: number) => void) | null = null;
      if (!reduced) {
        // Lenis owns the smoothing; its raf runs on gsap's ticker BEFORE the
        // render callback (App registers later), so scroll -> uniforms ->
        // render stay in one deterministic tick
        this.lenis = new Lenis({ duration: 1.15, smoothWheel: true });
        this.lenis.on('scroll', ScrollTrigger.update);
        lenisTick = (time: number) => this.lenis?.raf(time * 1000);
        gsap.ticker.add(lenisTick);
        gsap.ticker.lagSmoothing(0); // per Lenis docs — lag smoothing fights it
      }

      const tl = reduced ? buildReducedTimeline(overlay) : buildTimeline(overlay);
      tl.paused(false);

      // end-snap state: close the ending when the user parks past 93%
      let snapped = false;

      const trigger = ScrollTrigger.create({
        animation: tl,
        trigger: '#scroll-track',
        start: 'top top',
        end: 'bottom bottom',
        // Lenis already smooths the scroll itself; direct scrub keeps the
        // journey hand-cranked. Reduced motion keeps a gentle scrub instead.
        scrub: reduced ? 0.5 : true,
        invalidateOnRefresh: true,
        // native ScrollTrigger snap fights Lenis's animated scroll writes, so
        // the end-snap is implemented via lenis.scrollTo in onUpdate instead
        snap: reduced
          ? {
              snapTo: (value, self) => {
                const p = self ? self.progress : value;
                return p > 0.93 ? 1 : p;
              },
              duration: { min: 0.2, max: 0.6 },
              delay: 0.1,
              ease: 'power1.inOut',
            }
          : undefined,
        onUpdate: (self) => {
          onProgress(self.progress);
          if (!this.lenis) return;
          if (self.progress < 0.9) snapped = false;
          if (!snapped && self.progress > 0.93 && self.progress < 0.999 && Math.abs(self.getVelocity()) < 40) {
            snapped = true;
            this.lenis.scrollTo(this.lenis.limit, { duration: 0.9 });
          }
        },
      });
      this.trigger = trigger;

      return () => {
        trigger.kill();
        tl.kill();
        this.trigger = null;
        if (lenisTick) gsap.ticker.remove(lenisTick);
        this.lenis?.destroy();
        this.lenis = null;
      };
    };

    this.mm = gsap.matchMedia();
    this.mm.add('(prefers-reduced-motion: no-preference)', () => create(false));
    this.mm.add('(prefers-reduced-motion: reduce)', () => create(true));

    ScrollTrigger.refresh();
  }
}
