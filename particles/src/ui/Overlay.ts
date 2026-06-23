/**
 * HTML labels + the progress line. Label tweens live INSIDE the master
 * timeline (windows are defined in progress space — separate triggers would
 * buy nothing). Exit animation expands letter-spacing: the text disperses
 * like the particles.
 */

import gsap from 'gsap';

interface LabelWindow {
  id: string;
  inAt: number;
  inDur: number;
  outAt: number | null;
  outDur: number;
}

const WINDOWS: LabelWindow[] = [
  { id: '#label-1', inAt: 0.02, inDur: 0.03, outAt: 0.07, outDur: 0.02 },
  { id: '#label-2', inAt: 0.13, inDur: 0.03, outAt: 0.21, outDur: 0.03 },
  { id: '#label-3', inAt: 0.34, inDur: 0.03, outAt: 0.46, outDur: 0.04 },
  { id: '#label-4', inAt: 0.92, inDur: 0.06, outAt: null, outDur: 0 },
];

const STAGE_TICKS = [0.1, 0.26, 0.56, 0.74, 0.88];

export class Overlay {
  private setFill: (v: number) => void;
  private ticks: HTMLElement[];

  constructor() {
    this.setFill = gsap.quickSetter('#progress-fill', 'scaleY') as (v: number) => void;
    this.ticks = Array.from(document.querySelectorAll<HTMLElement>('#progress .tick'));
  }

  addTo(tl: gsap.core.Timeline): void {
    for (const w of WINDOWS) {
      const root = document.querySelector<HTMLElement>(w.id);
      if (!root) continue;
      const parts = Array.from(root.querySelectorAll<HTMLElement>('p'));

      tl.fromTo(
        root,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: w.inDur, ease: 'sine.out' },
        w.inAt,
      );
      if (w.outAt !== null) {
        tl.to(root, { autoAlpha: 0, duration: w.outDur, ease: 'sine.in' }, w.outAt);
        tl.fromTo(
          parts,
          { letterSpacing: '0.32em' },
          { letterSpacing: '0.44em', duration: w.outDur, ease: 'sine.in' },
          w.outAt,
        );
      }
    }
  }

  setProgress(p: number): void {
    this.setFill(p);
    for (let i = 0; i < this.ticks.length; i++) {
      this.ticks[i].classList.toggle('passed', p >= STAGE_TICKS[i]);
    }
  }
}
