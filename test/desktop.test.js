import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { harness, root, timestamp, plugins, skills, resetCredits, resetHistory, tokenUsage } from './helpers.js';

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

const historySnapshot = () => ({ ...structuredClone(snapshot), history: {
  startDate: '2026-10-21', endDate: '2026-10-27', units: 'percent', dataAsOf: null,
  updatedAt: timestamp, stale: false, error: null,
  data: [{ date: '2026-10-26', attribution: [
    { thread_source: 'user', turn_trigger: 'composer', model: 'gpt-6.1-sol', surface: 'cli', value: 3 },
    { thread_source: 'subagent', turn_trigger: 'automation_cron_scheduled', model: 'gpt-6-luna', surface: 'web', value: 2 },
    { thread_source: 'thread_title', turn_trigger: 'composer_queue', model: 'gpt-6-luna', surface: 'cli', value: 0 },
    { thread_source: 'thread_title_reconsideration', turn_trigger: 'automation_heartbeat_scheduled', model: 'gpt-6-luna', surface: 'cli', value: 1 },
    { thread_source: 'aeon_child', turn_trigger: 'user', model: 'gpt-6.1-sol', surface: 'cli', value: 4 },
  ] }, { date: '2026-10-24', attribution: [
    { thread_source: 'thread_title', turn_trigger: 'composer_queue', model: 'gpt-6-luna', surface: 'cli', value: 0.00001 },
  ] }, { date: '2026-10-27', attribution: [
    { thread_source: 'user', turn_trigger: 'composer', model: 'gpt-6.1-sol', surface: 'cli', value: 0 },
  ] }],
} });
async function historyRegion(page) {
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const region = page.getByRole('region', { name: 'Usage history', exact: true });
  assert.equal(await region.count(), 1, 'Analytics exposes its new Usage history chart as a labelled region');
  return region;
}

const messagesSnapshot = () => ({ ...historySnapshot(), messages: {
  startDate: '2026-10-21', endDate: '2026-10-27', dataAsOf: null, updatedAt: timestamp, stale: false, error: null,
  data: [
    { date: '2026-10-25', totals: { turns: 4 }, models: [{ model: 'gpt-6.1-sol', turns: 3 }, { model: 'gpt-6-luna', turns: 1 }], clients: [{ client_id: 'CODEX_CLI', turns: 4 }] },
    { date: '2026-10-26', totals: { turns: 10 }, models: [{ model: 'gpt-6.1-sol', turns: 4 }, { model: 'gpt-6-luna', turns: 2 }, { model: 'codex-auto-review', turns: 1 }, { model: 'other', turns: 1 }],
      clients: [{ client_id: 'CODEX_DESKTOP_APP', turns: 2 }, { client_id: 'CODEX_WORK_DESKTOP', turns: 1 }, { client_id: 'CODEX_CLI', turns: 2 }, { client_id: 'CODEX_IDE_VSCODE', turns: 1 }, { client_id: 'CODEX_WEB', turns: 1 }, { client_id: 'CODEX_WORK_WEB', turns: 1 }, { client_id: 'CODEX_WORK_MOBILE', turns: 1 }, { client_id: 'CODEX_GITHUB', turns: 1 }] },
    { date: '2026-10-27', totals: { turns: 0 }, models: [{ model: 'gpt-6.1-sol', turns: 0 }], clients: [{ client_id: 'CODEX_CLI', turns: 0 }] },
  ],
} });
async function messagesRegion(page) {
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const region = page.getByRole('region', { name: 'Messages', exact: true });
  assert.equal(await region.count(), 1, 'Analytics exposes an independent labelled Messages region');
  return region;
}

const toolsSnapshot = () => ({ ...messagesSnapshot(), plugins: {
  startDate: '2026-09-28', endDate: '2026-10-27', data: structuredClone(plugins.data), dataAsOf: Date.parse(plugins.data_freshness_ts), updatedAt: timestamp, stale: false, error: null,
}, skills: {
  startDate: '2026-09-28', endDate: '2026-10-27', data: structuredClone(skills.data), dataAsOf: Date.parse(skills.data_freshness_ts), updatedAt: timestamp, stale: false, error: null,
} });
async function toolsRegions(page) {
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const plugins = page.getByRole('region', { name: 'Plugins', exact: true });
  const skills = page.getByRole('region', { name: 'Skills', exact: true });
  assert.equal(await plugins.count(), 1, 'Analytics exposes a labelled Plugins card');
  assert.equal(await skills.count(), 1, 'Analytics exposes a separate labelled Skills card');
  return { plugins, skills };
}

const resetsSnapshot = () => ({ ...toolsSnapshot(), resetCredits: {
  credits: resetCredits.credits.map(credit => ({ ...credit, granted_at: Date.parse(credit.granted_at), expires_at: Date.parse(credit.expires_at) })),
  available_count: 5, total_earned_count: 9, dataAsOf: null, updatedAt: timestamp, stale: false, error: null,
}, resetHistory: {
  events: resetHistory.events.map(event => ({ ...event, occurred_at: Date.parse(event.occurred_at) })),
  window_start: Date.parse(resetHistory.window_start), dataAsOf: Date.parse(resetHistory.as_of), updatedAt: timestamp, stale: false, error: null,
} });
async function resetsRegion(page) {
  const region = page.getByRole('region', { name: 'Usage limit resets', exact: true });
  assert.equal(await region.count(), 1, 'Overview exposes its inline Usage limit resets card');
  return region;
}

const tokensSnapshot = () => { const next = resetsSnapshot(); next.messages.data = structuredClone(tokenUsage.data); return next; };
const exactTokenText = text => text.replace(/[,\u00a0\u202f]/g, '');
async function tokensRegion(page) {
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const region = page.getByRole('region', { name: 'Token breakdown', exact: true });
  assert.equal(await region.count(), 1, 'Analytics exposes Token breakdown from its existing Messages source');
  return region;
}

test('polish: percent history has fixed quarter ticks while credits and exact source amounts remain independent', async t => {
  const next = historySnapshot();
  next.history.units = 'credits';
  next.history.data = [{ date: '2026-10-26', attribution: [{ thread_source: 'user', value: 240 }] }];
  const page = await pageFor(t, next);
  const region = await historyRegion(page);
  const axis = () => region.locator('svg text[text-anchor="end"]').allTextContents();
  assert.ok((await axis()).includes('240'), 'Credits retain their source-dependent scale above 100');
  await region.getByRole('button', { name: /2026\.10\.26/ }).focus();
  assert.match(await region.getByRole('tooltip').innerText(), /240 credits/);
  next.history.units = 'percent';
  for (const value of [99.99999, 10]) {
    next.history.data[0].attribution[0].value = value;
    await page.evaluate(state => window.probe.publish(state), next);
    assert.deepEqual(await axis(), ['0%', '25%', '50%', '75%', '100%'], 'Percent scale stays fixed with readable quarter ticks regardless of the daily maximum');
    await region.getByRole('button', { name: /2026\.10\.26/ }).focus();
    assert.match(await region.getByRole('tooltip').innerText(), new RegExp(`${String(value).replace('.', '\\.')}%`), 'Axis formatting never changes the actual usage amount');
  }
});

test('polish: summed percent history above 100 stays bounded and visibly marks overflow without losing source amounts', async t => {
  const next = historySnapshot();
  next.history.data = [{ date: '2026-10-26', attribution: [
    { thread_source: 'user', value: 80 }, { thread_source: 'subagent', value: 70 },
  ] }];
  const page = await pageFor(t, next);
  const region = await historyRegion(page);
  const chart = region.locator('svg.usage-chart');
  assert.deepEqual(await chart.locator('text[text-anchor="end"]').allTextContents(), ['0%', '25%', '50%', '75%', '100%']);
  const marked = await region.evaluate(node => [...node.querySelectorAll('*')].some(item => {
    if (item.closest('title, [role="tooltip"], .usage-day-details')) return false;
    const ownText = [...item.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join('');
    const overflow = /exceed|overflow|above\s*100|over\s*100|>\s*100/i;
    const visibleMarker = ownText.trim() || ['path', 'polygon', 'polyline', 'line', 'circle', 'use'].includes(item.localName);
    const described = overflow.test(ownText) || (visibleMarker && overflow.test(item.getAttribute('aria-label') ?? ''));
    const box = item.getBoundingClientRect();
    const style = getComputedStyle(item);
    return described && box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
  }));
  const geometry = await chart.evaluate(svg => {
    const ticks = [...svg.querySelectorAll('line')].filter(line => line.getAttribute('y1') === line.getAttribute('y2')).map(line => Number(line.getAttribute('y1')));
    const bars = [...svg.querySelectorAll('[role="button"] rect')].filter(rect => rect.getAttribute('fill') !== 'transparent').map(rect => { const box = rect.getBBox(); return { top: box.y, bottom: box.y + box.height }; });
    return { top: Math.min(...ticks), bottom: Math.max(...ticks), bars };
  });
  assert.ok(geometry.bars.length >= 2, 'Both supplied attribution groups are represented');
  await region.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  const details = await region.getByRole('region', { name: 'Day details', exact: true }).innerText();
  assert.match(details, /2026\.10\.26[^\n]*150%/, 'Summed source total remains exact above the fixed axis');
  assert.match(details, /Chats:\s*80%/);
  assert.match(details, /Subagents:\s*70%/);
  const failures = [];
  if (!marked) failures.push('The affected day has no visible overflow notice or labelled marker before opening details');
  if (!geometry.bars.every(bar => bar.top >= geometry.top - .01 && bar.bottom <= geometry.bottom + .01)) failures.push(`Stacked bar escapes the fixed 0–100 plot: ${JSON.stringify(geometry)}`);
  assert.deepEqual(failures, [], 'Above-axis usage must be bounded and clearly marked rather than silently clipped');
});

test('polish: both chart period segments have equal widths and at least 40px targets at narrow sizes', async t => {
  const failures = [];
  for (const width of [439, 320]) {
    const page = await pageFor(t, messagesSnapshot(), 'Europe/Moscow', { viewport: { width, height: 900 } });
    await historyRegion(page);
    for (const title of ['Usage history', 'Messages']) {
      const region = page.getByRole('region', { name: title, exact: true });
      const [seven, thirty] = await Promise.all(['7 days', '30 days'].map(name => region.getByRole('button', { name, exact: true }).boundingBox()));
      assert.ok(seven && thirty, `${width}px ${title}: both period segments are visible`);
      if (seven.width < 40 || thirty.width < 40 || Math.abs(seven.width - thirty.width) > 1) failures.push(`${width}px ${title}: period widths ${seven.width}/${thirty.width}; expected equal widths >=40px`);
      assert.ok(seven.height >= 40 && thirty.height >= 40, 'Existing period target heights remain at least 40px');
    }
  }
  assert.deepEqual(failures, [], 'Period segments remain uniform and easy to target at both narrow report widths');
});

for (const width of [439, 320]) test(`polish: History and Messages controls have aligned period/group and separate compact date navigation at ${width}px`, async t => {
  const page = await pageFor(t, messagesSnapshot(), 'Europe/Moscow', { viewport: { width, height: 900 } });
  await historyRegion(page);
  const failures = [];
  for (const title of ['Usage history', 'Messages']) {
    const region = page.getByRole('region', { name: title, exact: true });
    const seven = region.getByRole('button', { name: '7 days', exact: true });
    const thirty = region.getByRole('button', { name: '30 days', exact: true });
    const grouping = region.getByRole('combobox', { name: 'Group by', exact: true });
    const previous = region.getByRole('button', { name: 'Previous', exact: true });
    const next = region.getByRole('button', { name: 'Next', exact: true });
    const range = region.getByText('2026.10.21 – 2026.10.27', { exact: true });
    const [a, b, g, p, n, r] = await Promise.all([seven, thirty, grouping, previous, next, range].map(control => control.boundingBox()));
    assert.ok([a, b, g, p, n, r].every(Boolean), `${title} has visible date and toolbar controls`);
    for (const [condition, message] of [
      [Math.abs(a.y - b.y) <= 1 && Math.abs(a.y - g.y) <= 1, 'period buttons and grouping share one row'],
      [Math.abs(a.height - g.height) <= 1 && [a, b, g, p, n].every(box => box.height >= 40), 'equal toolbar height and existing 40px targets'],
      [b.x - (a.x + a.width) <= 2 && g.x >= b.x + b.width, 'period segments stay together left and grouping follows right'],
      [p.y >= a.y + a.height && Math.abs(p.y - n.y) <= 1 && Math.abs(r.y + r.height / 2 - (p.y + p.height / 2)) <= 2 && r.x + r.width <= p.x, 'date and previous/next occupy their own aligned row'],
      [p.width <= 44 && n.width <= 44, 'labelled navigation uses compact icon targets'],
    ]) if (!condition) failures.push(`${title}: ${message}`);
    await previous.focus();
    await page.keyboard.press('Tab');
    assert.ok(await region.evaluate(node => node.contains(document.activeElement) && getComputedStyle(document.activeElement).outlineStyle !== 'none'), `${title}: keyboard navigation retains a visible focus indicator`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Narrow report has no horizontal page overflow');
  assert.deepEqual(failures, [], 'Both chart toolbars remain compact and organized at this panel width');
});

test('polish: selections preserve the outer report position and focused card across all Analytics readers', async t => {
  const page = await pageFor(t, tokensSnapshot(), 'Europe/Moscow', { viewport: { width: 439, height: 400 } });
  await historyRegion(page);
  const failures = [];
  for (const [title, label, option] of [
    ['Usage history', 'Group by', 'By model'], ['Usage history', 'Day details', '2026.10.26'],
    ['Messages', 'Group by', 'By surface'], ['Messages', 'Day details', '2026.10.26'],
    ['Token breakdown', 'Day details', '2026.10.26'], ['Plugins', 'Day details', '2026.10.26'], ['Skills', 'Day details', '2026.10.26'],
  ]) {
    const control = page.getByRole('region', { name: title, exact: true }).getByRole('combobox', { name: label, exact: true });
    await control.focus();
    assert.ok(await control.evaluate(node => node === document.activeElement), `${title}/${label} has actual native-select focus before changing`);
    await control.evaluate(node => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 32));
    const before = await page.evaluate(() => window.scrollY);
    assert.ok(before > 0, `${title}/${label} starts at a real nonzero outer reading position`);
    const index = await control.locator('option').evaluateAll((nodes, label) => nodes.findIndex(node => node.textContent === label), option);
    assert.ok(index >= 0, 'Requested option is supplied by the source fixture');
    await page.keyboard.press('Home');
    for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => window.scrollY);
    const box = await control.boundingBox();
    if (Math.abs(after - before) > 2 || !box || box.y < 0 || box.y + box.height > 400) failures.push(`${title}/${label}: outer scroll ${before} -> ${after}, control y=${box?.y}`);
    assert.ok(await control.evaluate(node => node === document.activeElement), `${title}/${label} focus survives rerender`);
    assert.equal(await control.locator('option:checked').innerText(), option, 'The selected value is actually rendered');
  }
  assert.deepEqual(failures, [], 'Changing an inline select preserves its outer report reading position and visible control');
});

test('polish: late snapshots and range updates preserve a selected lower card outer reading position', async t => {
  const page = await pageFor(t, tokensSnapshot(), 'Europe/Moscow', { viewport: { width: 439, height: 400 } });
  const region = await tokensRegion(page);
  const day = region.getByRole('combobox', { name: 'Day details', exact: true });
  await day.selectOption({ label: '2026.10.26' });
  await day.focus();
  await day.evaluate(node => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 32));
  const before = await page.evaluate(() => window.scrollY);
  assert.ok(before > 0, 'Selected lower card starts below the top of the long report');
  await page.evaluate(() => {
    const next = window.probe.snapshot();
    next.messages.updatedAt += 60000;
    next.messages.data[0].totals.text_total_tokens = 9000012;
    window.probe.publish(next);
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.match(exactTokenText(await region.innerText()), /9000012/, 'Late source values are rendered');
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before) <= 2, 'Late snapshot preserves the outer document position after a select');
  assert.ok(await day.evaluate(node => node === document.activeElement), 'Late snapshot restores selected-reader focus');
  const messages = page.getByRole('region', { name: 'Messages', exact: true });
  const previous = messages.getByRole('button', { name: 'Previous', exact: true });
  await previous.focus();
  await previous.evaluate(node => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 32));
  const rangeBefore = await page.evaluate(() => window.scrollY);
  await previous.click();
  assert.match(await messages.innerText(), /2026\.10\.14[\s\S]*2026\.10\.20/);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - rangeBefore) <= 2, 'Range completion preserves the report position through loading and live source rerenders');
});

test('tokens: four daily series keep large axes readable and exact totals/client details independent with mismatch qualification', async t => {
  const page = await pageFor(t, tokensSnapshot(), 'Europe/Moscow', { viewport: { width: 320, height: 900 } });
  const region = await tokensRegion(page);
  const headings = await page.getByRole('tabpanel', { name: 'Analytics', exact: true }).getByRole('heading').allTextContents();
  assert.ok(headings.indexOf('Messages') < headings.indexOf('Token breakdown'));
  assert.ok(headings.indexOf('Token breakdown') < headings.indexOf('Plugins'));
  assert.match(await region.innerText(), /(?:shared|same|follows)[^\n]*Messages|Messages[^\n]*(?:shared|same|period)/i);
  const text = exactTokenText(await region.innerText());
  for (const [label, count] of [['Uncached input', 1000001], ['Cached input', 2000002], ['Output', 7], ['Reported total', 9000009]]) assert.match(text, new RegExp(`${label}\\s*:?\\s*${count}\\b`, 'i'), 'Known selected-window values remain exact rather than K/M rounded');
  assert.match(text, /known subtotal|known.*selected|selected.*known/i);
  assert.match(text, /differ|discrepan|inconsistent|do not match|does not match/i, 'Independent reported total is preserved and qualified');
  const chart = region.locator('svg.usage-chart');
  assert.equal(await chart.count(), 1);
  assert.equal(await chart.locator('path, polyline').count(), 4, 'Three components and reported total are distinct series');
  assert.match(await chart.textContent(), /10\.26/);
  const yLabels = chart.locator('text[x="30"][text-anchor="end"]');
  const boxes = await yLabels.evaluateAll(nodes => nodes.map(node => { const box = node.getBBox(); return { text: node.textContent, x: box.x, y: box.y, width: box.width, height: box.height }; }));
  assert.ok(boxes.length >= 2 && boxes.some(box => /[KM]/i.test(box.text)), 'Million-token axes use readable compact units');
  assert.ok(boxes.every(box => box.x >= 0 && box.x + box.width <= 360), 'Large axis labels stay inside the chart');
  boxes.sort((first, second) => first.y - second.y);
  assert.ok(boxes.every((box, index) => index === 0 || boxes[index - 1].y + boxes[index - 1].height <= box.y), 'Count-axis labels do not overlap');
  await region.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  const detail = region.getByRole('region', { name: 'Day details', exact: true });
  assert.match(exactTokenText(await detail.innerText()), /Reported total\s*:?\s*9000009\b/i);
  const clients = detail.getByRole('table');
  assert.equal(await clients.count(), 1, 'Exact day detail contains the supplied per-client token measures');
  const rows = await clients.getByRole('row').allInnerTexts();
  const cli = exactTokenText(rows.find(row => /CLI/.test(row)) ?? '');
  assert.match(cli, /1000001/);
  assert.match(cli, /1000010/);
  assert.match(cli, /\b0\b/);
  assert.match(cli, /\b9\b/);
  const web = exactTokenText(rows.find(row => /Web/.test(row)) ?? '');
  assert.match(web, /unknown|missing|unavailable|—/i, 'Null client cache count is not coerced to zero');
  assert.match(web, /500/);
  assert.doesNotMatch(await region.innerText(), /By model|gpt-6\.1-sol|Other tokens|residual/i);
});

test('tokens: token-known days remain inspectable when turns are unknown and null/missing/zero/stale states stay distinct', async t => {
  const next = tokensSnapshot();
  next.messages.data.unshift(
    { date: '2026-10-24', totals: { turns: null, uncached_text_input_tokens: null, cached_text_input_tokens: null, text_output_tokens: null, text_total_tokens: null }, clients: [], models: [] },
    { date: '2026-10-25', totals: { turns: null, uncached_text_input_tokens: 0, cached_text_input_tokens: null, text_output_tokens: 0, text_total_tokens: 0 }, clients: [], models: [] },
  );
  const page = await pageFor(t, next);
  const region = await tokensRegion(page);
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  assert.equal(await days.evaluate(node => node.tagName), 'SELECT');
  const box = await days.boundingBox();
  assert.ok(box && box.height >= 40 && box.width >= 24);
  const options = await days.locator('option').allTextContents();
  assert.ok(options.some(label => label.includes('2026.10.25')), 'Known zero token day is independent of unknown message turns');
  assert.ok(!options.some(label => /2026\.10\.24|2026\.10\.27/.test(label)), 'Unknown and absent token days are not zero details');
  await days.selectOption({ label: '2026.10.25' });
  const detail = region.getByRole('region', { name: 'Day details', exact: true });
  assert.match(await detail.innerText(), /Uncached input\s*:?\s*0\b/i);
  assert.match(await detail.innerText(), /Cached input\s*:?\s*(?:unknown|missing|unavailable|—)/i);
  assert.match(await region.innerText(), /partial|incomplete|missing/i);
  assert.match(await region.innerText(), /data as of[^\n]*unknown/i);
  assert.equal(await page.getByRole('region', { name: 'Messages', exact: true }).getByRole('combobox', { name: 'Day details', exact: true }).locator('option', { hasText: '2026.10.25' }).count(), 0);
  next.messages = { ...next.messages, stale: true, error: 'Messages unavailable' };
  await page.evaluate(state => window.probe.publish(state), next);
  for (const card of [region, page.getByRole('region', { name: 'Messages', exact: true })]) {
    assert.match(await card.innerText(), /stale/i);
    assert.match(await card.innerText(), /unavailable/i);
  }
  assert.match(await detail.innerText(), /Uncached input\s*:?\s*0\b/i);
  next.messages = { ...next.messages, stale: false, error: null, data: [] };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /no[^\n]*(?:token|data)|empty/i);
  assert.equal(await page.getByRole('heading', { name: 'Daily', exact: true }).count(), 1, 'Existing lifetime token calendars remain independent');
});

test('tokens: shared Messages range uses one request and preserves independent day/filter/focus state through updates, tabs and remount', async t => {
  const next = tokensSnapshot();
  const page = await pageFor(t, next);
  let region = await tokensRegion(page);
  const messages = page.getByRole('region', { name: 'Messages', exact: true });
  const history = page.getByRole('region', { name: 'Usage history', exact: true });
  await history.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By model' });
  await history.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  assert.equal(await region.getByRole('button', { name: /^(?:7 days|30 days|Previous|Next)$/ }).count(), 0, 'Messages alone owns the shared date controls');
  const scroll = page.locator('.heatmap-scroll').first();
  await scroll.evaluate(node => { node.scrollLeft = 31; });
  const readingPosition = await scroll.evaluate(node => node.scrollLeft);
  await messages.getByRole('button', { name: '30 days', exact: true }).click();
  assert.equal(await page.evaluate(() => window.probe.messagesCalls.length), 1);
  assert.deepEqual(await page.evaluate(() => window.probe.messagesCalls.at(-1)), { startDate: '2026-09-28', endDate: '2026-10-27' });
  assert.match(await region.innerText(), /2026\.09\.28[\s\S]*2026\.10\.27/);
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  await days.selectOption({ label: '2026.10.26' });
  await messages.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By surface' });
  assert.match(exactTokenText(await region.getByRole('region', { name: 'Day details', exact: true }).innerText()), /9000009/);
  next.messages = { ...next.messages, startDate: '2026-09-28' };
  await page.evaluate(state => window.probe.publish(state), next);
  await days.focus();
  await page.evaluate(() => window.probe.tickInterval(60000));
  assert.equal(await days.evaluate(node => node === document.activeElement), true);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  region = await tokensRegion(page);
  assert.match(await region.getByRole('region', { name: 'Day details', exact: true }).innerText(), /2026\.10\.26/);
  assert.equal(await history.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By model');
  assert.match(await history.getByRole('region', { name: 'Day details', exact: true }).innerText(), /2026\.10\.26/);
  assert.equal(await scroll.evaluate(node => node.scrollLeft), readingPosition);
  assert.equal(await page.getByRole('group', { name: 'History period', exact: true }).getByRole('button', { name: 'Year', exact: true }).getAttribute('aria-pressed'), 'true');
  await messages.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.equal(await region.getByRole('region', { name: 'Day details', exact: true }).count(), 0, 'Shared range changes clear an invalid token-day selection');
  await messages.getByRole('button', { name: '7 days', exact: true }).click();
  assert.equal(await page.evaluate(() => window.probe.messagesCalls.length), 3);
  assert.deepEqual(await page.evaluate(() => [window.probe.historyCalls.length, window.probe.pluginsCalls.length, window.probe.skillsCalls.length]), [0, 0, 0]);
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  region = await tokensRegion(page);
  assert.match(await region.innerText(), /2026\.10\.21[\s\S]*2026\.10\.27/);
  assert.equal(await region.getByRole('region', { name: 'Day details', exact: true }).count(), 0);
});

test('tokens: client-table horizontal reading position survives same-day live updates and outer-tab return', async t => {
  const next = tokensSnapshot();
  const page = await pageFor(t, next, 'Europe/Moscow', { viewport: { width: 320, height: 900 } });
  let region = await tokensRegion(page);
  await region.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  const clients = region.getByRole('group', { name: 'Client token counts', exact: true });
  const dimensions = await clients.evaluate(node => ({ width: node.clientWidth, content: node.scrollWidth }));
  assert.ok(dimensions.content > dimensions.width, 'Narrow client table actually overflows horizontally');
  await clients.evaluate(node => { node.scrollLeft = node.scrollWidth - node.clientWidth; });
  const readingPosition = await clients.evaluate(node => node.scrollLeft);
  assert.ok(readingPosition > 0, 'Regression begins with a real nonzero position reading rightmost token columns');
  next.messages.updatedAt = timestamp + 60000;
  next.messages.data[0].clients[0].text_output_tokens = 12;
  next.messages.data[0].clients[0].text_total_tokens = 1000013;
  next.messages.data[0].totals.text_output_tokens = 10;
  next.messages.data[0].totals.text_total_tokens = 9000012;
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(await region.getByRole('combobox', { name: 'Day details', exact: true }).locator('option:checked').innerText(), '2026.10.26');
  const cli = clients.getByRole('row', { name: /^CLI\b/ });
  assert.match(exactTokenText(await cli.innerText()), /\b12\b/);
  assert.match(exactTokenText(await cli.innerText()), /\b1000013\b/, 'Same-day new source values are actually rendered');
  assert.equal(await clients.evaluate(node => node.scrollLeft), readingPosition, 'Live replacement preserves the client-table horizontal reading position');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  region = await tokensRegion(page);
  assert.equal(await region.getByRole('combobox', { name: 'Day details', exact: true }).locator('option:checked').innerText(), '2026.10.26');
  assert.equal(await region.getByRole('group', { name: 'Client token counts', exact: true }).evaluate(node => node.scrollLeft), readingPosition, 'Returning to the same selected token day preserves its reading position');
});

const countdownNow = Date.parse('2026-10-27T00:30:00+03:00');
const quotaCard = (page, label) => page.locator('section.quota').filter({ has: page.getByRole('heading', { name: label, exact: true }) });

test('countdown: minute presentation updates every finite quota beside exact dates, marks due safely, and never refreshes source data', async t => {
  const next = resetsSnapshot();
  next.overview.windows = [
    { label: 'Primary future', usedPercent: 25, leftPercent: 75, resetAt: (countdownNow + 2 * 3600000) / 1000 },
    { label: 'Review future', usedPercent: 10, leftPercent: 90, resetAt: (countdownNow + 4 * 3600000) / 1000 },
    { label: 'Already due', usedPercent: 35, leftPercent: 65, resetAt: countdownNow / 1000 },
    { label: 'No timestamp', usedPercent: 20, leftPercent: 80, resetAt: null },
  ];
  const page = await pageFor(t, next);
  await page.clock.setFixedTime(new Date(countdownNow));
  await page.evaluate(state => window.probe.publish(state), next);
  const primary = quotaCard(page, 'Primary future');
  assert.match(await primary.innerText(), /2026\.10\.27 02:30/);
  assert.match(await primary.innerText(), /\b2\s*h(?:ours?)?\b/i, 'Future quotas show a human remaining duration');
  assert.match(await quotaCard(page, 'Review future').innerText(), /\b4\s*h(?:ours?)?\b/i);
  assert.match(await quotaCard(page, 'Already due').innerText(), /Reset due/i);
  assert.doesNotMatch(await quotaCard(page, 'No timestamp').innerText(), /Reset|due|unknown|unavailable/i);
  assert.deepEqual(await page.evaluate(() => [...window.probe.timerIntervals.values()].sort((a, b) => a - b)), [60000, 180000], 'Presentation and HTTP refresh own separate bounded intervals');
  const before = await primary.innerText();
  const source = await page.evaluate(() => window.probe.snapshot());
  const calls = await page.evaluate(() => window.probe.calls);
  await page.clock.setFixedTime(new Date(countdownNow + 60000));
  await page.evaluate(() => window.probe.tickInterval(60000));
  assert.notEqual(await primary.innerText(), before, 'Minute presentation changes visible remaining time');
  assert.match(await primary.innerText(), /(?:1\s*h(?:ours?)?[\s,·]*59\s*m(?:inutes?)?|119\s*m(?:inutes?)?)/i);
  assert.match(await primary.innerText(), /2026\.10\.27 02:30/, 'Absolute date remains unchanged');
  await page.clock.setFixedTime(new Date(countdownNow + 2 * 3600000));
  await page.evaluate(() => window.probe.tickInterval(60000));
  assert.match(await primary.innerText(), /Reset due/i);
  assert.match(await primary.innerText(), /Used 25%/);
  assert.match(await primary.innerText(), /Left 75%/, 'Due time does not claim restored quota');
  assert.match(await quotaCard(page, 'Review future').innerText(), /\b2\s*h(?:ours?)?\b/i);
  assert.equal(await page.evaluate(() => window.probe.calls), calls, 'Minute ticks dispatch no source refresh');
  assert.deepEqual(await page.evaluate(() => window.probe.snapshot()), source, 'Presentation never changes source timestamps, freshness, data or errors');
});

test('countdown: minute ticks preserve reset/history reading focus and use the current snapshot, then stop completely on close/abort', async t => {
  const next = resetsSnapshot();
  next.overview.windows = [{ label: 'Account A quota', usedPercent: 25, leftPercent: 75, resetAt: (countdownNow + 2 * 60000) / 1000 }];
  const page = await pageFor(t, next);
  await page.clock.setFixedTime(new Date(countdownNow));
  assert.equal(await page.evaluate(() => [...window.probe.timerIntervals.values()].filter(ms => ms === 60000).length), 1, 'One minute presentation timer is mounted');
  const resets = await resetsRegion(page);
  await resets.getByRole('tab', { name: 'History', exact: true }).click();
  const panel = resets.getByRole('tabpanel', { name: 'History', exact: true });
  await panel.focus();
  assert.equal(await panel.evaluate(node => node === document.activeElement), true);
  await page.clock.setFixedTime(new Date(countdownNow + 60000));
  await page.evaluate(() => window.probe.tickInterval(60000));
  assert.equal(await panel.evaluate(node => node === document.activeElement), true, 'Minute text updates preserve the reading panel');
  assert.equal(await resets.getByRole('tab', { name: 'History', exact: true }).getAttribute('aria-selected'), 'true');
  const history = await historyRegion(page);
  await history.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  const grouping = history.getByRole('combobox', { name: 'Group by', exact: true });
  await grouping.selectOption({ label: 'By model' });
  await grouping.focus();
  await page.clock.setFixedTime(new Date(countdownNow + 2 * 60000));
  await page.evaluate(() => window.probe.tickInterval(60000));
  assert.equal(await grouping.evaluate(node => node === document.activeElement), true);
  assert.equal(await grouping.locator('option:checked').innerText(), 'By model');
  assert.match(await history.getByRole('region', { name: 'Day details', exact: true }).innerText(), /2026\.10\.26/);
  next.overview.windows = [{ label: 'Account B quota', usedPercent: 40, leftPercent: 60, resetAt: (countdownNow + 60000) / 1000 }];
  await page.evaluate(state => window.probe.publish(state), next);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.evaluate(() => window.probe.tickInterval(60000));
  assert.match(await quotaCard(page, 'Account B quota').innerText(), /Reset due/i, 'Countdown derives from current verified snapshot rather than captured account A windows');
  assert.equal(await quotaCard(page, 'Account A quota').count(), 0);
  assert.equal(await resets.getByRole('tab', { name: 'History', exact: true }).getAttribute('aria-selected'), 'true');
  const calls = await page.evaluate(() => window.probe.calls);
  await page.evaluate(async () => { window.probe.close(); await window.probe.tickInterval(60000); });
  assert.equal(await page.evaluate(() => window.probe.timers.size), 0);
  assert.equal(await page.locator('#root').innerText(), '');
  assert.equal(await page.evaluate(() => window.probe.calls), calls);
  await page.evaluate(async () => { await window.probe.mount(); window.probe.abort(); await window.probe.tickInterval(60000); });
  assert.equal(await page.evaluate(() => window.probe.timers.size), 0);
  assert.equal(await page.locator('#root').innerText(), '');
  assert.equal(await page.evaluate(() => window.probe.calls), calls + 1, 'Remount performs its one existing refresh; aborted minute ticks perform none');
});

test('resets: Overview shows authoritative safe Available details and scoped returned History without mutation or pagination controls', async t => {
  const page = await pageFor(t, resetsSnapshot());
  const region = await resetsRegion(page);
  assert.equal(await page.getByRole('tablist', { name: 'Usage report', exact: true }).getByRole('tab').count(), 2);
  assert.equal(await region.getByRole('tab', { name: 'Available', exact: true }).getAttribute('aria-selected'), 'true');
  assert.match(await region.innerText(), /available(?:\s+count)?\s*:?\s*5\b/i);
  assert.match(await region.innerText(), /total earned(?:\s+count)?\s*:?\s*9\b/i);
  assert.match(await region.innerText(), /Earned reset/);
  assert.match(await region.innerText(), /A reset from supplied activity/);
  assert.match(await region.innerText(), /weekly/i);
  assert.match(await region.innerText(), /2026\.10\.07 23:40/);
  assert.match(await region.innerText(), /2026\.11\.06 23:40/);
  assert.equal(await region.getByRole('img', { name: 'False', exact: true }).count(), 1, 'Explicit unsupported-by-plan remains accessible false');
  assert.match(await region.innerText(), /data as of[^\n]*unknown/i);
  assert.match(await page.getByRole('tabpanel', { name: 'Overview', exact: true }).innerText(), /Earned resets\s*2/);
  await region.getByRole('tab', { name: 'History', exact: true }).click();
  assert.match(await region.innerText(), /granted/i);
  assert.match(await region.innerText(), /2026\.10\.07 23:40/);
  assert.match(await region.innerText(), /2026\.09\.28 00:44/, 'Source window start uses host-local human dates');
  assert.match(await region.innerText(), /data as of[^\n]*2026\.10\.27 19:00/i);
  assert.match(await region.innerText(), /updated[^\n]*2026\.10\.27 20:00/i, 'Local fetch time differs from source freshness');
  assert.match(await region.innerText(), /returned[^\n]*(?:history|window)|(?:history|window)[^\n]*returned/i);
  assert.doesNotMatch(await region.innerText(), /complete history|all-time history|lifetime history/i);
  assert.equal(await region.getByRole('button', { name: /purchase|buy|redeem|reset now|load more|next page/i }).count(), 0);
  assert.equal(await region.getByRole('switch').count(), 0);
  assert.equal(await region.getByRole('checkbox').count(), 0);
  assert.equal(await region.locator('img').count(), 0, 'No profile/avatar image is displayed');
});

test('resets: keyboard local tabs retain selection across outer tabs/live refresh and reset to Available on remount', async t => {
  const next = resetsSnapshot();
  const page = await pageFor(t, next);
  let region = await resetsRegion(page);
  const before = await page.evaluate(() => window.probe.calls);
  await region.getByRole('tab', { name: 'Available', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await region.getByRole('tab', { name: 'History', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await region.getByRole('tab', { name: 'History', exact: true }).evaluate(node => node === document.activeElement), true);
  next.resetHistory.events = [{ kind: 'supplied_history_event', occurred_at: Date.parse('2026-10-26T17:00:00Z') }];
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(await region.getByRole('tab', { name: 'History', exact: true }).getAttribute('aria-selected'), 'true');
  assert.match(await region.innerText(), /supplied.history.event/i);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  region = await resetsRegion(page);
  assert.equal(await region.getByRole('tab', { name: 'History', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => window.probe.calls), before, 'Local reset-tab changes never dispatch refresh');
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  region = await resetsRegion(page);
  assert.equal(await region.getByRole('tab', { name: 'Available', exact: true }).getAttribute('aria-selected'), 'true');
});

test('resets: focused Available and History panels retain reading focus across live content updates', async t => {
  const next = resetsSnapshot();
  const page = await pageFor(t, next);
  const region = await resetsRegion(page);
  for (const name of ['Available', 'History']) {
    await region.getByRole('tab', { name, exact: true }).click();
    const panel = region.getByRole('tabpanel', { name, exact: true });
    assert.equal(await panel.count(), 1, 'The selected reset view exposes its labelled tabpanel');
    await panel.focus();
    assert.equal(await panel.evaluate(node => node === document.activeElement), true, 'Regression starts with actual keyboard reading focus in the panel');
    if (name === 'Available') next.resetCredits.credits[0].title = 'Updated supplied reset title';
    else next.resetHistory.events[0].kind = 'updated_supplied_event';
    await page.evaluate(state => window.probe.publish(state), next);
    const replacement = region.getByRole('tabpanel', { name, exact: true });
    assert.equal(await replacement.evaluate(node => node === document.activeElement), true, 'Live update retains focus in the replacement reading panel');
    assert.equal(await region.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('tab', { name: 'Overview', exact: true }).getAttribute('aria-selected'), 'true');
    assert.match(await replacement.innerText(), name === 'Available' ? /Updated supplied reset title/ : /updated.supplied.event/i);
  }
});

test('resets: zero and false remain distinct from unknown while empty/stale/error feedback is independent per local tab', async t => {
  const next = resetsSnapshot();
  const page = await pageFor(t, next);
  const region = await resetsRegion(page);
  next.resetCredits = { ...next.resetCredits, credits: [], available_count: 0, total_earned_count: 0 };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /available(?:\s+count)?\s*:?\s*0\b/i);
  assert.match(await region.innerText(), /no[^\n]*(?:resets|credits)|empty/i);
  next.resetCredits = { ...next.resetCredits, credits: [{ ...resetsSnapshot().resetCredits.credits[0], is_supported_by_plan: null }], available_count: null, total_earned_count: null };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.doesNotMatch(await region.innerText(), /available(?:\s+count)?\s*:?\s*0\b/i, 'Unknown is not zero');
  assert.equal(await region.getByRole('img', { name: 'False', exact: true }).count(), 0, 'Unknown is not unsupported');
  next.resetCredits = { ...resetsSnapshot().resetCredits, stale: true, error: 'Reset credits unavailable' };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /stale/i);
  assert.match(await region.innerText(), /unavailable/i);
  assert.match(await region.innerText(), /Earned reset/);
  await region.getByRole('tab', { name: 'History', exact: true }).click();
  assert.doesNotMatch(await region.innerText(), /stale|unavailable/i, 'Available source failure does not contaminate fresh History');
  next.resetHistory = { ...next.resetHistory, events: [], stale: true, error: 'Reset history unavailable' };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /stale/i);
  assert.match(await region.innerText(), /unavailable/i);
  next.resetHistory = { ...next.resetHistory, stale: false, error: null };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /no[^\n]*(?:events|history)|empty/i);
  assert.equal(await region.getByRole('tab', { name: 'History', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('heading', { name: 'Subscription limits', exact: true }).count(), 1);
});

test('tools: inline named charts report top-ten subtotals, keep namespaces distinct, and render display names as safe text', async t => {
  const next = toolsSnapshot();
  next.plugins.data[0].plugin_usage_overviews.push(
    { plugin_name: 'files', display_name: 'Files', marketplace: 'community', invocation_counts: 2 },
    { plugin_name: 'safe', display_name: '<img src=x onerror=alert(1)>', marketplace: 'official', invocation_counts: 0 },
  );
  const page = await pageFor(t, next);
  const regions = await toolsRegions(page);
  const headings = await page.getByRole('tabpanel').getByRole('heading').allTextContents();
  for (const [before, after] of [['Messages', 'Plugins'], ['Plugins', 'Skills'], ['Skills', 'All-time statistics']]) assert.ok(headings.indexOf(before) < headings.indexOf(after));
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Overview', 'Analytics']);
  for (const [name, count] of [['plugins', 7], ['skills', 3]]) {
    const region = regions[name];
    assert.match(await region.innerText(), new RegExp(`Reported subtotal[^\\n]*\\b${count}\\b`, 'i'));
    assert.match(await region.innerText(), /top\s*10[^\n]*(?:per day|daily)|(?:per day|daily)[^\n]*top\s*10/i);
    assert.doesNotMatch(await region.innerText(), /grand total|reported total|Other:/i);
    const chart = region.locator('svg.usage-chart');
    assert.equal(await chart.count(), 1);
    assert.ok(await chart.locator('path, polyline').count() >= 1);
    assert.match(await chart.textContent(), /10\.26/);
    const ticks = await chart.locator('text[x="30"][text-anchor="end"]').allTextContents();
    assert.ok(ticks.length >= 2 && ticks.every(text => /^\d+$/.test(text)), 'Invocation axis has integer ticks');
    await region.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  }
  const detail = await regions.plugins.getByRole('region', { name: 'Day details', exact: true }).innerText();
  assert.match(detail, /Files[^\n]*\b5\b/);
  assert.match(detail, /Files[^\n]*\b2\b/, 'Same plugin name from another marketplace is not merged');
  assert.ok(detail.includes('<img src=x onerror=alert(1)>'));
  assert.equal(await regions.plugins.locator('img').count(), 0);
  assert.match(await regions.skills.getByRole('region', { name: 'Day details', exact: true }).innerText(), /Review[^\n]*\b3\b/);
  assert.deepEqual(await page.evaluate(() => [window.probe.pluginsCalls.length, window.probe.skillsCalls.length]), [0, 0]);
});

test('tools: independent thirty-day defaults and seven-day navigation preserve all card filters and token reading state across tabs/updates', async t => {
  const next = toolsSnapshot();
  const page = await pageFor(t, next);
  let regions = await toolsRegions(page);
  const history = page.getByRole('region', { name: 'Usage history', exact: true });
  const messages = page.getByRole('region', { name: 'Messages', exact: true });
  await history.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By model' });
  await history.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  await messages.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By surface' });
  const scroll = page.locator('.heatmap-scroll').first();
  await scroll.evaluate(node => { node.scrollLeft = 31; });
  const readingPosition = await scroll.evaluate(node => node.scrollLeft);
  for (const region of Object.values(regions)) {
    assert.equal(await region.getByRole('button', { name: '30 days', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await region.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  }
  await regions.plugins.getByRole('button', { name: '7 days', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.pluginsCalls.at(-1)), { startDate: '2026-10-21', endDate: '2026-10-27' });
  await regions.plugins.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.pluginsCalls.at(-1)), { startDate: '2026-10-14', endDate: '2026-10-20' });
  await regions.plugins.getByRole('button', { name: 'Next', exact: true }).click();
  await regions.plugins.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  await regions.skills.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  next.plugins = { ...next.plugins, startDate: '2026-10-21' };
  await page.evaluate(state => window.probe.publish(state), next);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  regions = await toolsRegions(page);
  assert.equal(await regions.plugins.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await regions.skills.getByRole('button', { name: '30 days', exact: true }).getAttribute('aria-pressed'), 'true');
  for (const region of Object.values(regions)) assert.match(await region.getByRole('region', { name: 'Day details', exact: true }).innerText(), /2026\.10\.26/);
  assert.equal(await history.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By model');
  assert.match(await history.getByRole('region', { name: 'Day details', exact: true }).innerText(), /2026\.10\.26/);
  assert.equal(await messages.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By surface');
  assert.equal(await scroll.evaluate(node => node.scrollLeft), readingPosition);
  assert.equal(await page.getByRole('group', { name: 'History period', exact: true }).getByRole('button', { name: 'Year', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  regions = await toolsRegions(page);
  for (const region of Object.values(regions)) {
    assert.equal(await region.getByRole('button', { name: '30 days', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await region.innerText(), /2026\.09\.28[\s\S]*2026\.10\.27/);
  }
});

test('tools: exact native day details distinguishes unknown gaps, true zero, partial/stale source data and empty cards', async t => {
  const next = toolsSnapshot();
  next.plugins.data = [
    { date: '2026-10-24', plugin_usage_overviews: [{ plugin_name: 'files', display_name: 'Files', marketplace: 'official', invocation_counts: null }] },
    { date: '2026-10-25', plugin_usage_overviews: [{ plugin_name: 'files', display_name: 'Files', marketplace: 'official', invocation_counts: 0 }] },
    { date: '2026-10-26', plugin_usage_overviews: [{ plugin_name: 'files', display_name: 'Files', marketplace: 'official', invocation_counts: 5 }, { plugin_name: 'unknown', invocation_counts: null }] },
  ];
  const page = await pageFor(t, next, 'Europe/Moscow', { viewport: { width: 320, height: 900 } });
  const regions = await toolsRegions(page);
  const days = regions.plugins.getByRole('combobox', { name: 'Day details', exact: true });
  assert.equal(await days.evaluate(node => node.tagName), 'SELECT');
  const box = await days.boundingBox();
  assert.ok(box && box.height >= 40 && box.width >= 24);
  await days.focus();
  assert.equal(await days.evaluate(node => node === document.activeElement), true);
  assert.ok(!(await days.locator('option').allTextContents()).some(label => /2026\.10\.24|2026\.10\.27/.test(label)), 'Unknown supplied and absent days are not fabricated as zero');
  await days.selectOption({ label: '2026.10.25' });
  const detail = regions.plugins.getByRole('region', { name: 'Day details', exact: true });
  assert.match(await detail.innerText(), /Files[^\n]*\b0\b/);
  await days.selectOption({ label: '2026.10.26' });
  assert.match(await detail.innerText(), /Files[^\n]*\b5\b/);
  assert.match(await detail.innerText(), /missing|known|partial|incomplete/i);
  assert.match(await regions.plugins.innerText(), /data as of[^\n]*2026\.10\.27/i);
  next.plugins = { ...next.plugins, stale: true, error: 'Plugins unavailable' };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await regions.plugins.innerText(), /stale/i);
  assert.match(await regions.plugins.innerText(), /unavailable/i);
  assert.doesNotMatch(await regions.skills.innerText(), /stale|unavailable/i);
  next.plugins = { ...next.plugins, data: [], stale: false, error: null, dataAsOf: null };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await regions.plugins.innerText(), /no[^\n]*(?:data|activity|usage)|empty/i);
  assert.match(await regions.plugins.innerText(), /data as of[^\n]*unknown/i);
  assert.equal(await page.getByRole('heading', { name: 'Daily', exact: true }).count(), 1);
});

test('tools: omitted dates qualify the selected-range subtotal without inventing zero points or day details', async t => {
  const next = toolsSnapshot();
  next.plugins.data[0].plugin_usage_overviews[0].invocation_counts = 10;
  next.skills.data[0].skill_usage_overviews[0].invocation_counts = 10;
  const page = await pageFor(t, next);
  const regions = await toolsRegions(page);
  for (const region of Object.values(regions)) {
    await region.getByRole('button', { name: '7 days', exact: true }).click();
    const subtotal = region.locator('.quota-value');
    assert.match(await subtotal.innerText(), /\b10\b/);
    assert.match(await subtotal.innerText(), /partial|known/i, 'An absent source date is unknown and must qualify the selected-range subtotal');
    const days = region.getByRole('combobox', { name: 'Day details', exact: true });
    const options = await days.locator('option').allTextContents();
    assert.ok(options.some(label => label.includes('2026.10.26')), 'Known supplied day remains inspectable');
    assert.ok(!options.some(label => /2026\.10\.25|2026\.10\.27/.test(label)), 'Omitted dates are not invented as zero-valued days');
    const pointDescriptions = await region.locator('svg.usage-chart title').allTextContents();
    assert.ok(pointDescriptions.length >= 1 && pointDescriptions.every(text => text.includes('2026.10.26')), 'Only the known supplied day produces plotted points');
    await days.selectOption({ label: '2026.10.26' });
    assert.match(await region.getByRole('region', { name: 'Day details', exact: true }).innerText(), /\b10\b/);
  }
});

test('tools: seventeen reported identities chart the top eight plus known Other while exact day details retain every name', async t => {
  const next = toolsSnapshot();
  const rows = Array.from({ length: 17 }, (_, index) => ({ plugin_name: `tool-${String(index + 1).padStart(2, '0')}`, display_name: `Tool ${String(index + 1).padStart(2, '0')}`, marketplace: 'official', invocation_counts: index + 1 }));
  next.plugins.data = [{ date: '2026-10-26', plugin_usage_overviews: [...rows, { plugin_name: 'unknown-tool', display_name: 'Unknown tool', marketplace: 'official', invocation_counts: null }] }];
  const page = await pageFor(t, next);
  const { plugins: region } = await toolsRegions(page);
  const chart = region.locator('svg.usage-chart');
  const groupedLines = chart.locator('path, polyline');
  assert.equal(await groupedLines.count() - 1, 9, 'Seventeen reported identities use eight top-name lines plus Other reported, alongside the subtotal line');
  const legend = await region.locator('.usage-legend li').allTextContents();
  assert.equal(legend.filter(label => /Other reported/i.test(label)).length, 1, 'Known remaining identities have an explicit reported-only legend key');
  for (let index = 10; index <= 17; index++) assert.ok(legend.some(label => label.includes(`Tool ${index}`)), `Top identity Tool ${index} remains a named chart series`);
  for (let index = 1; index <= 9; index++) assert.ok(!legend.some(label => label.includes(`Tool ${String(index).padStart(2, '0')}`)), 'Lower-ranked names are grouped in the chart only');
  const pointKeys = await chart.evaluate(svg => [...svg.querySelectorAll('circle, ellipse, rect, polygon, use')].slice(1).map(mark => {
    const style = getComputedStyle(mark);
    return JSON.stringify([mark.tagName, style.fill, style.stroke, style.strokeWidth, style.strokeDasharray]);
  }));
  assert.equal(pointKeys.length, 9, 'Sparse known-only grouping produces one marker for each of the nine plotted identities');
  assert.equal(new Set(pointKeys).size, 9, 'The nine sparse marker keys remain visually distinct');
  const pointDescriptions = (await chart.locator('title').allTextContents()).join('\n');
  assert.match(pointDescriptions, /Other reported[^\n]*\b45\b/, 'Other reported sums only returned counts 1 through 9');
  assert.doesNotMatch(pointDescriptions, /Unknown tool[^\n]*\b0\b/, 'Unknown source count is not a zero contribution');
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  assert.ok(!(await days.locator('option').allTextContents()).some(label => label.includes('2026.10.27')), 'Omitted source dates remain gaps');
  await days.selectOption({ label: '2026.10.26' });
  const detail = await region.getByRole('region', { name: 'Day details', exact: true }).innerText();
  for (const row of rows) assert.match(detail, new RegExp(`${row.display_name}[^\\n]*\\b${row.invocation_counts}\\b`), 'Exact details retain every returned identity and count');
  assert.match(await region.locator('.quota-value').innerText(), /\b153\b/);
  assert.match(await region.locator('.quota-value').innerText(), /partial|known/i);
});

test('tools: a full refresh settles overlapping tool ranges and includes all four selected card ranges', async t => {
  const next = toolsSnapshot();
  const page = await pageFor(t, next);
  const regions = await toolsRegions(page);
  await page.evaluate(() => { window.probe.deferNextPlugins(); window.probe.deferNextSkills(); });
  await regions.plugins.getByRole('button', { name: '7 days', exact: true }).click();
  await regions.skills.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForFunction(() => typeof window.probe.resolvePlugins === 'function' && typeof window.probe.resolveSkills === 'function');
  assert.match(await regions.plugins.innerText(), /loading/i);
  assert.match(await regions.skills.innerText(), /loading/i);
  next.plugins = { ...next.plugins, startDate: '2026-10-21' };
  next.skills = { ...next.skills, startDate: '2026-08-29', endDate: '2026-09-27', data: [{ date: '2026-09-26', skill_usage_overviews: [{ skill_name: 'review', display_name: 'Review', invocation_counts: 19 }] }] };
  try {
    await page.evaluate(async state => { window.probe.publish(state); await window.probe.tick(); }, next);
    assert.doesNotMatch(await regions.plugins.innerText(), /loading/i);
    assert.doesNotMatch(await regions.skills.innerText(), /loading/i);
    assert.deepEqual(await page.evaluate(() => window.probe.refreshInputs.at(-1)), {
      historyRange: { startDate: '2026-10-21', endDate: '2026-10-27' }, messagesRange: { startDate: '2026-10-21', endDate: '2026-10-27' },
      pluginsRange: { startDate: '2026-10-21', endDate: '2026-10-27' }, skillsRange: { startDate: '2026-08-29', endDate: '2026-09-27' },
    });
    await page.evaluate(async () => { window.probe.resolveSkills({ verified: false }); await Promise.resolve(); window.probe.resolvePlugins({ verified: false }); await Promise.resolve(); });
    assert.doesNotMatch(await regions.plugins.innerText(), /loading|unavailable/i);
    assert.doesNotMatch(await regions.skills.innerText(), /loading|unavailable/i);
    await regions.skills.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.09.26' });
    assert.match(await regions.skills.getByRole('region', { name: 'Day details', exact: true }).innerText(), /Review[^\n]*\b19\b/);
  } finally { await page.evaluate(() => { window.probe.resolvePlugins?.({ verified: false }); window.probe.resolveSkills?.({ verified: false }); }); }
});

test('messages: range subtotal remains qualified when another supplied day has wholly unknown counts', async t => {
  const next = messagesSnapshot();
  next.messages.data = [
    { date: '2026-10-26', totals: { turns: 10 }, models: [{ model: 'gpt-6.1-sol', turns: 10 }], clients: [{ client_id: 'CODEX_CLI', turns: 10 }] },
    { date: '2026-10-27', totals: { turns: null }, models: [{ model: 'gpt-6.1-sol', turns: null }], clients: [{ client_id: 'CODEX_CLI', turns: null }] },
  ];
  const page = await pageFor(t, next);
  const region = await messagesRegion(page);
  const total = region.locator('.quota-value');
  assert.match(await total.innerText(), /\b10\b/);
  assert.match(await total.innerText(), /known subtotal|partial/i, 'An unknown supplied day prevents claiming a complete reported range total');
  assert.doesNotMatch(await total.innerText(), /reported total/i);
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  assert.ok(!(await days.locator('option').allTextContents()).some(label => label.includes('2026.10.27')), 'Unknown day is not fabricated as an inspectable zero');
  await days.selectOption({ label: '2026.10.26' });
  assert.match(await region.getByRole('region', { name: 'Day details', exact: true }).innerText(), /\b10\b/);
});

test('messages: nine grouped series have distinct visual keys repeated in their legend swatches', async t => {
  const next = messagesSnapshot();
  const models = Array.from({ length: 9 }, (_, index) => ({ model: `test-model-${index + 1}`, turns: index + 1 }));
  next.messages.data = ['2026-10-25', '2026-10-26'].map(date => ({ date, totals: { turns: 45 }, models, clients: [] }));
  const page = await pageFor(t, next);
  const region = await messagesRegion(page);
  const keys = await region.evaluate(node => {
    const pattern = style => style.strokeDasharray !== 'none' && !/^0(?:px)?$/.test(style.strokeDasharray) ? 'patterned' : 'solid';
    const paths = [...node.querySelectorAll('svg path, svg polyline')];
    const lines = paths.slice(1).map(path => { const style = getComputedStyle(path); return { color: style.stroke, pattern: pattern(style) }; });
    const legend = [...node.querySelectorAll('.usage-legend li')].filter(item => item.textContent.startsWith('test-model-')).map(item => {
      const swatch = item.querySelector('.usage-swatch');
      const mark = swatch?.querySelector('path, line, polyline') ?? swatch;
      if (!mark) return null;
      const style = getComputedStyle(mark);
      const svg = mark.namespaceURI === 'http://www.w3.org/2000/svg';
      const border = ['dashed', 'dotted'].includes(style.borderTopStyle);
      return { color: svg ? style.stroke : border ? style.borderTopColor : style.backgroundColor,
        pattern: svg ? pattern(style) : border || style.backgroundImage !== 'none' ? 'patterned' : 'solid' };
    });
    return { lines, legend };
  });
  assert.equal(keys.lines.length, 9, 'All nine supplied groups have visible lines in addition to the total');
  assert.equal(new Set(keys.lines.map(key => JSON.stringify(key))).size, 9, 'Every group has a distinguishable color and line-pattern combination');
  assert.equal(keys.legend.length, 9, 'Every supplied group has a labelled legend swatch');
  assert.deepEqual(keys.legend, keys.lines, 'Legend swatches repeat the corresponding line colors and solid/patterned distinction');
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  assert.ok((await days.boundingBox()).height >= 40);
  await days.selectOption({ label: '2026.10.26' });
  const detail = await region.getByRole('region', { name: 'Day details', exact: true }).innerText();
  for (const row of models) assert.match(detail, new RegExp(`${row.model}[^\\n]*\\b${row.turns}\\b`));
});

test('messages: isolated points keep nine distinct visual keys and matching legend markers across unknown gaps', async t => {
  const next = messagesSnapshot();
  const models = Array.from({ length: 9 }, (_, index) => ({ model: `sparse-model-${index + 1}`, turns: index + 1 }));
  next.messages.data = [
    { date: '2026-10-25', totals: { turns: null }, models: models.map(row => ({ ...row, turns: null })), clients: [] },
    { date: '2026-10-26', totals: { turns: 45 }, models, clients: [] },
    { date: '2026-10-27', totals: { turns: null }, models: models.map(row => ({ ...row, turns: null })), clients: [] },
  ];
  const page = await pageFor(t, next);
  const region = await messagesRegion(page);
  const keys = await region.evaluate(node => {
    const shapes = 'circle, ellipse, rect, polygon, path, use';
    const isPoint = mark => !['path'].includes(mark.tagName) || mark.querySelector('title') || /z/i.test(mark.getAttribute('d') ?? '');
    const visualKey = mark => {
      if (!mark) return null;
      const style = getComputedStyle(mark);
      return { shape: mark.tagName, fill: style.fill, stroke: style.stroke,
        strokeWidth: style.stroke === 'none' ? null : style.strokeWidth,
        strokePattern: style.stroke === 'none' ? null : style.strokeDasharray,
        rounded: mark.getAttribute('rx'), reference: mark.getAttribute('href') };
    };
    const chart = node.querySelector('svg.usage-chart');
    const points = [...chart.querySelectorAll(shapes)].filter(isPoint).slice(1).map(visualKey);
    const legend = [...node.querySelectorAll('.usage-legend li')].filter(item => item.textContent.startsWith('sparse-model-')).map(item =>
      visualKey([...item.querySelectorAll(`.usage-swatch ${shapes.split(', ').join(', .usage-swatch ')}`)].find(isPoint)));
    return { points, legend };
  });
  assert.equal(keys.points.length, 9, 'Each supplied model has a visible isolated point in addition to the total');
  assert.notDeepEqual(keys.points[0], keys.points[8], 'First and ninth points differ visibly even when no connecting line can show its dash');
  assert.equal(new Set(keys.points.map(key => JSON.stringify(key))).size, 9, 'All isolated series have distinguishable color/shape/fill/stroke keys');
  assert.equal(keys.legend.length, 9, 'Every sparse series retains a labelled legend');
  assert.ok(keys.legend.every(Boolean), 'Every legend swatch displays its point marker');
  assert.deepEqual(keys.legend, keys.points, 'Legend markers repeat the point appearance rather than only an invisible line dash');
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  assert.ok((await days.boundingBox()).height >= 40);
  await days.selectOption({ label: '2026.10.26' });
  const detail = await region.getByRole('region', { name: 'Day details', exact: true }).innerText();
  for (const row of models) assert.match(detail, new RegExp(`${row.model}[^\\n]*\\b${row.turns}\\b`));
});

test('messages: inline multiline count chart follows Usage history and shows exact model/surface day values', async t => {
  const page = await pageFor(t, messagesSnapshot());
  const region = await messagesRegion(page);
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Overview', 'Analytics']);
  const headings = await page.getByRole('tabpanel').getByRole('heading').allTextContents();
  assert.ok(headings.indexOf('Usage history') < headings.indexOf('Messages'));
  assert.ok(headings.indexOf('Messages') < headings.indexOf('All-time statistics'));
  const chart = region.locator('svg').first();
  assert.equal(await chart.count(), 1);
  assert.ok(await chart.locator('path, polyline').count() >= 2, 'Multiple grouped lines are drawn');
  assert.match(await chart.textContent(), /10\.26/);
  const ticks = await chart.locator('text[x="30"][text-anchor="end"]').allTextContents();
  assert.ok(ticks.length >= 2 && ticks.every(text => /^\d+$/.test(text)), 'Count axis has at least two integer ticks');
  assert.match(await region.innerText(), /Messages[\s\S]*14/);
  const group = region.getByRole('combobox', { name: 'Group by', exact: true });
  assert.equal(await group.locator('option:checked').innerText(), 'By model');
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  await days.selectOption({ label: '2026.10.26' });
  let detail = region.getByRole('region', { name: 'Day details', exact: true });
  assert.match(await detail.innerText(), /2026\.10\.26[\s\S]*10\s*(?:messages)?/i);
  assert.match(await detail.innerText(), /gpt-6\.1-sol[^\n]*4/);
  assert.match(await detail.innerText(), /gpt-6-luna[^\n]*2/);
  assert.match(await detail.innerText(), /Other[^\n]*4/, 'Auto-review, other and positive ungrouped remainder are combined once');
  await group.selectOption({ label: 'By surface' });
  detail = region.getByRole('region', { name: 'Day details', exact: true });
  for (const [label, count] of [['Desktop', 3], ['CLI', 2], ['VS Code', 1], ['Web', 1], ['Web (Work)', 1], ['Mobile', 1], ['Code review', 1]]) {
    assert.ok((await detail.innerText()).split('\n').some(line => line.includes(label) && new RegExp(`\\b${count}\\b`).test(line)), `${label} has its supplied count`);
  }
  assert.equal(await page.evaluate(() => window.probe.messagesCalls.length), 0, 'Grouping and day inspection are local');
});

test('messages: range/group/day state is independent of History and token scroll, survives updates/tabs, resets on remount', async t => {
  const next = messagesSnapshot();
  const page = await pageFor(t, next);
  let region = await messagesRegion(page);
  assert.equal(await region.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await region.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  const history = page.getByRole('region', { name: 'Usage history', exact: true });
  await history.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By model' });
  await history.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  const scroll = page.locator('.heatmap-scroll').first();
  await scroll.evaluate(node => { node.scrollLeft = 31; });
  const savedScroll = await scroll.evaluate(node => node.scrollLeft);
  await region.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.messagesCalls.at(-1)), { startDate: '2026-10-14', endDate: '2026-10-20' });
  await region.getByRole('button', { name: '30 days', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.messagesCalls.at(-1)), { startDate: '2026-09-28', endDate: '2026-10-27' });
  await region.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.messagesCalls.at(-1)), { startDate: '2026-08-29', endDate: '2026-09-27' });
  await region.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await region.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  await region.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By surface' });
  await region.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  next.messages = { ...next.messages, startDate: '2026-09-28', endDate: '2026-10-27' };
  await page.evaluate(state => window.probe.publish(state), next);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  region = await messagesRegion(page);
  assert.equal(await region.getByRole('button', { name: '30 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await region.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By surface');
  assert.match(await region.getByRole('region', { name: 'Day details', exact: true }).innerText(), /2026\.10\.26/);
  assert.equal(await history.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await history.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By model');
  assert.match(await history.getByRole('region', { name: 'Day details', exact: true }).innerText(), /2026\.10\.26/);
  assert.equal(await scroll.evaluate(node => node.scrollLeft), savedScroll);
  assert.equal(await page.getByRole('group', { name: 'History period', exact: true }).getByRole('button', { name: 'Year', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  region = await messagesRegion(page);
  assert.equal(await region.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await region.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By model');
  assert.match(await region.innerText(), /2026\.10\.21[\s\S]*2026\.10\.27/);
});

test('messages: native day details preserves zero, unknown/partial counts and excess groups without negative Other', async t => {
  const next = messagesSnapshot();
  next.messages.data = [
    { date: '2026-10-23', totals: { turns: null }, models: [{ model: 'gpt-6.1-sol', turns: null }], clients: [] },
    { date: '2026-10-24', totals: { turns: null }, models: [{ model: 'gpt-6.1-sol', turns: 2 }, { model: 'gpt-6-luna', turns: null }], clients: [] },
    { date: '2026-10-25', totals: { turns: 2 }, models: [{ model: 'gpt-6.1-sol', turns: 4 }], clients: [] },
    next.messages.data.at(-1),
  ];
  const page = await pageFor(t, next, 'Europe/Moscow', { viewport: { width: 320, height: 900 } });
  const region = await messagesRegion(page);
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  assert.equal(await days.evaluate(node => node.tagName), 'SELECT');
  const box = await days.boundingBox();
  assert.ok(box && box.height >= 40 && box.width >= 24);
  await days.focus();
  assert.equal(await days.evaluate(node => node === document.activeElement), true);
  await days.selectOption({ label: '2026.10.27' });
  const detail = region.getByRole('region', { name: 'Day details', exact: true });
  assert.match(await detail.innerText(), /\b0\b/);
  assert.doesNotMatch(await days.locator('option').allTextContents().then(items => items.join('\n')), /2026\.10\.26/, 'Missing day has no fabricated zero detail');
  await days.selectOption({ label: '2026.10.24' });
  assert.match(await detail.innerText(), /\b2\b/);
  assert.match(await detail.innerText(), /known|subtotal|partial|incomplete|missing/i);
  await days.selectOption({ label: '2026.10.25' });
  assert.match(await detail.innerText(), /gpt-6\.1-sol[^\n]*4/);
  assert.match(await detail.innerText(), /differ|exceed|discrepan|inconsistent/i);
  assert.doesNotMatch(await detail.innerText(), /Other[^\n]*-2/);
  assert.match(await region.innerText(), /data as of[^\n]*unknown/i);
  next.messages = { ...next.messages, stale: true, error: 'Messages unavailable' };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /stale/i);
  assert.match(await region.innerText(), /unavailable/i);
  next.messages = { ...next.messages, stale: false, error: null, data: [] };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /no messages|no data|empty/i);
  assert.equal(await page.getByRole('heading', { name: 'Daily', exact: true }).count(), 1);
});

test('messages: reversed card requests plus full refresh settle both cards and preserve the newer values', async t => {
  const next = messagesSnapshot();
  const page = await pageFor(t, next);
  const region = await messagesRegion(page);
  const history = page.getByRole('region', { name: 'Usage history', exact: true });
  await page.evaluate(() => { window.probe.deferNextHistory(); window.probe.deferNextMessages(); });
  await history.getByRole('button', { name: 'Previous', exact: true }).click();
  await region.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForFunction(() => typeof window.probe.resolveHistory === 'function' && typeof window.probe.resolveMessages === 'function');
  assert.match(await history.innerText(), /loading/i);
  assert.match(await region.innerText(), /loading/i);
  next.history = { ...next.history, startDate: '2026-10-14', endDate: '2026-10-20', data: [{ date: '2026-10-19', attribution: [{ model: 'gpt-6.1-sol', value: 17 }] }] };
  next.messages = { ...next.messages, startDate: '2026-10-14', endDate: '2026-10-20', data: [{ date: '2026-10-19', totals: { turns: 19 }, models: [{ model: 'gpt-6.1-sol', turns: 19 }], clients: [] }] };
  try {
    await page.evaluate(async state => { window.probe.publish(state); await window.probe.tick(); }, next);
    assert.doesNotMatch(await region.innerText(), /loading/i);
    assert.doesNotMatch(await history.innerText(), /loading/i);
    assert.deepEqual(await page.evaluate(() => {
      const { historyRange, messagesRange } = window.probe.refreshInputs.at(-1);
      return { historyRange, messagesRange };
    }), { historyRange: { startDate: '2026-10-14', endDate: '2026-10-20' }, messagesRange: { startDate: '2026-10-14', endDate: '2026-10-20' } });
    await page.evaluate(async () => { window.probe.resolveMessages({ verified: false }); await Promise.resolve(); window.probe.resolveHistory({ verified: false }); await Promise.resolve(); });
    assert.doesNotMatch(await region.innerText(), /loading|unavailable/i);
    assert.doesNotMatch(await history.innerText(), /loading|unavailable/i);
    await region.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.19' });
    assert.match(await region.getByRole('region', { name: 'Day details', exact: true }).innerText(), /\b19\b/);
  } finally {
    await page.evaluate(() => { window.probe.resolveHistory?.({ verified: false }); window.probe.resolveMessages?.({ verified: false }); });
  }
});

test('history: first Analytics chart groups source usage with exact pointer and keyboard values and share legend', async t => {
  const page = await pageFor(t, historySnapshot());
  const region = await historyRegion(page);
  const chart = region.locator('svg, canvas, [role="img"]').first();
  assert.equal(await chart.count(), 1, 'History has a graphical stacked chart');
  assert.ok(await region.locator('svg rect').count() >= 5, 'Attribution renders multiple stacked segments rather than token calendar cells');
  assert.equal(await page.getByRole('tabpanel').locator('svg, canvas, [role="img"]').first().evaluate(el => !!el.closest('[aria-label="Usage history"], [aria-labelledby]') && el.closest('section').textContent.includes('Usage history')), true);
  assert.match(await chart.textContent(), /10\.26/);
  const text = await region.innerText();
  assert.match(text, /2026\.10\.21[\s\S]*2026\.10\.27/);
  assert.match(text, /Chats[\s\S]*30\s*%/);
  assert.match(text, /Subagents[\s\S]*20\s*%/);
  assert.match(text, /Chat titles/);
  assert.match(text, /Chat titles[^\n]*(?:<\s*0\.1\s*%|0\.000\d+\s*%)/, 'Tiny positive shares never appear as zero');
  assert.match(text, /share[^\n]*(shown|selected)|(?:shown|selected)[^\n]*share/i, 'Legend percentages describe shares of shown usage');
  assert.match(text, /Chat title updates/);
  assert.match(text, /agent.created.thread/i);
  assert.doesNotMatch(text, /tokens|weekly quota/i);
  const bar = region.getByRole('button', { name: /2026\.10\.26/ }).first();
  assert.equal(await bar.count(), 1, 'Dated usage bars expose keyboard access');
  await bar.focus();
  assert.match(await region.getByRole('tooltip').innerText(), /2026\.10\.26[\s\S]*10\s*%/);
  await bar.blur();
  await bar.hover();
  assert.match(await region.getByRole('tooltip').innerText(), /2026\.10\.26[\s\S]*10\s*%/);
  const group = region.getByRole('combobox', { name: 'Group by', exact: true });
  for (const [option, expected] of [['By model', /gpt-6\.1-sol[\s\S]*70\s*%/], ['By surface', /cli[\s\S]*80\s*%/i], ['By turn start', /User messages[\s\S]*70\s*%/]]) {
    await group.selectOption({ label: option });
    assert.match(await region.innerText(), expected, 'Grouping changes attribution labels/shares without changing the total');
    await region.getByRole('button', { name: /2026\.10\.26/ }).first().focus();
    assert.match(await region.getByRole('tooltip').innerText(), /10\s*%/);
  }
  for (const label of ['Queued messages', 'Scheduled automations', 'Scheduled follow-ups']) assert.ok((await region.innerText()).includes(label));
  assert.equal(await page.evaluate(() => window.probe.historyCalls.length), 0, 'Grouping uses existing attribution, not another source request');
});

test('history: independent local seven/thirty day navigation persists across tabs and updates and resets on remount', async t => {
  const next = historySnapshot();
  const page = await pageFor(t, next);
  let region = await historyRegion(page);
  assert.equal(await region.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await region.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('group', { name: 'History period', exact: true }).getByRole('button', { name: 'Year', exact: true }).getAttribute('aria-pressed'), 'true', 'Token calendars retain their independent Year default');
  await region.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.historyCalls.at(-1)), { startDate: '2026-10-14', endDate: '2026-10-20' }, 'Host-local inclusive window shifts seven whole days');
  assert.match(await region.innerText(), /2026\.10\.14[\s\S]*2026\.10\.20/);
  await region.getByRole('button', { name: '30 days', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.historyCalls.at(-1)), { startDate: '2026-09-28', endDate: '2026-10-27' }, 'Changing duration resets to latest host-local window, including local today after UTC midnight boundary');
  await region.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.probe.historyCalls.at(-1)), { startDate: '2026-08-29', endDate: '2026-09-27' });
  await region.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await region.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  await region.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By model' });
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  region = await historyRegion(page);
  next.history = { ...next.history, startDate: '2026-09-28', endDate: '2026-10-27' };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(await region.getByRole('button', { name: '30 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await region.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By model');
  assert.match(await region.innerText(), /2026\.09\.28[\s\S]*2026\.10\.27/);
  assert.equal(await page.getByRole('group', { name: 'History period', exact: true }).getByRole('button', { name: 'Year', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  region = await historyRegion(page);
  assert.equal(await region.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await region.getByRole('combobox', { name: 'Group by', exact: true }).locator('option:checked').innerText(), 'By feature');
  assert.match(await region.innerText(), /2026\.10\.21[\s\S]*2026\.10\.27/);
});

test('history: zero, unknown source freshness, empty/error and retained stale credits remain distinct', async t => {
  const next = historySnapshot();
  const page = await pageFor(t, next);
  const region = await historyRegion(page);
  assert.match(await region.innerText(), /data as of[^\n]*unknown/i, 'Fetch time cannot impersonate source freshness');
  await region.getByRole('button', { name: /2026\.10\.24/ }).first().focus();
  assert.match(await region.getByRole('tooltip').innerText(), /0\.00001\s*%/, 'Exact help preserves tiny positive source usage');
  const zero = region.getByRole('button', { name: /2026\.10\.27/ }).first();
  await zero.focus();
  assert.match(await region.getByRole('tooltip').innerText(), /0\s*%/);
  assert.equal(await region.getByRole('button', { name: /2026\.10\.25/ }).count(), 0, 'A missing source day is not an invented zero bar');
  next.history.units = 'credits';
  next.history.stale = true;
  next.history.error = 'Usage history unavailable';
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /stale/i);
  assert.match(await region.innerText(), /unavailable/i);
  await region.getByRole('button', { name: /2026\.10\.26/ }).first().focus();
  assert.match(await region.getByRole('tooltip').innerText(), /10\s*credits/i);
  next.history = { ...next.history, stale: false, error: null, data: [] };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /no usage|no data|empty/i);
  assert.equal(await region.getByRole('button', { name: /2026\.10\.26/ }).count(), 0);
  next.history.error = 'Usage history unavailable';
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /unavailable/i);
  assert.equal(await page.getByRole('heading', { name: 'Daily', exact: true }).count(), 1, 'History failure does not remove token calendars');
});

test('history: mixed known and missing attribution labels known subtotals and never turns an unknown day into zero', async t => {
  const next = historySnapshot();
  const dimensions = { thread_source: 'user', turn_trigger: 'composer', model: 'gpt-6.1-sol', surface: 'cli' };
  next.history.data = [
    { date: '2026-10-25', attribution: [{ ...dimensions, value: null }] },
    { date: '2026-10-26', attribution: [{ ...dimensions, value: 3 }, { ...dimensions, thread_source: 'subagent', value: null }] },
    { date: '2026-10-27', attribution: [{ ...dimensions, value: 0 }] },
  ];
  const page = await pageFor(t, next);
  const region = await historyRegion(page);
  assert.equal(await region.getByRole('button', { name: /2026\.10\.25/ }).count(), 0, 'All-missing attribution cannot produce a zero-valued bar');
  await region.getByRole('button', { name: /2026\.10\.27/ }).first().focus();
  assert.match(await region.getByRole('tooltip').innerText(), /0\s*%/, 'Explicit zero remains inspectable');
  await region.getByRole('button', { name: /2026\.10\.26/ }).first().focus();
  const detail = await region.getByRole('tooltip').innerText();
  assert.match(detail, /3\s*%/, 'Known source usage remains visible');
  assert.match(detail, /known|subtotal|partial|incomplete|some.*missing/i, 'A known subtotal cannot imply that missing attribution was zero');
  assert.match(await region.innerText(), /share[^\n]*(?:known|supplied)|(?:known|supplied)[^\n]*share/i, 'Legend shares identify their known-value denominator');
});

test('history: a full refresh settles the selected chart while an obsolete range request is still pending', async t => {
  const next = historySnapshot();
  const page = await pageFor(t, next);
  const region = await historyRegion(page);
  await page.evaluate(() => window.probe.deferNextHistory());
  await region.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForFunction(() => typeof window.probe.resolveHistory === 'function');
  assert.match(await region.innerText(), /loading usage history/i);
  next.history = { ...next.history, startDate: '2026-10-14', endDate: '2026-10-20', data: [
    { date: '2026-10-19', attribution: [{ thread_source: 'user', turn_trigger: 'composer', model: 'gpt-6.1-sol', surface: 'cli', value: 17 }] },
  ] };
  try {
    await page.evaluate(async state => { window.probe.publish(state); await window.probe.tick(); }, next);
    assert.doesNotMatch(await region.innerText(), /loading usage history/i, 'A successful newer full refresh finishes loading for its matching selected range');
    assert.match(await region.innerText(), /2026\.10\.14[\s\S]*2026\.10\.20/);
    await region.getByRole('button', { name: /2026\.10\.19/ }).first().focus();
    assert.match(await region.getByRole('tooltip').innerText(), /17\s*%/);
  } finally {
    await page.evaluate(async () => { window.probe.resolveHistory({ verified: false }); await Promise.resolve(); });
  }
  assert.doesNotMatch(await region.innerText(), /loading|unavailable/i, 'Obsolete completion cannot revoke the newer report');
  assert.doesNotMatch(await region.locator('.history-range').innerText(), /2026\.10\.21|2026\.10\.27/, 'Obsolete completion cannot restore its old range caption');
  await region.getByRole('button', { name: /2026\.10\.19/ }).first().focus();
  assert.match(await region.getByRole('tooltip').innerText(), /17\s*%/);
});

test('history: day details offers a large narrow-panel control with exact grouped values and clears an out-of-range selection', async t => {
  const next = historySnapshot();
  const page = await pageFor(t, next, 'Europe/Moscow', { viewport: { width: 320, height: 900 } });
  const region = await historyRegion(page);
  await region.getByRole('button', { name: '30 days', exact: true }).click();
  const days = region.getByRole('combobox', { name: 'Day details', exact: true });
  assert.equal(await days.count(), 1, 'Thirty-day charts offer a native accessible alternative to narrow bar targets');
  assert.equal(await days.evaluate(node => node.tagName), 'SELECT');
  const target = await days.boundingBox();
  assert.ok(target && target.height >= 40 && target.width >= 24, 'Day details has a large usable touch target at 320px');
  await days.focus();
  assert.equal(await days.evaluate(node => node === document.activeElement), true);
  await days.selectOption({ label: '2026.10.26' });
  const detail = region.getByRole('region', { name: 'Day details', exact: true });
  assert.equal(await detail.count(), 1, 'Chosen-day values are exposed as a labelled inline region');
  assert.equal(await detail.isVisible(), true);
  assert.match(await detail.innerText(), /2026\.10\.26[\s\S]*10\s*%/);
  assert.match(await detail.innerText(), /Chats[^\n]*3\s*%/);
  assert.match(await detail.innerText(), /Subagents[^\n]*2\s*%/);
  await days.selectOption({ label: '2026.10.27' });
  assert.match(await detail.innerText(), /2026\.10\.27[\s\S]*0\s*%/, 'Explicit zero is selectable and reported exactly');
  await days.selectOption({ label: '2026.10.26' });
  await region.getByRole('combobox', { name: 'Group by', exact: true }).selectOption({ label: 'By surface' });
  assert.match(await detail.innerText(), /cli[^\n]*8\s*%/i);
  assert.match(await detail.innerText(), /web[^\n]*2\s*%/i);
  assert.doesNotMatch(await detail.innerText(), /Chats|Subagents/, 'Details follow the current grouping');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await historyRegion(page);
  assert.equal(await days.locator('option:checked').innerText(), '2026.10.26', 'Valid day selection survives tab return');
  await region.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.match(await region.locator('.history-range').innerText(), /2026\.08\.29[\s\S]*2026\.09\.27/);
  assert.doesNotMatch(await region.getByRole('region', { name: 'Day details', exact: true }).allTextContents().then(parts => parts.join('\n')), /2026\.10\.26|10\s*%/, 'A range change cannot retain out-of-range day details');
  assert.equal(await region.getByRole('combobox', { name: 'Day details', exact: true }).locator('option:checked').filter({ hasText: '2026.10.26' }).count(), 0);
});

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
  const mounted = await page.evaluate(() => ({ polling: [...window.probe.timerIntervals.values()].filter(ms => ms === 180000).length, calls: window.probe.calls }));
  assert.equal(mounted.polling, 1, 'Mounted details owns exactly one frontend source-polling interval');
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
const period = (page, name) => page.getByRole('group', { name: 'History period', exact: true }).getByRole('button', { name, exact: true });

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

const topChatsSnapshot = () => ({ ...tokensSnapshot(), topChats: {
  data: Array.from({ length: 12 }, (_, i) => ({ key: `opaque-chat-${i + 1}`, title: `Named chat ${i + 1}`, createdAt: timestamp - 86400000, updatedAt: timestamp - i * 1000, dataStatus: i === 1 ? 'partial' : 'available', usageSource: 'included_plan', weeklyLimitPercent: i === 1 ? 0 : 12 - i, fiveHourLimitPercent: i === 1 ? null : 0.5, balanceUsageCredits: i === 1 ? '0.000001' : '0E-10', groups: [{ model: 'gpt-6.1-sol', reasoningEffort: 'high', speed: 'standard', productExperience: null, weeklyLimitPercent: i === 1 ? 0 : 12 - i, fiveHourLimitPercent: null, balanceUsageCredits: '0.000001' }] })),
  coverage: { candidates: 14, matched: 12, limited: false }, dataAsOf: timestamp - 3600000, updatedAt: timestamp, stale: false, error: null,
} });
async function topChatsRegion(page) {
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  const region = page.getByRole('region', { name: 'Top chats', exact: true });
  assert.equal(await region.count(), 1, 'Analytics exposes Top chats as an inline labelled region');
  return region;
}
const topChatToggle = (region, n) => region.getByRole('button', { name: new RegExp(`Named chat ${n}(?:$|\\s)`) });
const topChatRows = region => region.getByRole('row').filter({ has: region.page().getByRole('button', { name: /Named chat \d/ }) });

test('top chats: inline ranked table shows five rows, keyboard model details and cached five-row increments', async t => {
  const page = await pageFor(t, topChatsSnapshot());
  const region = await topChatsRegion(page);
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Overview', 'Analytics'], 'Top chats has no independent navigation stack');
  assert.equal(await region.getByRole('table').count(), 1);
  assert.match((await region.getByRole('columnheader').allTextContents()).join(' '), /Chat.*Weekly.*Credits/i);
  assert.equal(await topChatRows(region).count(), 5);
  assert.match(await topChatRows(region).first().innerText(), /Named chat 1[\s\S]*12\s*%[\s\S]*\b0\b/);
  assert.match(await region.innerText(), /recent[\s\S]*30[\s\S]*14[\s\S]*12|12[\s\S]*14[\s\S]*30/i, 'Coverage describes recent local candidates and server attribution');
  assert.match(await region.innerText(), /server|account/i);
  assert.doesNotMatch(await region.innerText(), /token usage|all chats|all-time chats/i);
  const disclosure = topChatToggle(region, 2);
  assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
  await disclosure.focus();
  await page.keyboard.press('Enter');
  assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
  const text = await region.innerText();
  assert.match(text, /partial/i);
  assert.match(text, /gpt-6\.1-sol[\s\S]*high/);
  assert.match(text, /0\.000001|<\s*0\.01/);
  assert.ok(text.includes('0.000001') || (await region.locator('[title]').evaluateAll(nodes => nodes.map(node => node.title).join(' '))).includes('0.000001'), 'Tiny positive credits remain exact in visible details or a title');
  assert.doesNotMatch(text, /5\s*(?:h|hours?)[^\n]*0\s*%/i, 'Missing five-hour measure cannot display zero');
  const calls = await page.evaluate(() => window.probe.calls);
  await region.getByRole('button', { name: 'Show more', exact: true }).click();
  assert.equal(await topChatRows(region).count(), 10);
  assert.match(await page.evaluate(() => document.activeElement?.textContent), /Named chat 6/, 'Show more focuses the first newly revealed chat');
  await region.getByRole('button', { name: 'Show more', exact: true }).click();
  assert.equal(await topChatRows(region).count(), 12);
  assert.match(await page.evaluate(() => document.activeElement?.textContent), /Named chat 11/, 'The final increment keeps keyboard focus on a revealed row');
  assert.equal(await region.getByRole('button', { name: 'Show more', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.probe.calls), calls, 'Pagination and expansion use cached rows');
  assert.equal(await region.getByRole('link').count(), 0, 'Rows do not open chats or files');
  assert.equal(await region.getByRole('button', { name: /sign in|buy|delete|reset|consume/i }).count(), 0);
});

test('top chats: expanded opaque row and pagination survive live refresh, report tabs and Messages ranges, then remount resets', async t => {
  const next = topChatsSnapshot();
  const page = await pageFor(t, next);
  await page.setViewportSize({ width: 320, height: 800 });
  let region = await topChatsRegion(page);
  const messages = page.getByRole('region', { name: 'Messages', exact: true });
  await messages.getByRole('combobox', { name: 'Day details', exact: true }).selectOption({ label: '2026.10.26' });
  await region.getByRole('button', { name: 'Show more', exact: true }).click();
  await topChatToggle(region, 2).click();
  await topChatToggle(region, 2).focus();
  const scroll = region.getByRole('group', { name: 'Chat usage table', exact: true });
  assert.ok(await scroll.evaluate(node => node.scrollWidth > node.clientWidth), 'The native table overflows horizontally in the narrow report');
  const scrollLeft = await scroll.evaluate(node => {
    node.scrollLeft = 24;
    return node.scrollLeft;
  });
  assert.ok(scrollLeft > 0, 'Retention starts from an actual positive table reading offset');
  const savedY = await page.evaluate(() => window.scrollY);
  next.topChats.data = [next.topChats.data[1], next.topChats.data[0], ...next.topChats.data.slice(2)];
  next.topChats.data[0].title = 'Named chat 2 renamed';
  next.topChats.data[0].weeklyLimitPercent = 6.125;
  next.topChats.data[0].balanceUsageCredits = '0.0000023';
  await page.evaluate(state => window.probe.publish(state), next);
  assert.equal(await topChatRows(region).count(), 10);
  assert.equal(await topChatToggle(region, 2).getAttribute('aria-expanded'), 'true', 'Expansion follows opaque identity through reordered results');
  assert.match(await page.evaluate(() => document.activeElement?.textContent), /Named chat 2 renamed/);
  assert.equal(await page.evaluate(() => window.scrollY), savedY, 'Live refresh preserves report scroll');
  assert.equal(await scroll.evaluate(node => node.scrollLeft), scrollLeft, 'Live refresh preserves positive table scroll');
  assert.match(await topChatRows(region).first().innerText(), /Named chat 2 renamed[\s\S]*6\.125%[\s\S]*0\.0000023/, 'Preserved reading state still receives exact fresh row measures');
  assert.equal(await messages.getByRole('combobox', { name: 'Day details', exact: true }).locator('option:checked').innerText(), '2026.10.26');
  await page.getByRole('region', { name: 'Messages', exact: true }).getByRole('button', { name: '30 days', exact: true }).click();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  region = await topChatsRegion(page);
  assert.equal(await topChatRows(region).count(), 10);
  assert.equal(await topChatToggle(region, 2).getAttribute('aria-expanded'), 'true');
  assert.equal(await scroll.evaluate(node => node.scrollLeft), scrollLeft, 'Messages range and outer-tab return preserve positive table scroll');
  assert.match(await topChatRows(region).first().innerText(), /6\.125%[\s\S]*0\.0000023/);
  assert.equal(await messages.getByRole('combobox', { name: 'Day details', exact: true }).locator('option:checked').innerText(), '2026.10.26', 'The independent Messages day remains selected');
  assert.match(await region.innerText(), /30/);
  await page.evaluate(async () => { window.probe.close(); await window.probe.mount(); });
  region = await topChatsRegion(page);
  assert.equal(await topChatRows(region).count(), 5);
  assert.equal(await topChatToggle(region, 2).getAttribute('aria-expanded'), 'false');
});

test('top chats: stale, unmatched and empty candidates remain distinct and narrow layout keeps table overflow local', async t => {
  const next = topChatsSnapshot();
  const page = await pageFor(t, next);
  await page.setViewportSize({ width: 320, height: 800 });
  const region = await topChatsRegion(page);
  assert.ok(await page.locator('#root').evaluate(node => node.scrollWidth <= innerWidth), 'Narrow report remains within the workbench');
  next.topChats.stale = true;
  next.topChats.error = 'Top chats unavailable';
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /stale|last successful/i);
  assert.match(await region.innerText(), /Named chat 1/);
  next.topChats = { ...next.topChats, data: [], stale: false, error: null, coverage: { candidates: 100, matched: 0, limited: true } };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /no.*(?:attribut|match)|(?:attribut|match).*unavailable/i);
  assert.match(await region.innerText(), /100|limit|cap/i, 'Candidate cap is disclosed independently of attribution');
  assert.doesNotMatch(await region.innerText(), /\b0\s*%/);
  next.topChats.coverage = { candidates: 0, matched: 0, limited: false };
  await page.evaluate(state => window.probe.publish(state), next);
  assert.match(await region.innerText(), /no recent.*(?:session|chat)|no.*(?:session|chat).*30/i);
  assert.doesNotMatch(await region.innerText(), /\b0\s*%/);
  assert.equal(await region.getByRole('button', { name: 'Show more', exact: true }).count(), 0);
});

test('top chats: source freshness remains distinct from fetch time and unknown source dates stay explicit', async t => {
  const next = topChatsSnapshot();
  next.topChats.dataAsOf = Date.parse('2026-10-22T06:45:00Z');
  const page = await pageFor(t, next);
  const region = await topChatsRegion(page);
  assert.equal(await region.getByText('Updated: 2026.10.27 20:00', { exact: true }).count(), 1, 'The independent recent fetch timestamp remains visible');
  assert.equal(await region.getByText('Data as of: 2026.10.22 09:45', { exact: true }).count(), 1, 'Top chats explicitly labels its older server source timestamp in local human-readable form');
  assert.doesNotMatch(await region.innerText(), /2026-10-22T06:45:00Z/, 'Metadata uses the report date format');
  for (const missing of [null, undefined]) {
    if (missing === undefined) delete next.topChats.dataAsOf;
    else next.topChats.dataAsOf = missing;
    await page.evaluate(state => window.probe.publish(state), next);
    assert.equal(await region.getByText(/^Data as of:/).innerText(), 'Data as of: unknown', 'A null or omitted source timestamp cannot borrow fetch time or become the epoch');
    assert.equal(await region.getByText('Updated: 2026.10.27 20:00', { exact: true }).count(), 1, 'Unknown source freshness does not hide known fetch time');
  }
});
