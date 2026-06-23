// Second verification pass: reversibility, reduced motion, FPS, end state.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://localhost:5179/';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

async function newPage(opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...opts });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) console.log('console error:', m.text().slice(0, 300));
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  return page;
}

const scrollTo = (page, frac) =>
  page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, f * max);
  }, frac);

// ---- 1. reversibility: forward to end, then back ---------------------------
{
  const page = await newPage();
  await scrollTo(page, 1.0);
  await page.waitForTimeout(2500);
  for (const p of [0.82, 0.5, 0.18, 0]) {
    await scrollTo(page, p);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}rev${String(Math.round(p * 100)).padStart(3, '0')}.png` });
    console.log('reverse captured', p);
  }
  // rest-state check at exactly 0 after a full round trip
  const state = await page.evaluate(() => ({
    dissolve: window.__U.uDissolve.value,
    reveal: window.__U.uReveal.value,
    grow: window.__U.uGrow.value,
  }));
  console.log('state after round trip at p=0:', JSON.stringify(state));
  await page.close();
}

// ---- 2. FPS at the heaviest stage (fuse) ------------------------------------
{
  const page = await newPage();
  await scrollTo(page, 0.65);
  await page.waitForTimeout(2500);
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const loop = () => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
          else resolve(Math.round((n / (performance.now() - t0)) * 1000));
        };
        requestAnimationFrame(loop);
      }),
  );
  console.log('FPS at fuse stage:', fps);
  await page.close();
}

// ---- 3. reduced motion -------------------------------------------------------
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('rm pageerror:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  for (const p of [0.2, 0.55, 1.0]) {
    await scrollTo(page, p);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}rm${String(Math.round(p * 100)).padStart(3, '0')}.png` });
    console.log('reduced-motion captured', p);
  }
  await ctx.close();
}

// ---- 4. end state after lens fix ---------------------------------------------
{
  const page = await newPage();
  await scrollTo(page, 1.0);
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `${OUT}final-end.png` });
  console.log('end state captured');
  await page.close();
}

await browser.close();
console.log('verify2 complete');
