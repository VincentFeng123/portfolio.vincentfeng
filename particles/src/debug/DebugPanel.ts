/**
 * ?debug only (dynamically imported — never in the normal bundle):
 *  - master-scrub slider driving scroll position (the tool every seam gets
 *    tuned with: park at 0.10-0.26 / 0.72-0.88 and step in 0.005s)
 *  - sliders for every uniform + camera/post state
 *  - stats-gl GPU frame timing
 *  - scroll position persistence across dev reloads
 */

import { S, U } from '../state/uniforms';
import type { App } from '../App';
import type { ScrollRig } from '../scroll/ScrollRig';

export async function mountDebug(app: App, rig: ScrollRig): Promise<void> {
  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'stone-to-signal' });

  // master scrub
  const scrub = {
    progress: 0,
  };
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  gui
    .add(scrub, 'progress', 0, 1, 0.005)
    .name('master scrub')
    .onChange((v: number) => window.scrollTo(0, v * maxScroll()));

  const uniforms = gui.addFolder('uniforms (read-only under scrub)');
  for (const key of Object.keys(U) as (keyof typeof U)[]) {
    if (key === 'uTime') continue;
    uniforms.add(U[key], 'value', 0, key === 'uFogDensity' ? 0.1 : 1, 0.001).name(key).listen();
  }
  uniforms.close();

  const state = gui.addFolder('state');
  state.add(S, 'bloom', 0, 2, 0.01).listen();
  state.add(S, 'vignette', 0, 1.5, 0.01).listen();
  state.add(S, 'camY', -8, 2, 0.01).listen();
  state.add(S, 'camZ', 1, 8, 0.01).listen();
  state.add(S, 'camYaw', -1, 1, 0.01).listen();
  state.add(S, 'lookY', -8, 2, 0.01).listen();
  state.close();

  // GPU/CPU frame timing
  try {
    const { default: Stats } = await import('stats-gl');
    const stats = new Stats({ trackGPU: true, horizontal: true });
    document.body.appendChild(stats.dom);
    await stats.init(app.stage.renderer);
    app.onAfterRender = () => stats.update();
  } catch (err) {
    console.warn('stats-gl unavailable:', err);
  }

  // keep scroll position across dev reloads (shader edits trigger full reload)
  const KEY = 'sts-debug-scroll';
  const saved = sessionStorage.getItem(KEY);
  if (saved) {
    requestAnimationFrame(() => window.scrollTo(0, Number(saved)));
  }
  window.addEventListener('beforeunload', () => {
    sessionStorage.setItem(KEY, String(window.scrollY));
  });

  // expose for console poking
  Object.assign(window as object, { __app: app, __rig: rig, __U: U, __S: S });
}
