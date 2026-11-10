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

  // Real taps (not mouse clicks) reveal effects without hover, including cards
  // re-created by the selection handler and character chips in board headers.
  for (const [width, height] of [[1024, 768], [393, 852]]) {
    const page = await pageFor(width, height);
    await page.goto(url + '/test/board-ui.html?details');
    await page.waitForFunction(() => !!window.fixture);
    const expected = await page.evaluate(async () => {
      const { cabil, ddesc } = await import('/js/i18n.js');
      return { skill: cabil(8), assassin: cabil(1), quarry: ddesc('quarry') };
    });
    const tip = page.locator('.tip.on.pinned');
    await page.locator('.hand .card[data-id="quarry"]').tap();
    assert.ok((await tip.innerText()).includes(expected.quarry), 'hand district effect');
    assert.equal(await page.locator('.hand .card.sel[data-id="quarry"]').count(), 1, 'tap still selects hand card');
    await page.locator('.hand .card[data-id="quarry"]').dispatchEvent('pointerout', { pointerType: 'touch' });
    assert.equal(await tip.count(), 1, 'touch pointer-out must not dismiss details');
    await page.locator('.calltrack [data-char="8"]').tap();
    assert.ok((await tip.innerText()).includes(expected.skill), 'call-track character skill');
    await page.locator('[data-tip-close]').tap();
    assert.equal(await page.locator('.tip.on').count(), 0, 'explicit close');

    const purple = await page.evaluate(() => window.fixture.state.players.flatMap(p => p.city).find(c => c.color === 'purple'));
    await page.locator(`.board-building[data-uid="${purple.uid}"]`).tap();
    const effect = await page.evaluate(async id => (await import('/js/i18n.js')).ddesc(id), purple.id);
    assert.ok((await tip.innerText()).includes(effect), 'board district effect');
    assert.equal(await page.locator('.sheet-wrap.open').count(), 0, 'building tap shows details directly');
    const bounds = await tip.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, 'details fit the viewport');
    await page.locator('[data-a="overview"]').tap();
    assert.equal(await page.locator('.tip.on').count(), 0, 'tap elsewhere dismisses details');

    if (width > 760) {
      await page.locator('.board-city[data-pid="1"] [data-char="1"]').tap();
      assert.ok((await tip.innerText()).includes(expected.assassin), 'board-header character skill');
      assert.equal(await page.evaluate(() => window.fixture.scene.focused), null, 'character tap must not inspect the city');
      await page.locator('[data-tip-close]').tap();
    }
    const pid = await page.evaluate(uid => window.fixture.state.players.find(p => p.city.some(c => c.uid === uid)).id, purple.uid);
    await page.locator(`.board-city[data-pid="${pid}"] .s-name`).tap();
    await page.locator(`.sheet .card[data-id="${purple.id}"]`).tap();
    assert.ok((await tip.innerText()).includes(effect), 'inspected-city district effect');
    await page.locator('[data-tip-close]').tap();
    await page.locator('.sheet [data-a="close"]').tap();
    await page.locator('[data-a="sheet"][data-v="rules"]').tap();
    await page.locator('.sheet .ccard[data-char="8"]').tap();
    assert.ok((await tip.innerText()).includes(expected.skill), 'full skill on compact character card');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.tip.on').count(), 0, 'Escape dismisses details');
    assert.equal(await page.locator('.sheet-wrap.open').count(), 1, 'Escape dismisses details before its parent sheet');
    assert.equal(await page.evaluate(() => window.fixture.state.turn.charId), 8, 'detail taps leave the turn intact');
    await page.close();
  }

  // The result recap opens its own dialog and returns to the results on close.
  for (const [name, width, height, players] of [['journey-tablet', 1024, 768, 7], ['journey-phone', 393, 852, 7], ['journey-two-player', 1024, 768, 2]]) {
    const page = await pageFor(width, height);
    await page.goto(url + `/test/board-ui.html?over&players=${players}`);
    await page.locator('.over-sheet').waitFor();
    assert.equal(await page.locator('details.journeys').count(), 0, 'recap must not be an inline dropdown');
    await page.locator('[data-a="journey"]').tap();
    await page.locator('.journey-sheet').waitFor();
    assert.equal(await page.locator('.over-sheet').count(), 0, 'recap has a separate view');
    assert.equal(await page.locator('[data-a="restoreSheet"]:visible').count(), 0, 'parent results drawer stays hidden in the recap');
    assert.equal(await page.locator('.journey-round').count(), 0, 'keep the original player-by-player display');
    assert.equal(await page.locator('.journey-players > .jr').count(), players);
    const expectedHistory = await page.evaluate(() => [...window.fixture.state.scores].sort((a, b) => b.total - a.total).map(r => ({
      pid: r.pid, played: window.fixture.state.players[r.pid].played,
    })));
    const actualHistory = await page.locator('.journey-players > .jr').evaluateAll(rows => rows.map(row => ({
      pid: +row.dataset.pid, played: [...row.querySelectorAll('.chip[data-char]')].map(chip => +chip.dataset.char),
    })));
    assert.deepEqual(actualHistory, expectedHistory, 'preserve score order and each player’s complete character sequence');
    const bounds = await page.locator('.journey-sheet').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, 'recap dialog fits the viewport');
    if (screenshots) await page.screenshot({ path: `${screenshots}/${name}.png`, animations: 'disabled' });
    const entry = page.locator('.journey-players .chip[data-char]').first();
    const id = +(await entry.getAttribute('data-char'));
    const ability = await page.evaluate(async id => (await import('/js/i18n.js')).cabil(id), id);
    await entry.tap();
    assert.ok((await page.locator('.tip.on.pinned').innerText()).includes(ability), 'recap characters show their skill on tap');
    await page.locator('[data-tip-close]').tap();
    await page.locator('[data-a="journeyBack"]').tap();
    assert.equal(await page.locator('.over-sheet .score').count(), 1, 'Back restores scores');
    await page.locator('[data-a="journey"]').tap();
    await page.locator('.journey-sheet [data-a="close"]').tap();
    assert.equal(await page.locator('.over-sheet .score').count(), 1, 'Close restores scores');
    await page.locator('[data-a="journey"]').tap();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.over-sheet .score').count(), 1, 'Escape restores scores');
    assert.equal(await page.locator('[data-a="restoreSheet"]:visible').count(), 0, 'no abandoned recap drawer');
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
  console.log(`ok — ${DIST_IDS.length} baked assets; 4 layouts; touch details, recap dialog, build, inspect, destroy, seize, language, save recovery; WebGL blocked`);
} finally {
  await browser.close();
}
