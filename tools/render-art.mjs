// Offline authoring only. Install playwright, then run node tools/render-art.mjs
// with node serve.mjs running. PLAYWRIGHT_MODULE may point to a bundled package.
// The game itself never imports Three.js or creates a WebGL context.
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.CITADELS_BROWSER || 'chrome', headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error(e));
  const ids = process.argv.slice(2).join(',');
  await page.goto((process.env.CITADELS_URL || 'http://localhost:5173') + '/tools/render-art.html' + (ids ? '?ids=' + encodeURIComponent(ids) : ''));
  await page.waitForFunction(() => !!window.artwork);
  const images = await page.evaluate(() => window.artwork);
  const dir = new URL('../assets/districts/', import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const [id, data] of Object.entries(images)) {
    if (!data.startsWith('data:image/webp;base64,')) throw new Error(`Missing WebP artwork: ${id}`);
    await writeFile(new URL(id + '.webp', dir), Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(`Rendered ${Object.keys(images).length} district images.`);
} finally {
  await browser.close();
}
