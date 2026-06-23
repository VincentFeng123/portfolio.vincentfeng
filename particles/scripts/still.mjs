// Stage-look tuning tool: park the system at hand-picked uniform states
// (bypassing scroll entirely) and screenshot each. Usage:
//   node scripts/still.mjs [scenario ...]   (default: all)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const SCENARIOS = {
  hero: {
    U: {},
    S: {},
  },
  dissolveEarly: {
    U: { uDissolve: 0.3, uErode: 0.285, uScatter: 0.35, uWireAlpha: 0.9 },
    S: { bloom: 0.6, camYaw: -0.1 },
  },
  dissolveMid: {
    U: { uDissolve: 0.6, uErode: 0.585, uScatter: 0.7, uWireAlpha: 1 },
    S: { bloom: 0.7, camYaw: -0.14 },
  },
  wiresEarly: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uWireAlpha: 1, uGrow: 0.25, uTwist: 0.4, uFogDensity: 0.03 },
    S: { bloom: 0.9, camY: -0.9, lookY: -1.3, camZ: 5.4, camYaw: 0.02, vignette: 0.55 },
  },
  wiresMid: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uWireAlpha: 1, uGrow: 0.55, uTwist: 1, uFogDensity: 0.045 },
    S: { bloom: 0.95, camY: -2.5, lookY: -2.9, camZ: 5.6, camYaw: 0.12, vignette: 0.5 },
  },
  fuse: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uWireAlpha: 1, uGrow: 1, uTwist: 0.55, uFuse: 0.85, uRelease: 0.35, uFogDensity: 0.045 },
    S: { bloom: 1.15, camY: -6, lookY: -6, camZ: 3.9, camYaw: 0.05, vignette: 0.5 },
  },
  harden: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uWireAlpha: 0.7, uGrow: 1, uFuse: 1, uRelease: 0.9, uHarden: 0.8, uReveal: 0.55, uFogDensity: 0.02 },
    S: { bloom: 0.65, camY: -6, lookY: -6, camZ: 3.6, vignette: 0.6 },
  },
  glint: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uWireAlpha: 0.2, uGrow: 1, uFuse: 1, uRelease: 1, uHarden: 1, uReveal: 0.95, uGlint: 0.5, uFogDensity: 0.015 },
    S: { bloom: 0.55, camY: -6, lookY: -6, camZ: 3.5, vignette: 0.65 },
  },
  end: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uGrow: 1, uFuse: 1, uRelease: 1, uHarden: 1, uReveal: 1, uFogDensity: 0.015 },
    S: { bloom: 0.45, camY: -6, lookY: -6, camZ: 3.4, vignette: 0.7, glassesYaw: 0, glassesPitch: 0 },
  },
  wiresMidNB: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uWireAlpha: 1, uGrow: 0.55, uTwist: 1, uFogDensity: 0.045 },
    S: { bloom: 0.001, camY: -2.5, lookY: -2.9, camZ: 5.6, camYaw: 0.12, vignette: 0.5 },
  },
  fuseNB: {
    U: { uDissolve: 1, uErode: 1, uScatter: 1, uWireAlpha: 1, uGrow: 1, uTwist: 0.55, uFuse: 0.85, uRelease: 0.35, uFogDensity: 0.045 },
    S: { bloom: 0.001, camY: -6, lookY: -6, camZ: 3.9, camYaw: 0.05, vignette: 0.5 },
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SCENARIOS);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console error:', m.text().slice(0, 300));
});
await page.goto(process.env.BASE_URL ?? 'http://localhost:5179/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
await page.waitForTimeout(400);

for (const name of names) {
  const sc = SCENARIOS[name];
  if (!sc) {
    console.log('unknown scenario', name);
    continue;
  }
  await page.evaluate(({ u, s }) => {
    for (const [k, v] of Object.entries(u)) window.__U[k].value = v;
    Object.assign(window.__S, s);
  }, { u: sc.U, s: sc.S });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}still-${name}.png` });
  console.log('captured', name);
}

await browser.close();
