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
    lines: ['Plan: plus', 'Credits: 12.50', 'Earned resets: 2 · applicable: 0'],
    windows: [{ label: '7 days', usedPercent: 25, leftPercent: 75, resetAt: 1793725200 }],
    updatedAt: timestamp, stale: false, error: null,
  },
  analytics: {
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

async function pageFor(t) {
  const page = await browser.newPage({ viewport: { width: 440, height: 900 } });
  t.after(() => page.close());
  await page.goto(url);
  await page.waitForFunction(() => window.probe?.ready);
  assert.equal(await page.evaluate(() => window.probe.error), null, 'Declared frontend loads without runtime errors');
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

test('Analytics tab shows all dated series as actual charts and tables using keyboard access', async t => {
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
  assert.ok(await page.getByRole('table').count() >= 1, 'History also has accessible tabular values');
  for (const value of ['2026-10-25', '2026-10-26', '2026-10-19', '3456', '4456', '8000']) {
    assert.ok(text.includes(value), `Every supplied history value ${value} appears`);
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
    next.analytics.lines = ['Lifetime tokens: 654321'];
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
