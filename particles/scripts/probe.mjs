// Quick scroll-state probe: where does the page actually sit after scrollTo?
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5179/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });

const dims = await page.evaluate(() => ({
  scrollHeight: document.documentElement.scrollHeight,
  bodyScrollHeight: document.body.scrollHeight,
  innerHeight: window.innerHeight,
  trackHeight: document.getElementById('scroll-track')?.getBoundingClientRect().height,
  trackTop: document.getElementById('scroll-track')?.getBoundingClientRect().top,
}));
console.log('dims:', dims);

for (const frac of [0, 0.2, 0.3, 0.5]) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, f * max);
  }, frac);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => {
      const st = window.__st;
      return {
        scrollY: Math.round(window.scrollY),
        stProgress: st ? Number(st.progress.toFixed(3)) : 'n/a',
        u: window.__U ? {
          dissolve: Number(window.__U.uDissolve.value.toFixed(2)),
          grow: Number(window.__U.uGrow.value.toFixed(2)),
          reveal: Number(window.__U.uReveal.value.toFixed(2)),
        } : 'no debug',
      };
    });
    console.log(`frac=${frac} t=${(i + 1) * 0.7}s`, JSON.stringify(state));
  }
}
await browser.close();
