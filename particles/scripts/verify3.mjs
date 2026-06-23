// Production build smoke test + LOW-tier (mobile) emulation.
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://localhost:5180/';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

// ---- production build, desktop ------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  for (const p of [0.18, 0.45, 0.8]) {
    await page.evaluate((f) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, f * max);
    }, p);
    await page.waitForTimeout(1600);
  }
  await page.screenshot({ path: `${OUT}prod-080.png` });
  console.log('prod desktop ok, errors:', errors.length ? errors : 'none');
  await page.close();
}

// ---- LOW tier: mobile emulation ------------------------------------------------
{
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    // playwright mobile emulation sets pointer: coarse + small screen -> LOW tier
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  const tierProbe = await page.evaluate(() => ({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(window.screen.width, window.screen.height),
  }));
  console.log('mobile probe:', JSON.stringify(tierProbe));
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, 0.45 * max);
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}mobile-045.png` });
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const loop = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(loop);
          else resolve(Math.round((n / (performance.now() - t0)) * 1000));
        };
        requestAnimationFrame(loop);
      }),
  );
  console.log('mobile FPS at wires stage:', fps, '— errors:', errors.length ? errors : 'none');
  await ctx.close();
}

await browser.close();
console.log('verify3 complete');
