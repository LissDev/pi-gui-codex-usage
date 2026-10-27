import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { harness, root, timestamp } from './helpers.js';

const snapshot = {
  summary: 'Codex usage · 75% left',
  overview: {
    metrics: [{ label: 'Plan', value: 'plus' }, { label: 'Credits', value: '12.50' }, { label: 'Earned resets', value: 2 }, { label: 'Applicable', value: 0 }],
    lines: ['Plan: plus', 'Credits: 12.50', 'Earned resets: 2 · applicable: 0'],
    windows: [{ label: '7 days', usedPercent: 25, leftPercent: 75, resetAt: 1793725200 }],
    updatedAt: timestamp, stale: false, error: null,
  },
  analytics: {
    metrics: [{ label: 'Lifetime tokens', value: 123456 }, { label: 'Peak daily tokens', value: 9876 }, { label: 'Current streak days', value: 4 }, { label: 'Total threads', value: 42 }],
    invocations: [],
    lines: ['Lifetime tokens: 123456', 'Peak daily tokens: 9876', 'Current streak days: 4', 'Total threads: 42'],
    daily: [{ date: '2026-10-25', tokens: 1000 }, { date: '2026-10-26', tokens: 3456 }],
    cumulative: [{ date: '2026-10-25', tokens: 1000 }, { date: '2026-10-26', tokens: 4456 }],
    weekly: [{ date: '2026-10-19', tokens: 4456 }, { date: '2026-10-26', tokens: 8000 }],
    updatedAt: timestamp, stale: false, error: null,
  },
};
let browser;
let server;
let url;

before(async () => {
  const h = await harness();
  const declaration = h.declarations.find(view => view.title === 'Codex Usage');
  const frontend = declaration ? `/package/${new URL(declaration.frontend).pathname.slice(root.pathname.length)}` : null;
  server = createServer(async (request, response) => {
    try {
      if (new URL(request.url, 'http://fixture').pathname === '/') {
        response.setHeader('content-type', 'text/html');
        response.end(`<main id="root"></main><script>window.fixtureConfig=${JSON.stringify({ frontend, snapshot, deferredRefresh: request.url.includes('deferred=1') })}</script><script type="module" src="/fixture.js"></script>`);
      } else if (request.url === '/fixture.js') {
        response.setHeader('content-type', 'application/javascript');
        response.end(await readFile(new URL('browser-fixture.js', import.meta.url)));
      } else if (request.url.startsWith('/package/')) {
        const target = new URL(request.url.slice('/package/'.length), root);
        if (!target.href.startsWith(root.href)) throw new Error('Outside package');
        response.setHeader('content-type', target.pathname.endsWith('.css') ? 'text/css' : 'application/javascript');
        response.end(await readFile(fileURLToPath(target)));
      } else { response.statusCode = 404; response.end(); }
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function pageFor(t, next, timezoneId = 'Europe/Moscow', contextOptions = {}) {
  const page = await browser.newPage({ viewport: { width: 440, height: 900 }, timezoneId, ...contextOptions });
  t.after(() => page.close());
  await page.clock.install({ time: new Date('2026-10-27T00:30:00+03:00') });
  await page.goto(url);
  await page.waitForFunction(() => window.probe?.ready);
  assert.equal(await page.evaluate(() => window.probe.error), null, 'Declared frontend loads without runtime errors');
  if (next) await page.evaluate(state => window.probe.publish(state), next);
  return page;
}

test('graphical Overview renders real progress and preserves report semantics on state updates', async t => {
  const page = await pageFor(t);
  assert.equal(await page.getByRole('tab', { name: 'Overview', exact: true }).count(), 1, 'Overview is a native report tab');
  assert.equal(await page.getByRole('tab', { name: 'Analytics', exact: true }).count(), 1);
  const meters = page.locator('[role="meter"], [role="progressbar"], progress, meter');
  assert.ok(await meters.count(), 'Quota renders as a graphical meter');
  assert.equal(await meters.first().evaluate(element => Number(element.getAttribute('aria-valuenow') ?? element.value)), 25);
  assert.match(await page.locator('#root').innerText(), /plus/i);
  assert.match(await page.locator('#root').innerText(), /12\.50/);
  assert.match(await page.locator('#root').innerText(), /reset/i);
  const next = structuredClone(snapshot);
  next.overview.windows[0].usedPercent = 60;
  next.overview.windows[0].leftPercent = 40;
  next.overview.stale = true;
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(await meters.first().evaluate(element => Number(element.getAttribute('aria-valuenow') ?? element.value)), 60);
  assert.match(await page.locator('#root').innerText(), /stale/i);
  assert.ok(await page.locator('#root').evaluate(element => element.scrollWidth <= innerWidth), 'Report fits the workbench width');
});

test('Analytics tab shows all dated series as charts and keyboard accessible heatmaps', async t => {
  const page = await pageFor(t);
  const tab = page.getByRole('tab', { name: 'Analytics', exact: true });
  assert.equal(await tab.count(), 1, 'Analytics view exists in the report');
  await tab.focus();
  await page.keyboard.press('Enter');
  assert.equal(await tab.getAttribute('aria-selected'), 'true');
  const text = (await page.locator('#root').innerText()).replaceAll(',', '');
  assert.match(text, /123456/);
  assert.match(text, /daily/i);
  assert.match(text, /cumulative/i);
  assert.match(text, /weekly/i);
  assert.ok(await page.locator('svg, canvas, [role="img"]').count() >= 3, 'All three histories have graphical charts');
  assert.equal(await page.getByRole('table').count(), 0, 'Heatmaps replace history tables');
  for (const [title, date, count] of [['Daily', '2026.10.26', 3456], ['Cumulative', '2026.10.26', 4456], ['Weekly', '2026.10.19', 4456]]) {
    const section = page.getByRole('heading', { name: title, exact: true }).locator('..');
    const cell = section.getByLabel(new RegExp(`^${date.replaceAll('.', '\\.')}\\b`));
    assert.equal(await cell.count(), 1, `${title} has a cell for the supplied bucket`);
    await cell.focus();
    assert.match((await page.getByRole('tooltip').innerText()).replaceAll(',', ''), new RegExp(`${date.replaceAll('.', '\\.')}[\\s\\S]*${count}`));
  }
  assert.equal(await page.getByRole('button', { name: /reset|consume|buy|sign in/i }).count(), 0, 'Report has no account mutation controls');
});

test('details mount polls finitely; dispose and abort stop timers and release the binding', async t => {
  const page = await pageFor(t);
  const mounted = await page.evaluate(() => ({ timers: window.probe.timers.size, calls: window.probe.calls }));
  assert.equal(mounted.timers, 1, 'Mounted details owns one frontend polling interval');
  assert.equal(mounted.calls, 1, 'Mount requests a finite refresh');
  await page.evaluate(() => window.probe.tick());
  assert.equal(await page.evaluate(() => window.probe.calls), 2);
  await page.evaluate(async () => { window.probe.close(); await Promise.resolve(); await window.probe.tick(); });
  assert.deepEqual(await page.evaluate(() => ({ timers: window.probe.timers.size, calls: window.probe.calls, disposed: window.probe.disposed })), { timers: 0, calls: 2, disposed: 1 });
  await page.evaluate(() => window.probe.mount());
  assert.equal(await page.getByRole('tab', { name: 'Overview', exact: true }).count(), 1, 'Remount hydrates the same sanitized service');
  await page.evaluate(async () => { window.probe.abort(); await Promise.resolve(); });
  assert.equal(await page.evaluate(() => window.probe.timers.size), 0);
  assert.equal(await page.evaluate(() => window.probe.disposed), 2);
  assert.equal(await page.evaluate(() => window.probe.unsubscribed), 2);
});

for (const outcome of ['success', 'rejection']) {
  test(`fresh details mount suppresses cached account data until identity refresh ${outcome}`, async t => {
    const page = await browser.newPage({ viewport: { width: 440, height: 900 } });
    t.after(() => page.close());
    await page.goto(`${url}?deferred=1`);
    await page.waitForFunction(() => window.probe?.calls === 1);
    const next = structuredClone(snapshot);
    next.overview.windows[0].usedPercent = 71;
    next.overview.windows[0].leftPercent = 29;
    next.overview.lines = ['Plan: account B plan', 'Credits: 98.76'];
    next.overview.metrics = [{ label: 'Plan', value: 'account B plan' }, { label: 'Credits', value: '98.76' }];
    next.analytics.lines = ['Lifetime tokens: 654321'];
    next.analytics.metrics = [{ label: 'Lifetime tokens', value: 654321 }];
    next.analytics.daily = [{ date: '2026-10-27', tokens: 8888 }];
    try {
      await page.evaluate(state => window.probe.publish(state), snapshot);
      assert.doesNotMatch(await page.locator('#root').innerText(), /25\s*%|75\s*%|12\.50/,
        'Fresh mount must not expose cached account A before current identity is verified');
      await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
      assert.doesNotMatch((await page.locator('#root').innerText()).replaceAll(',', ''), /123456|3456|4456|8000/);
      assert.equal(await page.locator('svg, canvas, [role="img"]').count(), 0, 'Unverified cached history is not graphed');
      assert.equal(await page.locator('tbody tr').count(), 0, 'Unverified cached history is not tabulated');
    } finally {
      if (outcome === 'success') await page.evaluate(state => window.probe.completeRefresh(state), next);
      else await page.evaluate(() => window.probe.failRefresh());
      await page.waitForFunction(() => window.probe.ready);
    }
    if (outcome === 'success') {
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
      assert.match(await page.locator('#root').innerText(), /71\s*%/);
      await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
      assert.match((await page.locator('#root').innerText()).replaceAll(',', ''), /654321/);
    } else {
      const text = (await page.locator('#root').innerText()).replaceAll(',', '');
      assert.match(text, /unavailable|sign in|auth/i);
      assert.doesNotMatch(text, /25\s*%|123456|3456|4456|8000/);
    }
  });
}

for (const outcome of ['false', 'empty', 'undefined']) {
  test(`details identity gate rejects ${outcome} refresh result without exposing cached metrics`, async t => {
    const page = await browser.newPage({ viewport: { width: 440, height: 900 } });
    t.after(() => page.close());
    await page.goto(`${url}?deferred=1`);
    await page.waitForFunction(() => window.probe?.calls === 1);
    const pendingText = await page.locator('#root').innerText();
    await page.evaluate(kind => window.probe.resolveRefresh(kind === 'undefined' ? undefined : kind === 'empty' ? {} : { verified: false }), outcome);
    await page.waitForFunction(() => window.probe.ready);
    assert.doesNotMatch(pendingText, /25\s*%|75\s*%|12\.50/);
    assert.doesNotMatch(await page.locator('#root').innerText(), /25\s*%|75\s*%|12\.50/,
      'Only an explicit verified result can unlock cached account metrics');
    assert.match(await page.locator('#root').innerText(), /unavailable|auth|sign in/i);
    await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
    assert.doesNotMatch((await page.locator('#root').innerText()).replaceAll(',', ''), /123456|3456|4456|8000/);
    assert.equal(await page.locator('svg, canvas, [role="img"]').count(), 0);
    assert.equal(await page.locator('tbody tr').count(), 0);
  });
}

test('previously verified details clears metrics when a later refresh is cancelled unverified', async t => {
  const page = await pageFor(t);
  assert.match(await page.locator('#root').innerText(), /25\s*%/);
  await page.evaluate(() => { window.probe.deferNextRefresh(); window.probe.pendingTick = window.probe.tick(); });
  await page.waitForFunction(() => window.probe.calls === 2);
  await page.evaluate(async () => { window.probe.resolveRefresh({ verified: false }); await window.probe.pendingTick; });
  assert.doesNotMatch(await page.locator('#root').innerText(), /25\s*%|75\s*%|12\.50/,
    'Cancelled identity refresh revokes the previous rendering gate');
  assert.match(await page.locator('#root').innerText(), /unavailable|auth|sign in/i);
});

test('open details follows host theme changes without remounting', async t => {
  const page = await pageFor(t);
  const report = page.locator('article');
  const colors = () => report.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    foreground: getComputedStyle(element).color,
    accent: getComputedStyle(element.querySelector('[aria-selected="true"]')).color,
    mode: getComputedStyle(element).colorScheme,
  }));
  assert.deepEqual(await colors(), {
    background: 'rgb(29, 29, 28)', foreground: 'rgb(211, 211, 207)', accent: 'rgb(122, 162, 247)', mode: 'dark',
  }, 'Mounted report starts with the host dark theme');
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await page.evaluate(() => {
    window.probe.openReport = document.querySelector('article');
    window.probe.changeTheme({ mode: 'light', background: '#faf9f5', foreground: '#232323', accent: '#315ba8' });
  });
  assert.deepEqual(await page.evaluate(() => {
    const root = document.documentElement;
    return ['--background', '--foreground', '--accent', 'color-scheme'].map(name => root.style.getPropertyValue(name));
  }), ['#faf9f5', '#232323', '#315ba8', 'light'], 'Host frame publishes the new theme on the document root');
  assert.deepEqual(await colors(), {
    background: 'rgb(250, 249, 245)', foreground: 'rgb(35, 35, 35)', accent: 'rgb(49, 91, 168)', mode: 'light',
  }, 'An open report inherits the updated host colors and color scheme');
  assert.equal(await page.evaluate(() => window.probe.openReport === document.querySelector('article')), true);
  assert.equal(await page.getByRole('tab', { name: 'Analytics', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => window.probe.calls), 1, 'Theme changes do not refresh or remount the report');
});

function refinementSnapshot() {
  const next = structuredClone(snapshot);
  next.analytics.metrics.push({ label: 'Stats as of', value: Date.parse('2026-10-26T23:30:00Z'), format: 'datetime' });
  next.analytics.lines.push('Stats as of: 2026-10-26T23:30:00Z');
  const dates = ['2026-09-27', '2026-09-28', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'];
  next.analytics.daily = dates.map((date, i) => ({ date, tokens: [10000, 8000, 6000, 0, null, 250, 500, 1000, 2000, 100, 99999][i] }));
  next.analytics.cumulative = dates.map((date, i) => ({ date, tokens: 100000 + i * 1000 }));
  next.analytics.weekly = [{ date: '2026-09-21', tokens: 9000 }, { date: '2026-09-28', tokens: 3000 }, { date: '2026-10-19', tokens: 1000 }, { date: '2026-10-26', tokens: 7000 }];
  return next;
}
const historySection = (page, title) => page.getByRole('heading', { name: title, exact: true }).locator('..');
const datedCell = (section, date) => section.getByLabel(new RegExp(`^${date.replaceAll('.', '\\.')}\\b`));
const period = (page, name) => page.getByRole('button', { name, exact: true });

// These fixtures include legacy lines during RED so failures describe visible behavior,
// rather than the current renderer failing to load the new typed contract.
test('refinement: mixed missing fields disappear while zero and accessible boolean icons remain', async t => {
  const next = structuredClone(snapshot);
  next.overview.metrics = [{ label: 'Plan', value: 'plus' }, { label: 'Credits unlimited', value: false }, { label: 'Credits available', value: true }, { label: 'Applicable', value: 0 }];
  next.overview.lines = ['Plan: plus', 'Credits: unavailable · unlimited: false · available: true · overage limit reached: unavailable', 'Earned resets: unavailable · applicable: 0', 'Promo: unavailable'];
  next.overview.windows = [{ label: '7 days', usedPercent: 0, leftPercent: 100, resetAt: null }];
  const page = await pageFor(t, next);
  const text = await page.locator('#root').innerText();
  assert.doesNotMatch(text, /unavailable|Promo|overage|Reset:/i, 'Unavailable fragments, including missing reset, are omitted');
  assert.match(text, /0\s*%/);
  assert.match(text, /Applicable[\s\S]*0/i);
  const yes = page.getByLabel('True', { exact: true });
  const no = page.getByLabel('False', { exact: true });
  assert.equal(await yes.count(), 1, 'True has a non-color accessible name');
  assert.equal(await no.count(), 1, 'False has a non-color accessible name');
  assert.match(await yes.innerText(), /✓/);
  assert.match(await no.innerText(), /✕/);
  const channels = async cell => cell.evaluate(el => getComputedStyle(el).color.match(/\d+/g).map(Number));
  const green = await channels(yes);
  const red = await channels(no);
  assert.ok(green[1] > green[0] && green[1] > green[2], 'True icon is green');
  assert.ok(red[0] > red[1] && red[0] > red[2], 'False icon is red');
});

test('refinement: empty sections disappear while stale and source errors remain', async t => {
  const next = structuredClone(snapshot);
  next.overview = { lines: [], metrics: [], windows: [], updatedAt: timestamp, stale: true, error: 'Limits unavailable' };
  next.analytics = { lines: [], metrics: [], invocations: [], daily: [], cumulative: [], weekly: [], updatedAt: timestamp, stale: true, error: 'Analytics unavailable' };
  const page = await pageFor(t, next);
  assert.equal(await page.getByRole('heading', { name: /Subscription limits|Account and quota details/ }).count(), 0, 'No empty Overview groups');
  assert.match(await page.locator('#root').innerText(), /stale/i);
  assert.match(await page.locator('#root').innerText(), /Limits unavailable/);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: /Daily|Cumulative|Weekly|Top invocations/ }).count(), 0);
  assert.equal(await page.locator('svg, table, dl').count(), 0);
  assert.match(await page.locator('#root').innerText(), /Analytics unavailable/);
});

test('refinement: common inclusive calendar periods filter all three histories and preserve absolute cumulative values', async t => {
  const page = await pageFor(t, refinementSnapshot());
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await period(page, '30 days').count(), 1, 'One common 30-day control exists');
  await period(page, '30 days').click();
  const check = async (title, included, excluded) => {
    const section = historySection(page, title);
    for (const date of included) assert.equal(await datedCell(section, date).count(), 1, `${title} includes ${date}`);
    for (const date of excluded) assert.equal(await datedCell(section, date).count(), 0, `${title} excludes ${date}`);
  };
  await check('Daily', ['2026.09.28', '2026.10.27'], ['2026.09.27', '2026.10.28']);
  await check('Cumulative', ['2026.09.28', '2026.10.27'], ['2026.09.27', '2026.10.28']);
  await check('Weekly', ['2026.09.28', '2026.10.19', '2026.10.26'], ['2026.09.21']);
  await period(page, '7 days').click();
  await check('Daily', ['2026.10.21', '2026.10.27'], ['2026.10.20', '2026.10.28']);
  await check('Cumulative', ['2026.10.21', '2026.10.27'], ['2026.10.20', '2026.10.28']);
  await check('Weekly', ['2026.10.26'], ['2026.10.19', '2026.09.28']);
  await datedCell(historySection(page, 'Cumulative'), '2026.10.21').focus();
  assert.match((await page.getByRole('tooltip').innerText()).replaceAll(',', ''), /103000/, 'Cumulative values are not rebased to the period');
  assert.match((await page.locator('#root').innerText()).replaceAll(',', ''), /123456/);
  assert.match(await page.locator('#root').innerText(), /all.time/i, 'Statistics are clearly scoped to all time');
  await period(page, 'All').click();
  await check('Daily', ['2026.09.27', '2026.10.28'], []);
  await check('Weekly', ['2026.09.21'], []);
});

test('refinement: period survives tabs and live updates but remount defaults to Year', async t => {
  const next = refinementSnapshot();
  const page = await pageFor(t, next);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await period(page, '7 days').count(), 1, '7-day period exists');
  await period(page, '7 days').click();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.evaluate(state => window.probe.publish(state), next);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await datedCell(historySection(page, 'Daily'), '2026.09.28').count(), 0);
  assert.equal(await datedCell(historySection(page, 'Daily'), '2026.10.21').count(), 1);
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await period(page, 'Year').getAttribute('aria-pressed'), 'true');
  assert.equal(await datedCell(historySection(page, 'Daily'), '2026.09.28').count(), 1);
});

test('refinement: heatmap uses stable full-series intensity and distinguishes null from zero with keyboard and pointer tooltips', async t => {
  const next = refinementSnapshot();
  // One old maximum defines all four visible green levels; missing 25th is a gap.
  next.analytics.daily = [{ date: '2026-09-01', tokens: 1000 }, { date: '2026-10-21', tokens: 0 }, { date: '2026-10-22', tokens: null }, { date: '2026-10-23', tokens: 1 }, { date: '2026-10-24', tokens: 300 }, { date: '2026-10-26', tokens: 650 }, { date: '2026-10-27', tokens: 800 }];
  const page = await pageFor(t, next);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const section = historySection(page, 'Daily');
  assert.equal(await page.getByRole('table').count(), 0, 'All history tables are replaced');
  assert.equal(await period(page, 'All').count(), 1);
  await period(page, 'All').click();
  const zero = datedCell(section, '2026.10.21');
  assert.equal(await zero.count(), 1);
  const paint = cell => cell.evaluate(el => { const style = getComputedStyle(el); return style.fill === 'none' || style.fill === 'rgb(0, 0, 0)' ? style.backgroundColor : style.fill; });
  const colors = [];
  for (const date of ['2026.10.21', '2026.10.23', '2026.10.24', '2026.10.26', '2026.10.27']) colors.push(await paint(datedCell(section, date)));
  assert.equal(new Set(colors).size, 5, 'Zero plus four green intensity levels');
  assert.match(await section.innerText(), /Less[\s\S]*More/i);
  const nullCell = datedCell(section, '2026.10.22');
  if (await nullCell.count()) {
    assert.notEqual(await paint(nullCell), colors[0], 'Null is visually distinct from supplied zero');
    await nullCell.hover();
    assert.equal(await page.getByRole('tooltip').count(), 0, 'Null never claims a zero-valued bucket');
  }
  await zero.focus();
  assert.match(await page.getByRole('tooltip').innerText(), /2026\.10\.21[\s\S]*\b0\b/);
  await datedCell(section, '2026.10.24').hover();
  assert.match((await page.getByRole('tooltip').innerText()).replaceAll(',', ''), /2026\.10\.24[\s\S]*300/);
  await period(page, '7 days').click();
  assert.equal(await paint(datedCell(historySection(page, 'Daily'), '2026.10.26')), colors[3], 'Removing the historical maximum does not rescale intensity');
  await page.evaluate(() => window.probe.changeTheme({ mode: 'light', background: '#faf9f5', foreground: '#232323', accent: '#315ba8' }));
  assert.equal(await page.getByRole('table').count(), 0);
  assert.equal(await datedCell(historySection(page, 'Daily'), '2026.10.21').count(), 1);
});

test('refinement: local dotted metadata and dense chart ticks preserve source calendar dates', async t => {
  const page = await pageFor(t, refinementSnapshot(), 'America/Los_Angeles');
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const text = await page.locator('#root').innerText();
  assert.doesNotMatch(text, /2026-\d\d-\d\d|T\d\d:\d\d/, 'No ISO timestamps in rendered metrics');
  assert.match(text, /2026\.10\.26\s+16:30/, 'Metadata is local wall time');
  for (const title of ['Daily', 'Cumulative', 'Weekly']) {
    const chart = historySection(page, title).locator('svg[role="img"]');
    assert.equal(await chart.count(), 1);
    assert.ok((await chart.boundingBox()).height < 190, 'Charts are denser than the previous 190px canvas');
    const ticks = await chart.locator('text').allTextContents();
    assert.ok(ticks.some(tick => /^\d{2}\.\d{2}$/.test(tick)), 'X axis has month.day ticks');
    assert.ok(ticks.every(tick => !/2026/.test(tick)), 'X ticks omit year');
  }
  await datedCell(historySection(page, 'Daily'), '2026.10.26').focus();
  assert.match(await page.getByRole('tooltip').innerText(), /2026\.10\.26/, 'Calendar source does not shift backwards in a western timezone');
  assert.ok(await page.locator('#root').evaluate(el => el.scrollWidth <= innerWidth), 'Charts and heatmaps fit narrow pane');
});

test('refinement: invocation detail rows omit nullable fragments and retain zero all-time usage', async t => {
  const next = refinementSnapshot();
  next.analytics.invocations = [{ type: 'plugin', pluginName: 'Readable plugin', usageCount: 0 }, { type: 'skill', skillName: 'Readable skill', usageCount: 9 }];
  next.analytics.lines.push('Top invocations: plugin · Readable plugin · unavailable: 0 / skill · unavailable · Readable skill: 9');
  const page = await pageFor(t, next);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const text = await page.locator('#root').innerText();
  assert.doesNotMatch(text, /unavailable/i, 'Null invocation names do not leave placeholders');
  assert.match(text, /Readable plugin/);
  assert.match(text, /Readable skill/);
  const group = page.getByRole('heading', { name: /Top invocations/i }).locator('..');
  assert.equal(await group.count(), 1, 'Invocation details form a readable separate inline section');
  assert.match(await group.innerText(), /Readable plugin[\s\S]*\b0\b/);
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await period(page, '7 days').count(), 1);
  await period(page, '7 days').click();
  assert.match(await group.innerText(), /Readable plugin[\s\S]*\b0\b/, 'History period does not filter invocations');
});

test('interaction accessibility: keyboard period selection and background updates retain control focus', async t => {
  const next = refinementSnapshot();
  const page = await pageFor(t, next);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  for (const name of ['7 days', '30 days', '90 days', 'Year', 'All']) {
    await period(page, name).focus();
    await page.keyboard.press('Enter');
    assert.equal(await period(page, name).getAttribute('aria-pressed'), 'true');
    assert.equal(await period(page, name).evaluate(el => el === document.activeElement), true,
      `${name} retains keyboard focus after activation`);
    await page.evaluate(state => window.probe.publish(state), next);
    assert.equal(await period(page, name).evaluate(el => el === document.activeElement), true,
      `${name} retains keyboard focus after a background snapshot`);
  }
  const overview = page.getByRole('tab', { name: 'Overview', exact: true });
  await overview.focus();
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(await overview.evaluate(el => el === document.activeElement), true,
    'An update does not move focus from the report tabs into period controls');
});

test('interaction accessibility: each supplied heatmap bucket has at least a 24px pointer target', async t => {
  const page = await pageFor(t, refinementSnapshot());
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  for (const title of ['Daily', 'Cumulative', 'Weekly']) {
    const target = datedCell(historySection(page, title), '2026.10.26');
    assert.equal(await target.count(), 1);
    const size = await target.boundingBox();
    assert.ok(size.width >= 24 && size.height >= 24,
      `${title} exact-value target is ${size.width}x${size.height}px; requires at least 24x24px`);
  }
});

test('interaction accessibility: keyboard focus and a completed touch tap reveal exact bucket values', async t => {
  const page = await pageFor(t, refinementSnapshot(), 'Europe/Moscow', { hasTouch: true });
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const cell = datedCell(historySection(page, 'Daily'), '2026.10.26');
  await cell.focus();
  assert.match((await page.getByRole('tooltip').innerText()).replaceAll(',', ''), /2026\.10\.26[\s\S]*2000/,
    'Keyboard focus exposes exact source date and count');
  await period(page, '30 days').focus();
  await cell.tap();
  const tooltip = page.getByRole('tooltip');
  assert.equal(await tooltip.count(), 1, 'Exact-value feedback remains visible after the touch pointer has left');
  assert.match((await tooltip.innerText()).replaceAll(',', ''), /2026\.10\.26[\s\S]*2000/);
});

test('Electron touch sequence: exact bucket feedback survives touch completion without synthesized cell focus', async t => {
  const page = await pageFor(t, refinementSnapshot(), 'Europe/Moscow', { hasTouch: true });
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await period(page, '30 days').focus();
  const cell = datedCell(historySection(page, 'Daily'), '2026.10.26');
  assert.equal(await cell.count(), 1);
  await cell.evaluate(element => {
    const pointer = type => element.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true,
      bubbles: type !== 'pointerenter' && type !== 'pointerleave',
    }));
    const touch = new Touch({ identifier: 1, target: element });
    pointer('pointerenter');
    pointer('pointerdown');
    element.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch],
    }));
    pointer('pointerup');
    pointer('pointerleave');
    element.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, touches: [], targetTouches: [], changedTouches: [touch],
    }));
  });
  const tooltip = historySection(page, 'Daily').locator('[role="tooltip"]');
  assert.equal(await tooltip.isVisible(), true,
    'Observed Electron touch completion must leave exact-value feedback visible without a synthesized focus/click');
  assert.match((await tooltip.innerText()).replaceAll(',', ''), /2026\.10\.26[\s\S]*2000/);
});

const calendarDates = section => section.locator('.heatmap-grid [aria-label]').evaluateAll(nodes =>
  nodes.map(node => node.getAttribute('aria-label').match(/^\d{4}\.\d{2}\.\d{2}/)?.[0]).filter(Boolean));

async function calendarAt(t, now, next = refinementSnapshot(), contextOptions = {}) {
  const page = await pageFor(t, next, 'Europe/Moscow', contextOptions);
  await page.clock.setFixedTime(new Date(now));
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  return page;
}

test('calendar: default Year renders all 365 dates and labels unknown days without inventing zero', async t => {
  const page = await pageFor(t, refinementSnapshot());
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await period(page, 'Year').count(), 1, 'Year is an available common period');
  assert.equal(await period(page, 'Year').getAttribute('aria-pressed'), 'true', 'Year is the initial period');
  for (const title of ['Daily', 'Cumulative']) {
    const section = historySection(page, title);
    const dates = await calendarDates(section);
    assert.equal(new Set(dates).size, 365, `${title} exposes every selected calendar date, including unknown dates`);
    assert.equal(dates[0], '2025.10.28');
    assert.equal(dates.at(-1), '2026.10.27');
    assert.match(await section.innerText(), /2025\.10\.28\s*[–—-]\s*2026\.10\.27/, 'Visible range includes both years');
    const unknown = datedCell(section, '2025.10.28');
    assert.match(await unknown.getAttribute('aria-label'), /unknown|no value|not supplied/i);
    assert.doesNotMatch(await unknown.getAttribute('aria-label'), /\b0 tokens\b/);
    const zero = datedCell(historySection(page, 'Daily'), '2026.10.21');
    const background = cell => cell.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(await background(unknown), await background(zero), 'Unknown is visually distinct from real zero');
  }
});

test('calendar: Year includes leap day and uses inclusive local dates across the year boundary', async t => {
  const next = refinementSnapshot();
  next.analytics.daily = next.analytics.cumulative = [{ date: '2024-02-29', tokens: 17 }, { date: '2024-03-01', tokens: 19 }];
  const page = await calendarAt(t, '2024-03-01T00:30:00+03:00', next);
  for (const title of ['Daily', 'Cumulative']) {
    const dates = await calendarDates(historySection(page, title));
    assert.equal(dates.length, 365, 'Year is exactly 365 inclusive local calendar dates');
    assert.equal(dates[0], '2023.03.03');
    assert.equal(dates.at(-1), '2024.03.01');
    assert.equal(dates.filter(date => date === '2024.02.29').length, 1, 'Leap day appears exactly once');
  }
});

test('calendar: daily and cumulative month and weekday axes match actual week columns', async t => {
  const next = refinementSnapshot();
  const dates = ['2025-12-28', '2025-12-29', '2025-12-31', '2026-01-01', '2026-01-04', '2026-01-05', '2026-01-07', '2026-01-09', '2026-01-10'];
  next.analytics.daily = next.analytics.cumulative = dates.map(date => ({ date, tokens: 1 }));
  const page = await calendarAt(t, '2026-01-10T12:00:00+03:00', next, { viewport: { width: 1800, height: 900 } });
  await period(page, 'All').click();
  for (const title of ['Daily', 'Cumulative']) {
    const section = historySection(page, title);
    const heatmap = section.locator('.heatmap');
    const center = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
    for (const [day, date] of [['Mon', '2026.01.05'], ['Wed', '2026.01.07'], ['Fri', '2026.01.09']]) {
      const label = heatmap.getByText(day, { exact: true });
      assert.equal(await label.count(), 1, `${title} has visible ${day} row label`);
      const a = await center(label), b = await center(datedCell(section, date));
      assert.ok(Math.abs(a.y - b.y) <= 3 && a.x < b.x, `${day} aligns with the correct weekday row`);
    }
    const january = heatmap.getByText('Jan', { exact: true });
    assert.equal(await january.count(), 1, `${title} has a visible January label`);
    const monthBox = await january.boundingBox(), first = await datedCell(section, '2026.01.01').boundingBox();
    assert.ok(Math.abs(monthBox.x - first.x) <= first.width, 'January starts over the week containing January 1');
    assert.ok(monthBox.y + monthBox.height <= first.y, 'Month axis is above the cells');
    const sunday = await center(datedCell(section, '2026.01.04'));
    const saturday = await center(datedCell(section, '2026.01.10'));
    assert.ok(Math.abs(sunday.x - saturday.x) < 1, 'Sunday to Saturday share the same week column');
    assert.ok(sunday.y < saturday.y, 'Days progress down weekday rows');
  }
});

test('calendar: Weekly uses one row of exact week starts and visible months without daily apportionment', async t => {
  const page = await pageFor(t, refinementSnapshot(), 'Europe/Moscow', { viewport: { width: 1800, height: 900 } });
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await period(page, 'All').click();
  const section = historySection(page, 'Weekly');
  const rows = await section.locator('.heatmap-grid').evaluate(el =>
    [...el.children].map(child => { const box = child.getBoundingClientRect(); return Math.round(box.y + box.height / 2); }));
  assert.equal(new Set(rows).size, 1, 'All weekly cells and unknown weeks occupy one row');
  assert.equal(await datedCell(section, '2026.10.20').count(), 0, 'No invented daily buckets for a weekly total');
  assert.ok(await section.locator('.heatmap').getByText('Oct', { exact: true }).isVisible(), 'Weekly month axis is visible');
  await datedCell(section, '2026.10.26').focus();
  assert.match((await page.getByRole('tooltip').innerText()).replaceAll(',', ''), /2026\.10\.26[\s\S]*7000/);
});

test('calendar: narrow Year opens at latest dates with fixed weekday labels and scrolling months', async t => {
  const page = await pageFor(t, refinementSnapshot());
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const section = historySection(page, 'Daily');
  const scroll = section.locator('.heatmap-scroll');
  const metrics = await scroll.evaluate(el => ({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth }));
  assert.ok(metrics.max > 0 && Math.abs(metrics.left - metrics.max) <= 1, 'Initial scroll reveals latest dates at the right edge');
  const weekday = section.locator('.heatmap').getByText('Mon', { exact: true });
  const month = section.locator('.heatmap').getByText('Sep', { exact: true });
  const beforeDay = await weekday.boundingBox(), beforeMonth = await month.boundingBox();
  const beforeCell = await datedCell(section, '2026.10.26').boundingBox();
  await scroll.evaluate(el => { el.scrollLeft -= 72; });
  const afterDay = await weekday.boundingBox(), afterMonth = await month.boundingBox();
  const afterCell = await datedCell(section, '2026.10.26').boundingBox();
  assert.ok(Math.abs(afterDay.x - beforeDay.x) < 1, 'Weekday labels stay fixed at the left');
  assert.ok(Math.abs(afterCell.x - beforeCell.x - 72) < 1, 'Cells move with horizontal scroll');
  assert.ok(Math.abs(afterMonth.x - beforeMonth.x - 72) < 1, 'Months move in alignment with cells');
  assert.ok(await page.locator('#root').evaluate(el => el.scrollWidth <= innerWidth), 'Only matrix scrolls, not the report page');
  await page.setViewportSize({ width: 1800, height: 900 });
  assert.ok(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth), 'Wide panel fits the full Year');
});

test('calendar: 90 days filters all three histories and keeps selection through keyboard tabs and updates', async t => {
  const next = refinementSnapshot();
  next.analytics.daily.unshift({ date: '2026-07-29', tokens: 9 }, { date: '2026-07-30', tokens: 10 });
  next.analytics.cumulative.unshift({ date: '2026-07-29', tokens: 99 }, { date: '2026-07-30', tokens: 100 });
  next.analytics.weekly.unshift({ date: '2026-07-27', tokens: 90 }, { date: '2026-08-03', tokens: 100 });
  const page = await pageFor(t, next);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const button = period(page, '90 days');
  assert.equal(await button.count(), 1, '90-day control exists');
  await button.focus();
  await page.keyboard.press('Enter');
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await button.evaluate(el => el === document.activeElement), true);
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(await button.evaluate(el => el === document.activeElement), true);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  for (const title of ['Daily', 'Cumulative']) {
    const section = historySection(page, title);
    assert.equal(await datedCell(section, '2026.07.29').count(), 0);
    assert.equal(await datedCell(section, '2026.07.30').count(), 1);
    assert.equal((await calendarDates(section)).length, 90);
    assert.equal(await section.locator('svg .data-point').count(), title === 'Daily' ? 10 : 11, 'Chart uses the same period, preserving null gaps');
  }
  const weekly = historySection(page, 'Weekly');
  assert.equal(await datedCell(weekly, '2026.07.27').count(), 0);
  assert.equal(await datedCell(weekly, '2026.08.03').count(), 1);
  assert.equal(await weekly.locator('svg .data-point').count(), 5);
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(await period(page, 'Year').getAttribute('aria-pressed'), 'true');
});

test('calendar: user horizontal reading position survives live updates and tab return', async t => {
  const next = refinementSnapshot();
  next.analytics.daily.unshift({ date: '2026-01-01', tokens: 1 });
  const page = await pageFor(t, next);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await period(page, 'All').click();
  const scroll = historySection(page, 'Daily').locator('.heatmap-scroll');
  const chosen = await scroll.evaluate(el => {
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.min(120, max / 2);
    return el.scrollLeft;
  });
  assert.ok(chosen > 0, 'Fixture has enough history to choose a nonzero reading position');
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(Math.round(await scroll.evaluate(el => el.scrollLeft)), Math.round(chosen),
    'A background snapshot preserves the user-selected horizontal position');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  assert.equal(Math.round(await scroll.evaluate(el => el.scrollLeft)), Math.round(chosen),
    'Returning to Analytics preserves the user-selected horizontal position');
});

for (const boundary of [
  { period: '7 days', now: '2026-10-03T12:00:00+03:00', start: '2026-09-27' },
  { period: '30 days', now: '2026-10-28T12:00:00+03:00', start: '2026-09-29' },
  { period: 'Year', now: '2027-09-29T12:00:00+03:00', start: '2026-09-30' },
]) {
  test(`calendar month boundary: ${boundary.period} keeps both months readable when they share the first week`, async t => {
    const next = refinementSnapshot();
    next.analytics.daily = next.analytics.cumulative = [
      { date: boundary.start, tokens: 1 }, { date: '2026-10-01', tokens: 2 },
    ];
    const page = await calendarAt(t, boundary.now, next, { viewport: { width: 320, height: 900 } });
    await period(page, boundary.period).click();
    for (const title of ['Daily', 'Cumulative']) {
      const section = historySection(page, title);
      await section.locator('.heatmap-scroll').evaluate(el => { el.scrollLeft = 0; });
      const geometry = await section.locator('.heatmap-months').evaluate(axis => {
        const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const labels = [];
        const walker = document.createTreeWalker(axis, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          for (const match of node.textContent.matchAll(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/g)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            labels.push({ name: match[0], ...rect(range) });
          }
        }
        return { labels, viewport: rect(axis.closest('.heatmap-scroll')), grid: rect(axis.parentElement.querySelector('.heatmap-grid')) };
      });
      const firstWeekLabels = geometry.labels.filter(label => label.x < geometry.grid.x + 48);
      for (const name of ['Sep', 'Oct']) {
        const label = firstWeekLabels.find(candidate => candidate.name === name);
        assert.ok(label, `${title} ${boundary.period}: ${name} is readable above the first week, not overwritten by the other month`);
        assert.ok(label.width > 0 && label.height > 0 && label.x >= geometry.viewport.x && label.right <= geometry.viewport.right,
          `${name} is not clipped in a 320px pane`);
        assert.ok(label.bottom <= geometry.grid.y, `${name} does not overlap calendar cells`);
      }
      for (let i = 0; i < geometry.labels.length; i++) {
        for (const other of geometry.labels.slice(i + 1)) {
          const label = geometry.labels[i];
          const overlapWidth = Math.min(label.right, other.right) - Math.max(label.x, other.x);
          const overlapHeight = Math.min(label.bottom, other.bottom) - Math.max(label.y, other.y);
          assert.ok(overlapWidth <= 0.5 || overlapHeight <= 0.5,
            `${title} month names ${label.name}/${other.name} remain readable without overlapping`);
        }
      }
    }
  });
}
