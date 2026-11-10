// Run with node serve.mjs active and Playwright installed.
// PLAYWRIGHT_MODULE may point to a bundled Playwright module.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { DIST_IDS } from '../js/data.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.CITADELS_URL || 'http://localhost:5173';
for (const id of DIST_IDS) {
  const data = await readFile(new URL(`../assets/districts/${id}.webp`, import.meta.url));
  assert.equal(data.subarray(8, 12).toString(), 'WEBP', `missing artwork: ${id}`);
}
const browser = await chromium.launch({ channel: process.env.CITADELS_BROWSER || 'chrome', headless: true });
const errors = [];
const screenshots = process.env.CITADELS_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
try {
  async function pageFor(width, height, touch = true) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(url)) errors.push(`${r.status()} ${r.url()}`); });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('c3d.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('c3d.settings') || '{}'), tips: false }));
      window.webglRequests = 0;
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (/webgl/i.test(type)) { window.webglRequests++; throw new Error('WebGL disabled for board test'); }
        return getContext.call(this, type, ...args);
      };
    });
    return page;
  }

  for (const [name, width, height] of [['tablet', 1024, 768], ['portrait-tablet', 768, 1024], ['phone', 393, 852], ['desktop', 1440, 900]]) {
    const page = await pageFor(width, height, name !== 'desktop');
    await page.goto(url + '/test/board-ui.html');
    await page.waitForFunction(() => !!window.fixture);
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
    assert.equal(await page.locator('#board .seat').count(), 7);
    const layout = await page.evaluate(() => {
      const board = document.querySelector('#board'), rect = board.getBoundingClientRect();
      const top = document.querySelector('.topbar').getBoundingClientRect();
      const dock = document.querySelector('.dock').getBoundingClientRect();
      return { x: rect.left, right: rect.right, y: rect.top, bottom: rect.bottom, top: top.bottom, dock: dock.top,
        scroll: board.scrollHeight - board.clientHeight, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(!layout.overflow, `${name}: horizontal overflow`);
    assert.ok(layout.x >= 0 && layout.right <= width, `${name}: board width`);
    assert.ok(layout.y >= layout.top && layout.bottom <= layout.dock, `${name}: board overlaps HUD`);
    assert.ok(layout.scroll <= 1, `${name}: all seven cities should fit`);
    if (screenshots) await page.screenshot({ path: `${screenshots}/${name}.png` });

    // Every city, including the local one, has an accessible inspection button.
    await page.locator('.board-city[data-pid="1"] .seat').click();
    assert.equal(await page.evaluate(() => window.fixture.scene.focused), 1);
    assert.equal(await page.locator('.board-city:visible').count(), 1);
    await page.locator('.sheet [data-a="close"]').click();
    await page.locator('[data-a="overview"]').click();
    assert.equal(await page.locator('.board-city:visible').count(), 7);

    // Building through the real hand/HUD updates the existing 2D city.
    await page.locator('.hand .card[data-id="market"]').click();
    await page.locator('[data-a="build"]').click();
    assert.equal(await page.locator('.board-city[data-pid="0"] .board-building').count(), 2);
    assert.equal(await page.evaluate(() => window.fixture.state.players[0].hand.length), 0);

    // Repeated state refreshes and language changes keep one header per seat.
    await page.evaluate(async () => {
      window.fixture.render(); window.fixture.render();
      const { setLang } = await import('/js/i18n.js'); setLang('de');
      window.fixture.scene.relang(); window.fixture.ui.relang();
    });
    assert.equal(await page.locator('#board .seat').count(), 7);
    assert.equal(await page.evaluate(() => window.webglRequests), 0);
    await page.close();
  }

  for (const marshal of [false, true]) {
    const page = await pageFor(1024, 768);
    await page.goto(url + '/test/board-ui.html' + (marshal ? '?marshal' : ''));
    await page.waitForFunction(() => !!window.fixture);
    const target = page.locator('.board-city[data-pid="1"] .board-building').first();
    const uid = await target.getAttribute('data-uid');
    await page.locator(`[data-a="sheet"][data-v="${marshal ? 'marshal' : 'war'}"]`).click();
    assert.ok(await page.locator('.board-building.target').count() > 0);
    // Collapsing targeting leaves the board available for a direct district pick.
    await page.locator('.sheet [data-a="hideSheet"]').click();
    await target.click();
    assert.equal(await page.locator(`.board-building.target[data-uid="${uid}"]`).count(), 1);
    await page.locator(`[data-a="${marshal ? 'seizeGo' : 'destroyGo'}"]`).click();
    assert.equal(await page.locator(`.board-city[data-pid="1"] [data-uid="${uid}"]`).count(), 0);
    assert.equal(await page.locator(`.board-city[data-pid="0"] [data-uid="${uid}"]`).count(), marshal ? 1 : 0);
    assert.equal(await page.locator('.board-building.target').count(), 0);
    await page.close();
  }

  // Real app boot, solo setup, settings and saved-game recovery without WebGL/CDNs.
  const page = await pageFor(1024, 768);
  const requests = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto(url);
  await page.locator('#boot.done').waitFor();
  await page.locator('#lobby [data-a="settings"]').click();
  assert.equal(await page.locator('[data-s="quality"]').count(), 0);
  await page.locator('[data-s="reduceMotion"]').click();
  assert.ok(await page.locator('#board.calm').count());
  await page.locator('[data-s="close"]').click();
  await page.locator('[data-a="go"][data-v="solo"]').click();
  await page.locator('[data-a="startSolo"]').click();
  await page.locator('#hud.on').waitFor();
  await page.waitForFunction(() => !!localStorage.getItem('c3d.save'));
  await page.reload();
  await page.locator('[data-a="continue"]').click();
  await page.locator('#hud.on').waitFor();
  assert.ok(await page.locator('#board.calm').count());
  assert.equal(await page.evaluate(() => window.webglRequests), 0);
  assert.ok(!requests.some(u => /models\.js|materials\.js|three(@|\/)/.test(u)), 'runtime loads authoring code');
  assert.deepEqual(errors, [], 'browser errors');
  await page.close();
  console.log(`ok — ${DIST_IDS.length} baked assets; 4 layouts; build, inspect, destroy, seize, language, save recovery; WebGL blocked`);
} finally {
  await browser.close();
}
