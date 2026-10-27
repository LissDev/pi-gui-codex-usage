import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response, usage, analytics, endpoint, analyticsEndpoint, secret, timestamp } from './helpers.js';

const historyPath = '/backend-api/wham/usage/daily-token-usage-breakdown';
const row = (value, fields = {}) => ({ thread_source: 'user', turn_trigger: 'composer', model: 'gpt-6.1-sol', surface: 'cli', value, ...fields });
const body = (units = 'percent') => ({ units, data: [
  { date: '2026-10-26', attribution: [row(2.5), row(0, { thread_source: 'subagent' }), row(undefined, { surface: 'web' })], models: [{ model: 'gpt-6.1-sol', credits: 999 }], thread_id: 'PRIVATE_THREAD_ID', title: 'PRIVATE_TITLE' },
] });
const isHistory = url => new URL(url).pathname === historyPath;
const backend = options => harness({ ...options, fetch: (url, init, count) => {
  if (String(url) === endpoint) return response(usage);
  if (String(url) === analyticsEndpoint) return response(analytics);
  assert.ok(isHistory(url), 'No unapproved source is requested');
  return options?.historyFetch ? options.historyFetch(url, init, count) : response(body());
} });
const open = async h => { await h.fire('session_start'); await h.detailsService().refresh(); };
const history = h => {
  assert.ok(h.snapshot().history, 'Public report exposes an independent Usage history section');
  return h.snapshot().history;
};
const rangeMethod = h => {
  assert.equal(typeof h.detailsService().refreshHistory, 'function', 'Details service exposes a finite history-only range request');
  return parameters => h.detailsService().refreshHistory(parameters);
};
const localKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const latest = (now, days) => {
  const end = new Date(now);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
  return { startDate: localKey(start), endDate: localKey(end) };
};

test('history: initial refresh reads seven inclusive host-local days through current Pi OAuth', async () => {
  const now = new Date(2027, 0, 1, 0, 15).getTime();
  const h = await backend({ now });
  await open(h);
  const requests = h.requests.filter(r => isHistory(r.url));
  assert.equal(requests.length, 1, 'Initial refresh fetches the new history source exactly once');
  const request = requests[0];
  const url = new URL(request.url);
  assert.equal(url.origin, 'https://chatgpt.com');
  assert.deepEqual(Object.fromEntries(url.searchParams), { start_date: '2026-12-26', end_date: '2027-01-01', group_by: 'day' });
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'error');
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get('x-openai-codex-usage-categories'), '1');
  assert.equal(headers.get('authorization'), `Bearer ${secret}`);
  assert.equal(headers.get('chatgpt-account-id'), 'test-account');
  assert.deepEqual([history(h).startDate, history(h).endDate], ['2026-12-26', '2027-01-01']);
  const before = h.requests.length;
  await h.command();
  await [...h.timers.values()][0].callback();
  assert.equal(h.requests.length, before + 4, 'Compact start and tick continue to fetch only limits and profiles');
  assert.equal(h.requests.filter(r => isHistory(r.url)).length, 1, 'Compact never keeps history polling after details closes');
});

test('history: normalized attribution preserves zero, missing values, dimensions and source units without double counting', async () => {
  for (const units of ['percent', 'credits']) {
    const h = await backend({ historyFetch: () => response(body(units)) });
    await open(h);
    const report = history(h);
    assert.equal(report.units, units);
    assert.equal(report.data[0].date, '2026-10-26');
    assert.deepEqual(report.data[0].attribution.slice(0, 2), [row(2.5), row(0, { thread_source: 'subagent' })]);
    assert.ok(report.data[0].attribution[2].value == null, 'Missing is not converted to zero');
    assert.equal(report.data[0].attribution.reduce((sum, item) => sum + (item.value ?? 0), 0), 2.5, 'models[].credits is a different measure');
    assert.equal(report.dataAsOf, null, 'Absent source freshness stays unknown');
    assert.equal(report.updatedAt, timestamp, 'Local fetch time is independently identified');
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|999|TEST_ONLY_SECRET/);
  }
});

test('history: unknown units, impossible dates and invalid values fail only history; empty data remains valid', async () => {
  for (const payload of [body('tokens'), { units: 'percent', data: [{ date: '2026-02-30', attribution: [row(1)] }] },
    { units: 'percent', data: [{ date: '2026-10-26', attribution: [row(-1)] }] },
    { units: 'percent', data: [{ date: '2026-10-26', attribution: [row('NaN')] }] }]) {
    const h = await backend({ historyFetch: () => response(payload) });
    await open(h);
    assert.match(history(h).error, /history.*unavailable|unsupported.*unit/i);
    assert.equal(h.snapshot().overview.windows[0].usedPercent, 25);
    assert.equal(h.snapshot().analytics.daily[0].tokens, 3456);
    assert.deepEqual(history(h).data, []);
  }
  const h = await backend({ historyFetch: () => response({ units: 'percent', data: [] }) });
  await open(h);
  assert.equal(history(h).error, null);
  assert.deepEqual(history(h).data, []);
});

test('history: failed or timed-out refresh retains only same-range values with separate stale status', async () => {
  for (const failure of ['http', 'timeout']) {
    let attempt = 0;
    const h = await backend({ requestTimeoutMs: 25, historyFetch: () => ++attempt === 1 ? response(body()) : failure === 'http' ? response({ error: secret }, 503) : new Promise(() => {}) });
    await open(h);
    const previous = structuredClone(history(h));
    await h.detailsService().refresh();
    assert.deepEqual(history(h).data, previous.data);
    assert.equal(history(h).updatedAt, previous.updatedAt);
    assert.equal(history(h).stale, true);
    assert.match(history(h).error, /history.*unavailable/i);
    assert.equal(h.snapshot().overview.stale, false);
    assert.equal(h.snapshot().analytics.stale, false);
    assert.doesNotMatch(h.output(), /TEST_ONLY_SECRET/);
  }
});

test('history: history-only range refresh rechecks identity without refetching limits or profiles', async () => {
  let account = 'account-a';
  let authReads = 0;
  const h = await backend({ getAuth: async () => { authReads++; return { auth: { apiKey: secret, headers: { 'chatgpt-account-id': account } } }; } });
  await open(h);
  const refreshHistory = rangeMethod(h);
  const before = h.requests.length;
  const selected = latest(timestamp, 30);
  assert.equal((await refreshHistory(selected)).verified, true);
  assert.equal(h.requests.length, before + 1, 'Changing history range fetches history alone');
  assert.equal(authReads, 2, 'Each request crosses current Pi auth boundary');
  assert.deepEqual([history(h).startDate, history(h).endDate], [selected.startDate, selected.endDate]);
  const last = h.requests.at(-1);
  assert.equal(new URL(last.url).searchParams.get('start_date'), selected.startDate);
  account = 'account-b';
  await refreshHistory(selected);
  assert.equal(new Headers(h.requests.at(-1).init.headers).get('chatgpt-account-id'), 'account-b');
});

test('history: a range refresh after an account switch immediately hydrates all report sections for the new identity', async () => {
  let account = 'account-a';
  const h = await harness({
    getAuth: async () => ({ auth: { apiKey: secret, headers: { 'chatgpt-account-id': account } } }),
    fetch: (url, init) => {
      assert.equal(new Headers(init.headers).get('chatgpt-account-id'), account, 'Every source request uses the currently verified account');
      const marker = account === 'account-a' ? 11 : 22;
      if (String(url) === endpoint) {
        const limits = structuredClone(usage);
        limits.rate_limit.primary_window.used_percent = marker;
        return response(limits);
      }
      if (String(url) === analyticsEndpoint) {
        const statistics = structuredClone(analytics);
        statistics.stats.daily_usage_buckets = [{ start_date: '2026-10-26', tokens: marker * 100 + marker }];
        return response(statistics);
      }
      assert.ok(isHistory(url));
      return response({ units: 'percent', data: [{ date: '2026-10-26', attribution: [row(marker)] }] });
    },
  });
  await open(h);
  assert.equal(h.snapshot().overview.windows[0]?.usedPercent, 11);
  assert.equal(h.snapshot().analytics.daily[0]?.tokens, 1111);
  assert.equal(history(h).data[0]?.attribution[0]?.value, 11);
  const switchedSnapshots = [];
  const unsubscribe = h.detailsService().state.subscribe(snapshot => switchedSnapshots.push(structuredClone(snapshot)));
  const selected = latest(timestamp, 30);
  try {
    account = 'account-b';
    assert.equal((await rangeMethod(h)(selected)).verified, true);
    assert.equal(history(h).startDate, selected.startDate);
    assert.equal(history(h).endDate, selected.endDate);
    assert.equal(history(h).data[0]?.attribution[0]?.value, 22, 'Selected history is populated for account B');
    assert.equal(h.snapshot().overview.windows[0]?.usedPercent, 22, 'Account B limits are immediately available without waiting for a polling tick');
    assert.deepEqual(h.snapshot().analytics.daily, [{ date: '2026-10-26', tokens: 2222 }], 'Account B token analytics are immediately available too');
    assert.equal(h.snapshot().overview.error, null);
    assert.equal(h.snapshot().analytics.error, null);
    for (const snapshot of switchedSnapshots) {
      assert.notEqual(snapshot.overview.windows[0]?.usedPercent, 11, 'No published post-switch state retains account A limits');
      assert.ok(snapshot.analytics.daily.every(bucket => bucket.tokens !== 1111), 'No published post-switch state retains account A analytics');
      assert.ok(snapshot.history.data.every(day => day.attribution.every(item => item.value !== 11)), 'No published post-switch state retains account A history');
    }
  } finally { unsubscribe(); }
});

test('history: obsolete period responses cannot overwrite the selected range and foreign-account cache never survives failure', async () => {
  let pending;
  let account = 'account-a';
  let failing = false;
  const h = await backend({ getAuth: async () => ({ auth: { apiKey: secret, headers: { 'chatgpt-account-id': account } } }), historyFetch: url => {
    if (failing) return response({}, 503);
    if (new URL(url).searchParams.get('start_date') === '2026-09-28') return new Promise(resolve => { pending = resolve; });
    return response(body());
  } });
  await open(h);
  const refreshHistory = rangeMethod(h);
  const obsolete = refreshHistory({ startDate: '2026-09-28', endDate: '2026-10-27' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof pending, 'function', 'Old period request reached the real fetch boundary');
  await refreshHistory({ startDate: '2026-10-14', endDate: '2026-10-20' });
  pending(response({ units: 'percent', data: [{ date: '2026-10-01', attribution: [row(88)] }] }));
  await obsolete;
  assert.equal(history(h).startDate, '2026-10-14');
  assert.equal(history(h).endDate, '2026-10-20');
  assert.doesNotMatch(JSON.stringify(history(h)), /88/);
  account = 'account-b';
  failing = true;
  await refreshHistory({ startDate: '2026-10-14', endDate: '2026-10-20' });
  assert.deepEqual(history(h).data, [], 'Account A cached history cannot become account B stale history');
  assert.match(history(h).error, /unavailable/i);
});

test('history: history-only requests reject lost OAuth or official origin before dispatch', async () => {
  const h = await backend();
  await open(h);
  const refreshHistory = rangeMethod(h);
  const before = h.requests.length;
  await assert.rejects(() => refreshHistory({ startDate: '2026-02-30', endDate: '2026-10-27' }), /invalid/i);
  await assert.rejects(() => refreshHistory({ startDate: '2026-10-27', endDate: '2026-10-21' }), /invalid/i);
  assert.equal(h.requests.length, before, 'Invalid calendar dates or reversed windows never reach the network');
  h.ctx.modelRegistry.isUsingOAuth = () => false;
  assert.equal((await refreshHistory(latest(timestamp, 7))).verified, false);
  assert.equal(h.requests.length, before);
  assert.deepEqual(history(h).data, []);
  h.ctx.modelRegistry.isUsingOAuth = () => true;
  h.ctx.modelRegistry.getProvider = () => ({ baseUrl: 'https://attacker.invalid' });
  assert.equal((await refreshHistory(latest(timestamp, 30))).verified, false);
  assert.equal(h.requests.length, before);
});

