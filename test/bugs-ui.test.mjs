// Run with node serve.mjs and PLAYWRIGHT_MODULE set if Playwright is bundled.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.CITADELS_BROWSER || 'chrome', headless: true });
try {
  for (const width of [1440, 393]) {
    const page = await browser.newPage({ viewport: { width, height: width === 393 ? 852 : 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', r => r.abort());
    await page.goto((process.env.CITADELS_URL || 'http://localhost:5173') + '/test/board-ui.html');
    await page.waitForFunction(() => !!window.fixture);
    await page.evaluate(async () => {
      const { createGame } = await import('/js/engine.js');
      const s = createGame({ players: ['You', 'Earlier', 'Later', 'Last'].map(name => ({ name })), chars: [1, 21, 3, 4, 5, 6, 14, 8], seed: 42 });
      s.draft.order = [1, 0, 2, 3]; s.draft.idx = 1;
      s.draft.avail = s.draft.avail.filter(id => id !== 3);
      s.players[1].chars = [3];
      Object.assign(fixture.state, s);
      fixture.ui.resetLog(); fixture.render();
    });
    const opts = await page.locator('[data-a="pick"]').evaluateAll(es => es.map(e => e.dataset.char));
    await page.locator('[data-a="sheet"][data-v="roundInfo"]').last().click();
    assert.match(await page.locator('#game-sheet').innerText(), /Previous players/);
    assert.equal(await page.locator('#game-sheet .ord').count(), 4);
    for (const id of opts) assert.ok(await page.locator('#game-sheet').innerHTML().then(html => html.includes('data-char="' + id + '"')));
    await page.locator('#game-sheet [data-a="close"]').click();
    await page.locator('[data-a="restoreSheet"]').click();
    await page.locator('[data-a="pick"]').first().click();
    await page.locator('[data-a="pickGo"]').click();
    await page.locator('[data-a="sheet"][data-v="roundInfo"]').last().click();
    assert.equal(await page.locator('#game-sheet .ord').count(), 4, 'draft context remains after choosing');
    assert.match(await page.locator('#game-sheet').innerText(), /Previous players/);
    await page.locator('#game-sheet [data-a="close"]').click();
    await page.evaluate(() => { fixture.ui.resetLog(); fixture.render(); });
    await page.locator('[data-a="sheet"][data-v="roundInfo"]').last().click();
    assert.match(await page.locator('#game-sheet').innerText(), /Previous players/);
    await page.locator('#game-sheet [data-a="close"]').click();

    // Scholar must keep the seven cards pending until explicit confirmation.
    await page.evaluate(() => {
      const s = fixture.state;
      s.phase = 'turns'; s.call = 7; s.revealed = [14];
      s.players[0].chars = [14];
      s.turn = { pid: 0, charId: 14, rank: 7, income: true, built: 0, max: 1, used: {}, pending: null };
      fixture.dispatch({ t: 'scholar' });
    });
    assert.equal(await page.locator('[data-a="keep"]').count(), 7);
    assert.ok(await page.locator('[data-a="keepGo"]').isDisabled());
    const handBefore = await page.evaluate(() => fixture.state.players[0].hand.length);
    const selected = await page.locator('[data-a="keep"]').first().getAttribute('data-uid');
    await page.locator('[data-a="keep"]').first().click();
    await page.locator('[data-a="keep"]').first().click();
    assert.equal(await page.evaluate(() => fixture.state.players[0].hand.length), handBefore);
    assert.equal(await page.locator('[data-a="keep"].sel').count(), 1);
    assert.ok(await page.locator('[data-a="keepGo"]').isEnabled());
    await page.locator('[data-a="keepGo"]').click();
    assert.ok(await page.evaluate(uid => fixture.state.players[0].hand.some(c => c.uid === uid), selected));
    assert.equal(await page.evaluate(() => fixture.state.turn.pending), null);
    assert.ok(await page.locator('.me-panel .thinking').isVisible());
    await page.evaluate(() => { fixture.state.turn.pid = 1; fixture.render(); });
    assert.ok(await page.locator('#board .seat[data-v="1"] .thinking').isVisible());
    assert.equal(await page.locator('.me-panel .thinking').count(), 0);

    await page.evaluate(() => {
      const s = fixture.state;
      s.players[0].chars = [21]; s.revealed = [21];
      s.turn = { pid: 0, charId: 21, rank: 2, income: true, built: 0, max: 1, used: {}, pending: null };
      fixture.render();
    });
    await page.locator('[data-a="sheet"][data-v="threats"]').click();
    assert.equal(await page.locator('[data-a="threatPick"][data-v="21"]').count(), 0);
    assert.ok(await page.locator('[data-a="threatPick"]').count() >= 2);
    await page.locator('#game-sheet [data-a="close"]').click();

    if (width === 1440) {
      await page.locator('[data-a="pinChronicle"]').click();
      await page.evaluate(() => {
        for (let id = 100; id < 150; id++) fixture.ui.event({ id, k: 'call', pid: id % 2, charId: id % 2 ? 4 : 14 }, { ...fixture.state, me: 0 });
        document.querySelector('.chronicle-body').scrollTop = 0;
        fixture.ui.event({ id: 151, k: 'call', pid: 0, charId: 14 }, { ...fixture.state, me: 0 });
      });
      const log = await page.locator('.chronicle-body').evaluate(e => ({ bottom: e.scrollHeight - e.scrollTop - e.clientHeight, count: e.querySelectorAll('.lk-call').length }));
      assert.ok(log.bottom <= 1, 'new events always scroll to the bottom');
      assert.equal(log.count, 51);
      assert.ok(await page.locator('.chronicle-sidebar li').last().evaluate(e => e.classList.contains('log-mine')));
      await page.locator('[data-a="sheet"][data-v="log"]').click();
      assert.ok(await page.locator('#game-sheet .log-mine').count());
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Bug UI regressions passed at desktop and 393×852.');
} finally { await browser.close(); }
