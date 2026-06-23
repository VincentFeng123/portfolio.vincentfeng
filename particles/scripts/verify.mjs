// Headless runtime verification: load the page in Chromium (system Chrome,
// real GPU where possible), step through scroll positions, capture console
// errors and screenshots. Dev-only tool, not part of the build.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5179/';
const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
const warnings = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
  if (msg.type() === 'warning') warnings.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });

// wait for the loader to finish (removed from DOM on done)
try {
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  console.log('loader finished');
} catch {
  console.log('LOADER NEVER FINISHED');
  await page.screenshot({ path: `${OUT}stuck.png` });
}

const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return 'NO WEBGL2';
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log('GPU:', gpu);

const positions = [0, 0.05, 0.12, 0.18, 0.24, 0.3, 0.4, 0.5, 0.6, 0.68, 0.76, 0.82, 0.88, 0.95, 1.0];
for (const p of positions) {
  await page.evaluate((frac) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, frac * max);
  }, p);
  // let the scrub (0.9s smoothing) catch up and render several frames
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}p${String(Math.round(p * 100)).padStart(3, '0')}.png` });
  console.log(`captured p=${p}`);
}

console.log('--- console errors:', errors.length);
for (const e of errors.slice(0, 20)) console.log('ERR:', e.slice(0, 500));
console.log('--- console warnings:', warnings.length);
for (const w of warnings.slice(0, 10)) console.log('WARN:', w.slice(0, 300));

await browser.close();
