import './style.css';
import { detectTier } from './core/Quality';
import { loadModels } from './assets/AssetLoader';
import { normalizeHead, normalizeGlasses } from './assets/normalize';
import { LoaderUI } from './ui/Loader';
import { Overlay } from './ui/Overlay';
import { App } from './App';
import { ScrollRig } from './scroll/ScrollRig';
import { S, U } from './state/uniforms';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function boot(): Promise<void> {
  const loader = new LoaderUI();
  const tier = detectTier();
  const canvas = document.getElementById('gl') as HTMLCanvasElement;

  // 0 - 0.8: download (byte-accurate)
  const { headRoot, glassesRoot } = await loadModels((f) => loader.set(f * 0.8));

  // 0.8 - 0.95: parse / normalize / sample / build
  loader.set(0.82, 'PREPARING');
  await nextFrame();
  const headAsset = normalizeHead(headRoot);
  const glassesAsset = normalizeGlasses(glassesRoot);
  loader.set(0.88);
  await nextFrame();
  const app = new App(canvas, tier, headAsset, glassesAsset);

  // 0.95 - 1: shader warmup + first primed frame
  loader.set(0.95, 'COMPILING');
  await nextFrame();
  await app.warmup();
  loader.set(1);

  window.scrollTo(0, 0);
  const overlay = new Overlay();
  const rig = new ScrollRig(overlay, (p) => overlay.setProgress(p));
  app.start();
  loader.done();

  // console/tooling hooks (read: poke uniforms while parked at a seam)
  Object.assign(window as object, { __U: U, __S: S });

  if (new URLSearchParams(location.search).has('debug')) {
    const { mountDebug } = await import('./debug/DebugPanel');
    await mountDebug(app, rig);
  }
}

boot().catch((err) => {
  console.error('boot failed:', err);
  const text = document.getElementById('loader-text');
  if (text) text.textContent = 'FAILED TO LOAD — CHECK CONSOLE';
});
