import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response, usage, analytics, endpoint, analyticsEndpoint, messagesPath, messages, pluginsPath, skillsPath, plugins, skills, resetCreditsPath, resetHistoryPath, resetCredits, resetHistory, secret, timestamp } from './helpers.js';

const historyPath = '/backend-api/wham/usage/daily-token-usage-breakdown';
const range30 = { startDate: '2026-09-28', endDate: '2026-10-27' };
const range7 = { startDate: '2026-10-21', endDate: '2026-10-27' };
const past = { startDate: '2026-10-14', endDate: '2026-10-20' };
const definitions = [
  { key: 'plugins', path: pluginsPath, method: 'refreshPlugins', rows: 'plugin_usage_overviews', fixture: plugins, limit: 'top_plugin_limit' },
  { key: 'skills', path: skillsPath, method: 'refreshSkills', rows: 'skill_usage_overviews', fixture: skills, limit: 'top_skill_limit' },
];
const historyBody = count => ({ units: 'percent', data: [{ date: '2026-10-26', attribution: [{ model: 'gpt-6.1-sol', value: count }] }] });
const marked = (definition, count, date = '2026-10-26') => {
  const body = structuredClone(definition.fixture);
  body.data[0].date = date;
  body.data[0][definition.rows][0].invocation_counts = count;
  return body;
};
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const backend = options => harness({ ...options, fetch: (url, init) => {
  const path = new URL(url).pathname;
  assert.ok([new URL(endpoint).pathname, new URL(analyticsEndpoint).pathname, historyPath, messagesPath, pluginsPath, skillsPath, resetCreditsPath, resetHistoryPath].includes(path), 'Only eight approved sources');
  if (path === resetCreditsPath) return response(resetCredits);
  if (path === resetHistoryPath) return response(resetHistory);
  if (options?.fetchSource) return options.fetchSource(url, init);
  if (String(url) === endpoint) return response(usage);
  if (String(url) === analyticsEndpoint) return response(analytics);
  if (path === historyPath) return response(historyBody(3));
  if (path === messagesPath) return response(messages);
  const definition = definitions.find(item => item.path === path);
  return options?.toolsFetch?.(definition, url, init) ?? response(definition.fixture);
} });
const open = async h => { await h.fire('session_start'); await h.detailsService().refresh(); };
const report = (h, key) => { assert.ok(h.snapshot()[key], `Public report exposes independent ${key} card`); return h.snapshot()[key]; };
const refreshCard = (h, definition) => {
  assert.equal(typeof h.detailsService()[definition.method], 'function', `Public service exposes ${definition.method}`);
  return range => h.detailsService()[definition.method](range);
};

test('tools: public defaults fetch thirty inclusive local days from both top-ten sources while compact stays two-source', async () => {
  const h = await backend({ now: new Date(2027, 0, 1, 0, 15).getTime() });
  await open(h);
  assert.equal(h.requests.length, 8, 'Full report reads exactly eight approved sources');
  for (const definition of definitions) {
    const matching = h.requests.filter(request => new URL(request.url).pathname === definition.path);
    assert.equal(matching.length, 1);
    const { url, init } = matching[0];
    assert.equal(new URL(url).origin, 'https://chatgpt.com');
    assert.deepEqual(Object.fromEntries(new URL(url).searchParams), { start_date: '2026-12-03', end_date: '2027-01-01', group_by: 'day', workspace_user: 'true', [definition.limit]: '10' });
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${secret}`);
    assert.equal(new Headers(init.headers).get('chatgpt-account-id'), 'test-account');
    assert.deepEqual([report(h, definition.key).startDate, report(h, definition.key).endDate], ['2026-12-03', '2027-01-01']);
  }
  const before = h.requests.length;
  await h.command();
  await [...h.timers.values()][0].callback();
  assert.equal(h.requests.length, before + 4, 'Compact command and tick each fetch only limits/profile');
  assert.ok(h.requests.slice(before).every(request => [endpoint, analyticsEndpoint].includes(request.url)));
});

test('tools: public whitelist keeps safe names, count zero/null and source freshness while dropping IDs and unproved fields', async () => {
  const h = await backend({ toolsFetch: definition => {
    const body = marked(definition, 0);
    const first = body.data[0][definition.rows][0];
    Object.assign(first, { plugin_id: 'PRIVATE_PLUGIN_ID', skill_ids: [{ private: 'PRIVATE_SKILL_ID' }], tokens: 999, user_id: 'PRIVATE_USER' });
    body.data[0][definition.rows].push({ ...first, [definition.key === 'plugins' ? 'plugin_name' : 'skill_name']: 'unknown-count', invocation_counts: null });
    body.data[0][definition.rows].push({ ...first, [definition.key === 'plugins' ? 'plugin_name' : 'skill_name']: 'missing-count', invocation_counts: undefined });
    body.private = 'PRIVATE_TOP';
    return response(body);
  } });
  await open(h);
  for (const definition of definitions) {
    const card = report(h, definition.key);
    const first = structuredClone(definition.fixture.data[0][definition.rows][0]);
    first.invocation_counts = 0;
    const name = definition.key === 'plugins' ? 'plugin_name' : 'skill_name';
    assert.deepEqual(card.data[0][definition.rows], [first, { ...first, [name]: 'unknown-count', invocation_counts: null }, { ...first, [name]: 'missing-count', invocation_counts: null }]);
    assert.equal(card.dataAsOf, Date.parse(definition.fixture.data_freshness_ts));
    assert.equal(card.updatedAt, timestamp);
    assert.doesNotMatch(JSON.stringify(card), /PRIVATE|plugin_id|skill_ids|user_id|tokens|999|TEST_ONLY/);
  }
});

test('tools: malformed counts/dates and HTTP/timeout failures retain only same-card same-range cache; empty stays empty', async () => {
  for (const definition of definitions) {
    let current = definition.fixture;
    let failure;
    const h = await backend({ requestTimeoutMs: 25, toolsFetch: item => item.key !== definition.key ? response(item.fixture) : failure === 'timeout' ? new Promise(() => {}) : failure === 'http' ? response({}, 503) : response(current) });
    await open(h);
    const initial = structuredClone(report(h, definition.key));
    for (const count of [-1, 1.5, '2']) {
      current = marked(definition, count);
      await h.detailsService().refresh();
      assert.deepEqual(report(h, definition.key).data, initial.data);
      assert.equal(report(h, definition.key).stale, true);
      assert.match(report(h, definition.key).error, /unavailable/i);
    }
    current = marked(definition, 5, '2026-02-30');
    await h.detailsService().refresh();
    assert.equal(report(h, definition.key).stale, true);
    for (failure of ['http', 'timeout']) {
      await h.detailsService().refresh();
      assert.deepEqual(report(h, definition.key).data, initial.data);
      assert.equal(report(h, definition.key).updatedAt, initial.updatedAt);
      const other = definitions.find(item => item.key !== definition.key);
      assert.equal(report(h, other.key).stale, false);
      assert.equal(h.snapshot().messages.stale, false);
    }
    await refreshCard(h, definition)(past);
    assert.deepEqual(report(h, definition.key).data, [], 'Unfetched periods cannot borrow cached rows');
    failure = undefined;
    current = { group_by: 'day', data: [] };
    await refreshCard(h, definition)(past);
    assert.equal(report(h, definition.key).error, null);
    assert.deepEqual(report(h, definition.key).data, []);
    assert.equal(report(h, definition.key).dataAsOf, null, 'Absent source freshness is unknown');
  }
});

test('tools: card-only ranges preserve other cards and reject invalid dates or unverified auth before dispatch', async () => {
  const h = await backend();
  await open(h);
  const previousHistory = structuredClone(h.snapshot().history);
  const previousMessages = structuredClone(h.snapshot().messages);
  for (const definition of definitions) {
    const refresh = refreshCard(h, definition);
    const before = h.requests.length;
    assert.equal((await refresh(range7)).verified, true);
    assert.equal(h.requests.length, before + 1);
    assert.equal(new URL(h.requests.at(-1).url).pathname, definition.path);
    assert.equal(report(h, definition.key).startDate, range7.startDate);
    for (const invalid of [{ startDate: '2026-02-30', endDate: range7.endDate }, { startDate: range7.endDate, endDate: range7.startDate }]) await assert.rejects(() => refresh(invalid), /invalid/i);
    assert.equal(h.requests.length, before + 1);
  }
  assert.deepEqual(h.snapshot().history, previousHistory);
  assert.deepEqual(h.snapshot().messages, previousMessages);
  const before = h.requests.length;
  h.ctx.modelRegistry.getProvider = () => ({ baseUrl: 'https://attacker.invalid' });
  assert.equal((await refreshCard(h, definitions[0])(past)).verified, false);
  assert.equal(h.requests.length, before);
  for (const key of ['history', 'messages', 'plugins', 'skills']) assert.deepEqual(h.snapshot()[key].data, []);
});

test('tools: replacement Plugins publishes first and a late full refresh still publishes unaffected Skills/History/Messages', async () => {
  let hold = false;
  const pending = new Map([endpoint, analyticsEndpoint, historyPath, messagesPath, pluginsPath, skillsPath].map(path => [path, deferred()]));
  const h = await backend({ fetchSource: url => {
    const path = new URL(url).pathname;
    if (hold) {
      if (path === pluginsPath && new URL(url).searchParams.get('start_date') === past.startDate) return response(marked(definitions[0], 23, '2026-10-19'));
      return pending.get([endpoint, analyticsEndpoint].includes(String(url)) ? String(url) : path).promise;
    }
    if (String(url) === endpoint) return response(usage);
    if (String(url) === analyticsEndpoint) return response(analytics);
    if (path === historyPath) return response(historyBody(3));
    if (path === messagesPath) return response(messages);
    return response(definitions.find(item => item.path === path).fixture);
  } });
  await open(h);
  const refresh = refreshCard(h, definitions[0]);
  hold = true;
  const published = [];
  const unsubscribe = h.detailsService().state.subscribe(next => published.push(structuredClone(next)));
  const full = h.detailsService().refresh({ historyRange: range7, messagesRange: range7, pluginsRange: range30, skillsRange: range30 });
  await turn();
  try {
    await refresh(past);
    assert.equal(report(h, 'plugins').data[0]?.plugin_usage_overviews[0]?.invocation_counts, 23);
    const nextLimits = structuredClone(usage); nextLimits.rate_limit.primary_window.used_percent = 31;
    const nextProfile = structuredClone(analytics); nextProfile.stats.daily_usage_buckets = [{ start_date: '2026-10-26', tokens: 321 }];
    pending.get(endpoint).resolve(response(nextLimits));
    pending.get(analyticsEndpoint).resolve(response(nextProfile));
    pending.get(historyPath).resolve(response(historyBody(37)));
    const nextMessages = structuredClone(messages); nextMessages.data[0].totals.turns = 39;
    pending.get(messagesPath).resolve(response(nextMessages));
    pending.get(skillsPath).resolve(response(marked(definitions[1], 41)));
    pending.get(pluginsPath).resolve(response(marked(definitions[0], 99)));
    await full;
    assert.ok(published.some(state => state.overview.windows[0]?.usedPercent === 31 && state.analytics.daily[0]?.tokens === 321 && state.history.data[0]?.attribution[0]?.value === 37 && state.messages.data[0]?.totals.turns === 39 && state.skills.data[0]?.skill_usage_overviews[0]?.invocation_counts === 41), 'Unchanged cards and metrics publish without waiting for another tick');
    assert.equal(report(h, 'plugins').startDate, past.startDate);
    assert.equal(report(h, 'plugins').data[0]?.plugin_usage_overviews[0]?.invocation_counts, 23, 'Obsolete full-refresh Plugins result is suppressed');
  } finally { for (const work of pending.values()) work.resolve(response({ data: [] })); unsubscribe(); }
});

test('tools: public account changes hydrate all six even after compact discovers B and never publish late A tools', async () => {
  for (const compactFirst of [false, true]) {
    let account = 'account-a';
    let hold = false;
    const old = deferred();
    const h = await backend({ getAuth: async () => ({ auth: { apiKey: secret, headers: { 'chatgpt-account-id': account } } }), fetchSource: (url, init) => {
      const path = new URL(url).pathname;
      const first = new Headers(init.headers).get('chatgpt-account-id') === 'account-a';
      const marker = first ? 11 : 22;
      if (hold && first && [pluginsPath, skillsPath].includes(path)) return old.promise;
      if (String(url) === endpoint) { const body = structuredClone(usage); body.rate_limit.primary_window.used_percent = marker; return response(body); }
      if (String(url) === analyticsEndpoint) { const body = structuredClone(analytics); body.stats.daily_usage_buckets = [{ start_date: '2026-10-26', tokens: marker }]; return response(body); }
      if (path === historyPath) return response(historyBody(marker));
      if (path === messagesPath) { const body = structuredClone(messages); body.data[0].totals.turns = marker; return response(body); }
      return response(marked(definitions.find(item => item.path === path), marker));
    } });
    await open(h);
    for (const definition of definitions) assert.equal(report(h, definition.key).data[0]?.[definition.rows][0]?.invocation_counts, 11);
    hold = true;
    const aPlugins = refreshCard(h, definitions[0])(range7);
    const aSkills = refreshCard(h, definitions[1])(range7);
    await turn();
    account = 'account-b';
    if (compactFirst) await h.command();
    const published = [];
    const unsubscribe = h.detailsService().state.subscribe(next => published.push(structuredClone(next)));
    const before = h.requests.length;
    try {
      assert.equal((await refreshCard(h, definitions[0])(range30)).verified, true);
      assert.equal(h.requests.length, before + 8, 'First public B refresh hydrates every source');
      for (const definition of definitions) assert.equal(report(h, definition.key).data[0]?.[definition.rows][0]?.invocation_counts, 22);
      assert.equal(h.snapshot().overview.windows[0]?.usedPercent, 22);
      assert.equal(h.snapshot().history.data[0]?.attribution[0]?.value, 22);
      assert.equal(h.snapshot().messages.data[0]?.totals.turns, 22);
      old.resolve(response(marked(definitions[0], 11)));
      await Promise.all([aPlugins, aSkills]);
      for (const state of published) for (const definition of definitions) assert.ok(state[definition.key].data.every(day => day[definition.rows].every(row => row.invocation_counts !== 11)), 'No foreign tool cache is published');
    } finally { old.resolve(response({ data: [] })); unsubscribe(); }
  }
});
