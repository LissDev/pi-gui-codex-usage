import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response, usage, analytics, endpoint, analyticsEndpoint, messagesPath, messages, pluginsPath, skillsPath, plugins, skills, resetCreditsPath, resetHistoryPath, resetCredits, resetHistory, secret, timestamp } from './helpers.js';

const historyPath = '/backend-api/wham/usage/daily-token-usage-breakdown';
const definitions = [{ key: 'resetCredits', path: resetCreditsPath, fixture: resetCredits }, { key: 'resetHistory', path: resetHistoryPath, fixture: resetHistory }];
const safeCredit = () => ({ ...resetCredits.credits[0], granted_at: Date.parse(resetCredits.credits[0].granted_at), expires_at: Date.parse(resetCredits.credits[0].expires_at) });
const historyBody = marker => ({ units: 'percent', data: [{ date: '2026-10-26', attribution: [{ model: 'gpt-6.1-sol', value: marker }] }] });
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const backend = options => harness({ ...options, fetch: (url, init) => {
  const path = new URL(url).pathname;
  assert.ok([new URL(endpoint).pathname, new URL(analyticsEndpoint).pathname, historyPath, messagesPath, pluginsPath, skillsPath, resetCreditsPath, resetHistoryPath].includes(path), 'Only eight approved GET sources');
  if (options?.fetchSource) return options.fetchSource(url, init);
  if (String(url) === endpoint) return response(usage);
  if (String(url) === analyticsEndpoint) return response(analytics);
  if (path === historyPath) return response(historyBody(3));
  if (path === messagesPath) return response(messages);
  if (path === pluginsPath) return response(plugins);
  if (path === skillsPath) return response(skills);
  const definition = definitions.find(item => item.path === path);
  return options?.resetsFetch?.(definition, url, init) ?? response(definition.fixture);
} });
const open = async h => { await h.fire('session_start'); await h.detailsService().refresh(); };
const report = (h, key) => { assert.ok(h.snapshot()[key], `Public report exposes ${key} independently`); return h.snapshot()[key]; };

test('resets: impossible calendar dates in granted or expiry timestamps retain stale valid credits without affecting History', async () => {
  let credits = structuredClone(resetCredits);
  let eventKind = 'initial_event';
  const h = await backend({ resetsFetch: definition => response(definition.key === 'resetCredits' ? credits : {
    ...resetHistory, events: [{ ...resetHistory.events[0], kind: eventKind }],
  }) });
  await open(h);
  const previous = structuredClone(report(h, 'resetCredits'));
  for (const field of ['granted_at', 'expires_at']) {
    credits = structuredClone(resetCredits);
    credits.credits[0][field] = '2026-02-30T12:00:00Z';
    eventKind = `successful_${field}_refresh`;
    await h.detailsService().refresh();
    const retained = report(h, 'resetCredits');
    assert.equal(retained.stale, true, 'Impossible calendar dates must fail the credit source before fresh promotion');
    assert.match(retained.error, /unavailable/i);
    assert.deepEqual(retained.credits, previous.credits, 'Date.parse normalization cannot invent a replacement grant/expiry date');
    assert.equal(retained.updatedAt, previous.updatedAt);
    assert.equal(report(h, 'resetHistory').events[0].kind, eventKind, 'Unaffected History still publishes its successful refresh');
    assert.equal(report(h, 'resetHistory').stale, false);
    assert.equal(h.snapshot().overview.stale, false);
  }
});

test('resets: impossible calendar event and history metadata timestamps retain stale valid History without affecting credits', async () => {
  let history = structuredClone(resetHistory);
  let available = 5;
  const h = await backend({ resetsFetch: definition => response(definition.key === 'resetHistory' ? history : {
    ...resetCredits, available_count: available,
  }) });
  await open(h);
  const previous = structuredClone(report(h, 'resetHistory'));
  for (const field of ['occurred_at', 'as_of', 'window_start']) {
    history = structuredClone(resetHistory);
    if (field === 'occurred_at') history.events[0][field] = '2026-02-30T12:00:00Z';
    else history[field] = '2026-02-30T12:00:00Z';
    available++;
    await h.detailsService().refresh();
    const retained = report(h, 'resetHistory');
    assert.equal(retained.stale, true, 'Impossible calendar timestamps must fail History before fresh promotion');
    assert.match(retained.error, /unavailable/i);
    assert.deepEqual(retained.events, previous.events);
    assert.equal(retained.dataAsOf, previous.dataAsOf);
    assert.equal(retained.window_start, previous.window_start, 'No normalized impossible date is promoted into the source window');
    assert.equal(retained.updatedAt, previous.updatedAt);
    assert.equal(report(h, 'resetCredits').available_count, available, 'Unaffected credits still publish the successful source response');
    assert.equal(report(h, 'resetCredits').stale, false);
    assert.equal(h.snapshot().overview.stale, false);
  }
});

test('resets: two public-only GET sources expose authoritative counts, safe credit/event fields and distinct source freshness', async () => {
  const h = await backend({ resetsFetch: definition => {
    const body = structuredClone(definition.fixture);
    if (definition.key === 'resetCredits') {
      Object.assign(body, { immediate_reset_purchase_eligible: true, history_enabled: false, private: 'PRIVATE_ROOT' });
      Object.assign(body.credits[0], { id: 'PRIVATE_CREDIT_ID', profile_image_url: 'https://private.invalid/avatar', profile_user_id: 'PRIVATE_PERSON', redeem_started_at: null, redeemed_at: null });
    } else Object.assign(body.events[0], { id: 'PRIVATE_EVENT_ID', profile_user_id: 'PRIVATE_PERSON' });
    return response(body);
  } });
  await open(h);
  assert.equal(h.requests.length, 8, 'Public full refresh reads exactly eight sources');
  for (const definition of definitions) {
    const matching = h.requests.filter(request => new URL(request.url).pathname === definition.path);
    assert.equal(matching.length, 1);
    const { url, init } = matching[0];
    assert.equal(new URL(url).origin, 'https://chatgpt.com');
    assert.equal(new URL(url).search, '', 'No invented pagination/window queries');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${secret}`);
    assert.equal(new Headers(init.headers).get('chatgpt-account-id'), 'test-account');
  }
  const available = report(h, 'resetCredits');
  assert.deepEqual(available.credits, [safeCredit()]);
  assert.equal(available.available_count, 5, 'Aggregate is independent of one returned credit row');
  assert.equal(available.total_earned_count, 9);
  assert.equal(available.dataAsOf, null, 'Available source freshness was not supplied');
  assert.equal(available.updatedAt, timestamp);
  const history = report(h, 'resetHistory');
  assert.deepEqual(history.events, [{ kind: 'granted', occurred_at: Date.parse(resetHistory.events[0].occurred_at) }]);
  assert.equal(history.window_start, Date.parse(resetHistory.window_start));
  assert.equal(history.dataAsOf, Date.parse(resetHistory.as_of));
  assert.equal(history.updatedAt, timestamp);
  assert.doesNotMatch(JSON.stringify({ available, history }), /PRIVATE|profile_|user_id|image_url|purchase|history_enabled|next_cursor|redeem|TEST_ONLY/);
  assert.equal(h.snapshot().overview.metrics.find(metric => metric.label === 'Earned resets').value, 2, 'Usage aggregate remains independent');
  assert.equal(h.snapshot().overview.metrics.find(metric => metric.label === 'Applicable earned resets').value, 0);
  const before = h.requests.length;
  await h.command();
  await [...h.timers.values()][0].callback();
  assert.equal(h.requests.length, before + 4);
  assert.ok(h.requests.slice(before).every(request => [endpoint, analyticsEndpoint].includes(request.url)), 'Compact never polls either reset-detail source');
});

test('resets: source failures retain independent last-known data while zero/false, unknown and empty lists stay distinct', async () => {
  for (const definition of definitions) {
    let current;
    let failure;
    const h = await backend({ requestTimeoutMs: 25, resetsFetch: item => {
      if (item.key !== definition.key) return response(item.fixture);
      if (failure === 'http') return response({}, 503);
      if (failure === 'timeout') return new Promise(() => {});
      return response(current ?? item.fixture);
    } });
    await open(h);
    const initial = structuredClone(report(h, definition.key));
    for (failure of ['http', 'timeout', 'malformed']) {
      if (failure === 'malformed') current = definition.key === 'resetCredits' ? { ...resetCredits, available_count: -1 } : { ...resetHistory, events: [{ kind: 'granted', occurred_at: 'not-a-date' }] };
      await h.detailsService().refresh();
      const retained = report(h, definition.key);
      const field = definition.key === 'resetCredits' ? 'credits' : 'events';
      assert.deepEqual(retained[field], initial[field]);
      assert.equal(retained.updatedAt, initial.updatedAt);
      assert.equal(retained.stale, true);
      assert.match(retained.error, /unavailable/i);
      assert.equal(report(h, definition.key === 'resetCredits' ? 'resetHistory' : 'resetCredits').stale, false);
      assert.equal(h.snapshot().overview.stale, false);
      assert.equal(h.snapshot().plugins.stale, false);
    }
    failure = undefined;
    current = definition.key === 'resetCredits' ? { credits: [], available_count: 0, total_earned_count: 0 } : { events: [], window_start: null, as_of: null, next_cursor: null };
    await h.detailsService().refresh();
    assert.equal(report(h, definition.key).error, null);
    assert.deepEqual(report(h, definition.key)[definition.key === 'resetCredits' ? 'credits' : 'events'], []);
    if (definition.key === 'resetCredits') {
      assert.equal(report(h, definition.key).available_count, 0);
      current = { credits: [{ ...resetCredits.credits[0], is_supported_by_plan: null }], available_count: null, total_earned_count: null };
      await h.detailsService().refresh();
      assert.ok(report(h, definition.key).available_count == null, 'Unknown aggregate is never inferred from list size');
      assert.ok(report(h, definition.key).credits[0].is_supported_by_plan == null, 'Unknown plan support is not false');
    } else assert.equal(report(h, definition.key).dataAsOf, null);
  }
});

test('resets: public account switches hydrate all eight after compact discovers B, suppress late A details, and clear on lost OAuth', async () => {
  let account = 'account-a';
  let hold = false;
  const old = deferred();
  const h = await backend({ getAuth: async () => ({ auth: { apiKey: secret, headers: { 'chatgpt-account-id': account } } }), fetchSource: (url, init) => {
    const path = new URL(url).pathname;
    const first = new Headers(init.headers).get('chatgpt-account-id') === 'account-a';
    const marker = first ? 11 : 22;
    if (hold && first && [resetCreditsPath, resetHistoryPath].includes(path)) return old.promise;
    if (String(url) === endpoint) { const body = structuredClone(usage); body.rate_limit.primary_window.used_percent = marker; return response(body); }
    if (String(url) === analyticsEndpoint) return response(analytics);
    if (path === historyPath) return response(historyBody(marker));
    if (path === messagesPath) return response(messages);
    if (path === pluginsPath) return response(plugins);
    if (path === skillsPath) return response(skills);
    if (path === resetCreditsPath) return response({ ...resetCredits, available_count: marker, credits: [{ ...resetCredits.credits[0], title: first ? 'Account A reset' : 'Account B reset' }] });
    return response({ ...resetHistory, events: [{ kind: first ? 'account_a_granted' : 'account_b_granted', occurred_at: resetHistory.events[0].occurred_at }] });
  } });
  await open(h);
  assert.equal(report(h, 'resetCredits').available_count, 11);
  hold = true;
  const oldPublic = h.detailsService().refresh();
  await turn();
  account = 'account-b';
  await h.command();
  const published = [];
  const unsubscribe = h.detailsService().state.subscribe(next => published.push(structuredClone(next)));
  const before = h.requests.length;
  try {
    assert.equal((await h.detailsService().refresh()).verified, true);
    assert.equal(h.requests.length, before + 8, 'Public B refresh immediately hydrates all eight');
    assert.equal(report(h, 'resetCredits').available_count, 22);
    assert.equal(report(h, 'resetHistory').events[0]?.kind, 'account_b_granted');
    assert.equal(h.snapshot().overview.windows[0]?.usedPercent, 22);
    old.resolve(response(resetCredits));
    await oldPublic;
    for (const state of published) {
      assert.notEqual(state.resetCredits.available_count, 11);
      assert.doesNotMatch(JSON.stringify([state.resetCredits, state.resetHistory]), /Account A reset|account_a_granted/);
    }
    const beforeAuthLoss = h.requests.length;
    h.ctx.modelRegistry.isUsingOAuth = () => false;
    assert.equal((await h.detailsService().refresh()).verified, false);
    assert.equal(h.requests.length, beforeAuthLoss);
    assert.deepEqual(report(h, 'resetCredits').credits, []);
    assert.deepEqual(report(h, 'resetHistory').events, []);
    assert.deepEqual(h.snapshot().plugins.data, []);
  } finally { old.resolve(response({ events: [] })); unsubscribe(); }
});
