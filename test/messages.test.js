import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response, usage, analytics, endpoint, analyticsEndpoint, messagesPath, messages, secret, timestamp } from './helpers.js';

const historyPath = '/backend-api/wham/usage/daily-token-usage-breakdown';
const historyBody = marker => ({ units: 'percent', data: [{ date: '2026-10-26', attribution: [{ model: 'gpt-6.1-sol', value: marker }] }] });
const counts = marker => ({ data: [{ date: '2026-10-26', totals: { turns: marker }, models: [{ model: 'gpt-6.1-sol', turns: marker }], clients: [{ client_id: 'CODEX_CLI', turns: marker }] }] });
const range7 = { startDate: '2026-10-21', endDate: '2026-10-27' };
const range30 = { startDate: '2026-09-28', endDate: '2026-10-27' };
const past = { startDate: '2026-10-14', endDate: '2026-10-20' };
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const backend = options => harness({ ...options, fetch: (url, init) => {
  const path = new URL(url).pathname;
  assert.ok([new URL(endpoint).pathname, new URL(analyticsEndpoint).pathname, historyPath, messagesPath].includes(path), 'Only the four approved GET sources');
  if (options?.fetchSource) return options.fetchSource(url, init);
  if (String(url) === endpoint) return response(usage);
  if (String(url) === analyticsEndpoint) return response(analytics);
  if (path === historyPath) return options?.historyFetch?.(url, init) ?? response(historyBody(3));
  return options?.messagesFetch?.(url, init) ?? response(messages);
} });
const open = async h => { await h.fire('session_start'); await h.detailsService().refresh(); };
const report = h => { assert.ok(h.snapshot().messages, 'Public report exposes independent Messages data'); return h.snapshot().messages; };
const refreshMessages = h => { assert.equal(typeof h.detailsService().refreshMessages, 'function', 'Public details service exposes Messages-only range refresh'); return range => h.detailsService().refreshMessages(range); };
const requests = h => h.requests.filter(request => new URL(request.url).pathname === messagesPath);

test('messages: full refresh publishes unaffected sections after a replacement Messages range finishes first', async () => {
  let hold = false;
  const limits = deferred();
  const profile = deferred();
  const history = deferred();
  const oldMessages = deferred();
  const h = await backend({ fetchSource: url => {
    const path = new URL(url).pathname;
    if (String(url) === endpoint) return hold ? limits.promise : response(usage);
    if (String(url) === analyticsEndpoint) return hold ? profile.promise : response(analytics);
    if (path === historyPath) return hold ? history.promise : response(historyBody(3));
    if (!hold) return response(messages);
    if (new URL(url).searchParams.get('start_date') === past.startDate) return response({ data: [{ ...counts(23).data[0], date: '2026-10-19' }] });
    return oldMessages.promise;
  } });
  await open(h);
  const published = [];
  const unsubscribe = h.detailsService().state.subscribe(next => published.push(structuredClone(next)));
  hold = true;
  const before = h.requests.length;
  const full = h.detailsService().refresh();
  await turn();
  assert.equal(h.requests.length, before + 4, 'All full-refresh sources reached fetch before range replacement');
  try {
    await refreshMessages(h)(past);
    assert.equal(report(h).data[0]?.totals.turns, 23, 'Replacement publishes before the unaffected pending sources');
    const nextLimits = structuredClone(usage);
    nextLimits.rate_limit.primary_window.used_percent = 31;
    const nextProfile = structuredClone(analytics);
    nextProfile.stats.daily_usage_buckets = [{ start_date: '2026-10-26', tokens: 321 }];
    limits.resolve(response(nextLimits));
    profile.resolve(response(nextProfile));
    history.resolve(response(historyBody(37)));
    oldMessages.resolve(response(counts(99)));
    await full;
    assert.ok(published.some(state => state.overview.windows[0]?.usedPercent === 31
      && state.analytics.daily[0]?.tokens === 321
      && state.history.data[0]?.attribution[0]?.value === 37), 'Subscribers receive all unaffected full-refresh successes without another refresh');
    assert.equal(h.snapshot().overview.windows[0]?.usedPercent, 31);
    assert.equal(h.snapshot().analytics.daily[0]?.tokens, 321);
    assert.equal(h.snapshot().history.data[0]?.attribution[0]?.value, 37);
    assert.equal(report(h).startDate, past.startDate);
    assert.equal(report(h).data[0]?.totals.turns, 23, 'Obsolete Messages result cannot overwrite replacement');
  } finally {
    limits.resolve(response(usage)); profile.resolve(response(analytics)); history.resolve(response(historyBody(3))); oldMessages.resolve(response(messages));
    unsubscribe();
  }
});

test('messages: public source uses seven inclusive host-local days and Pi OAuth; compact stays two-source', async () => {
  const h = await backend({ now: new Date(2027, 0, 1, 0, 15).getTime() });
  await open(h);
  assert.equal(requests(h).length, 1, 'Public refresh reads Messages exactly once');
  const request = requests(h)[0];
  const url = new URL(request.url);
  assert.equal(url.origin, 'https://chatgpt.com');
  assert.deepEqual(Object.fromEntries(url.searchParams), { start_date: '2026-12-26', end_date: '2027-01-01', group_by: 'day', workspace_user: 'true' });
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'error');
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${secret}`);
  assert.equal(headers.get('chatgpt-account-id'), 'test-account');
  assert.deepEqual([report(h).startDate, report(h).endDate], ['2026-12-26', '2027-01-01']);
  const before = h.requests.length;
  await h.command();
  await [...h.timers.values()][0].callback();
  assert.equal(h.requests.length, before + 4, 'Compact command and tick each read exactly limits and profile');
  assert.equal(requests(h).length, 1, 'Compact never polls Messages');
});

test('messages: count whitelist preserves null and zero, rejects invalid counts/dates independently, and accepts empty data', async () => {
  const payload = { private: 'PRIVATE_TOP', data: [{ date: '2026-10-26', thread_id: 'PRIVATE_THREAD', totals: { turns: 9, users: 111, text_total_tokens: 999 },
    models: [{ model: 'gpt-6.1-sol', turns: 7, credits: 333 }, { model: 'other', turns: 0 }, { model: 'codex-auto-review', turns: null }, { model: 'future-model' }],
    clients: [{ client_id: 'CODEX_CLI', turns: 0, users: 222 }, { client_id: 'CODEX_WEB', turns: null }] }] };
  let current = payload;
  const h = await backend({ messagesFetch: () => response(current) });
  await open(h);
  const normalized = report(h);
  assert.deepEqual(normalized.data, [{ date: '2026-10-26', totals: { turns: 9 }, models: [
    { model: 'gpt-6.1-sol', turns: 7 }, { model: 'other', turns: 0 }, { model: 'codex-auto-review', turns: null }, { model: 'future-model', turns: null },
  ], clients: [{ client_id: 'CODEX_CLI', turns: 0 }, { client_id: 'CODEX_WEB', turns: null }] }]);
  assert.equal(normalized.dataAsOf, null);
  assert.equal(normalized.updatedAt, timestamp);
  assert.doesNotMatch(JSON.stringify(normalized), /PRIVATE|users|tokens|credits|999|333|222|111|TEST_ONLY/);
  for (const invalid of [-1, 1.5, '3']) {
    current = counts(invalid);
    await h.detailsService().refresh();
    assert.equal(report(h).stale, true, 'Malformed counts cannot replace known data');
    assert.equal(report(h).data[0].totals.turns, 9);
    assert.match(report(h).error, /messages.*unavailable/i);
    assert.equal(h.snapshot().history.error, null);
  }
  current = { data: [{ ...counts(1).data[0], date: '2026-02-30' }] };
  await h.detailsService().refresh();
  assert.equal(report(h).stale, true);
  current = { data: [] };
  await h.detailsService().refresh();
  assert.deepEqual(report(h).data, []);
  assert.equal(report(h).error, null, 'Empty is valid and is not a fabricated zero day');
});

test('messages: same-range HTTP/timeout failures retain only Messages cache, new ranges cannot borrow it', async () => {
  for (const failure of ['http', 'timeout']) {
    let fail = false;
    const h = await backend({ requestTimeoutMs: 25, messagesFetch: () => !fail ? response(messages) : failure === 'http' ? response({}, 503) : new Promise(() => {}) });
    await open(h);
    const previous = structuredClone(report(h));
    fail = true;
    await h.detailsService().refresh();
    assert.deepEqual(report(h).data, previous.data);
    assert.equal(report(h).updatedAt, previous.updatedAt);
    assert.equal(report(h).stale, true);
    assert.match(report(h).error, /messages.*unavailable/i);
    assert.equal(h.snapshot().overview.stale, false);
    assert.equal(h.snapshot().history.stale, false);
    await refreshMessages(h)(past);
    assert.deepEqual(report(h).data, [], 'An unfetched period cannot show the previous period as stale');
    assert.equal(h.snapshot().history.data[0].attribution[0].value, 3);
  }
});

test('messages: same-account ranges fetch only their card and invalid range/auth dispatch nothing', async () => {
  let reads = 0;
  const h = await backend({ getAuth: async () => { reads++; return { auth: { apiKey: secret, headers: { 'chatgpt-account-id': 'test-account' } } }; } });
  await open(h);
  const refresh = refreshMessages(h);
  let before = h.requests.length;
  assert.equal((await refresh(range30)).verified, true);
  assert.equal(h.requests.length, before + 1);
  assert.equal(reads, 2);
  assert.equal(new URL(h.requests.at(-1).url).pathname, messagesPath);
  assert.deepEqual([report(h).startDate, report(h).endDate], [range30.startDate, range30.endDate]);
  assert.deepEqual([h.snapshot().history.startDate, h.snapshot().history.endDate], [range7.startDate, range7.endDate]);
  before = h.requests.length;
  for (const range of [{ startDate: '2026-02-30', endDate: '2026-10-27' }, { startDate: '2026-10-27', endDate: '2026-10-21' }]) await assert.rejects(() => refresh(range), /invalid/i);
  assert.equal(h.requests.length, before);
  h.ctx.modelRegistry.isUsingOAuth = () => false;
  assert.equal((await refresh(range7)).verified, false);
  assert.equal(h.requests.length, before);
  for (const key of ['history', 'messages']) assert.deepEqual(h.snapshot()[key].data, []);
  assert.deepEqual(h.snapshot().overview.windows, []);
  h.ctx.modelRegistry.isUsingOAuth = () => true;
  h.ctx.modelRegistry.getProvider = () => ({ baseUrl: 'https://attacker.invalid' });
  assert.equal((await refresh(range7)).verified, false);
  assert.equal(h.requests.length, before);
});

test('messages: independent History/Messages requests survive reversed completion and a full tick without losing either intent', async () => {
  const pendingHistory = deferred();
  const pendingMessages = deferred();
  let hold = false;
  const h = await backend({ historyFetch: () => hold ? pendingHistory.promise : response(historyBody(3)), messagesFetch: () => hold ? pendingMessages.promise : response(messages) });
  await open(h);
  const refresh = refreshMessages(h);
  hold = true;
  const historyWork = h.detailsService().refreshHistory(range30);
  const messagesWork = refresh(past);
  const tick = h.detailsService().refresh({ historyRange: range30, messagesRange: past });
  await turn();
  pendingMessages.resolve(response({ data: [{ ...counts(17).data[0], date: '2026-10-19' }] }));
  await turn();
  pendingHistory.resolve(response(historyBody(19)));
  await Promise.all([historyWork, messagesWork, tick]);
  assert.deepEqual([report(h).startDate, report(h).endDate], [past.startDate, past.endDate]);
  assert.equal(report(h).data[0]?.totals.turns, 17);
  assert.equal(h.snapshot().history.startDate, range30.startDate);
  assert.equal(h.snapshot().history.data[0]?.attribution[0]?.value, 19);
  assert.equal(report(h).error, null);
  assert.equal(h.snapshot().history.error, null);
});

test('messages: public account switches hydrate all four sources, including after compact discovers B; late A results cannot publish', async () => {
  for (const compactFirst of [false, true]) {
    let account = 'account-a';
    let holdA = false;
    const lateA = deferred();
    const h = await backend({ getAuth: async () => ({ auth: { apiKey: secret, headers: { 'chatgpt-account-id': account } } }), fetchSource: (url, init) => {
      const requestAccount = new Headers(init.headers).get('chatgpt-account-id');
      const marker = requestAccount === 'account-a' ? 11 : 22;
      const path = new URL(url).pathname;
      if (holdA && requestAccount === 'account-a' && [historyPath, messagesPath].includes(path)) return lateA.promise;
      if (String(url) === endpoint) { const body = structuredClone(usage); body.rate_limit.primary_window.used_percent = marker; return response(body); }
      if (String(url) === analyticsEndpoint) { const body = structuredClone(analytics); body.stats.daily_usage_buckets = [{ start_date: '2026-10-26', tokens: marker }]; return response(body); }
      return response(path === historyPath ? historyBody(marker) : counts(marker));
    } });
    await open(h);
    const refresh = refreshMessages(h);
    assert.equal(report(h).data[0].totals.turns, 11);
    holdA = true;
    const oldHistory = h.detailsService().refreshHistory(range30);
    const oldMessages = refresh(range30);
    await turn();
    account = 'account-b';
    if (compactFirst) await h.command();
    const published = [];
    const unsubscribe = h.detailsService().state.subscribe(next => published.push(structuredClone(next)));
    const before = h.requests.length;
    try {
      assert.equal((await refresh(range7)).verified, true);
      assert.deepEqual(h.requests.slice(before).map(r => new URL(r.url).pathname).sort(), [messagesPath, new URL(analyticsEndpoint).pathname, new URL(endpoint).pathname, historyPath].sort(), 'First public refresh hydrates all four B sections immediately');
      assert.equal(h.snapshot().overview.windows[0]?.usedPercent, 22);
      assert.equal(h.snapshot().analytics.daily[0]?.tokens, 22);
      assert.equal(h.snapshot().history.data[0]?.attribution[0]?.value, 22);
      assert.equal(report(h).data[0]?.totals.turns, 22);
      lateA.resolve(response(counts(11)));
      await Promise.all([oldHistory, oldMessages]);
      for (const state of published) {
        assert.notEqual(state.overview.windows[0]?.usedPercent, 11);
        assert.ok(state.analytics.daily.every(day => day.tokens !== 11));
        assert.ok(state.history.data.every(day => day.attribution.every(row => row.value !== 11)));
        assert.ok(state.messages.data.every(day => day.totals.turns !== 11));
      }
    } finally { lateA.resolve(response(counts(11))); unsubscribe(); }
  }
});
