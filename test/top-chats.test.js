import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response, secret, timestamp } from './helpers.js';

const path = '/backend-api/wham/usage/thread_usage/query_v2';
const uuid = n => `11111111-2222-4333-8444-${String(n).padStart(12, '0')}`;
const privateText = 'PRIVATE_MESSAGE_MUST_NOT_LEAVE_DEVICE';
const session = (n, extra = {}) => ({ id: uuid(n), path: `/PRIVATE_SESSIONS/${n}.jsonl`, cwd: '/PRIVATE_WORKSPACE', name: `Named chat ${n}`, created: new Date(timestamp - 86400000), modified: new Date(timestamp - n * 1000), messageCount: 2, firstMessage: privateText, allMessagesText: privateText, ...extra });
const entries = (provider = 'openai-codex', n = 1) => [
  { type: 'session', id: uuid(n), timestamp: '2026-10-26T17:00:00.000Z' },
  { type: 'message', message: { role: 'user', content: [{ type: 'text', text: privateText }] } },
  { type: 'message', message: { role: 'assistant', provider, model: 'gpt-6.1-sol', content: [{ type: 'text', text: privateText }], usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } } },
  { type: 'model_change', provider: 'anthropic', modelId: 'last-model-is-not-codex' },
];
const thread = (n, extra = {}) => ({ thread_id: uuid(n), data_status: 'available', usage_source: 'included_plan', five_hour_limit_percent: 0.5, weekly_limit_percent: n, balance_usage_credits: '0E-10', groups: [{ model: 'gpt-6.1-sol', reasoning_effort: 'high', speed: 'standard', product_experience: null, five_hour_limit_percent: null, weekly_limit_percent: n, balance_usage_credits: '0.000001' }], ...extra });
const body = threads => ({ comparison_plan: null, data_as_of: '2026-10-27T16:00:00Z', threads });
async function backend({ sessions = [session(1)], readEntries = async file => entries('openai-codex', Number(file.match(/\/(\d+)\.jsonl$/)?.[1] ?? 1)), result = body([thread(1)]), getAuth } = {}) {
  let catalog = sessions;
  let payload = result;
  let catalogFailure = false;
  let reads = 0;
  const h = await harness({ getAuth, services: { sessionCatalog: {
    async listAll() { reads++; if (catalogFailure) throw new Error(privateText); return catalog; }, readEntries,
  } }, routes: { [path]: () => payload instanceof Response ? payload.clone() : response(payload) } });
  return Object.assign(h, {
    setCatalog(next) { catalog = next; }, setPayload(next) { payload = next; }, failCatalog() { catalogFailure = true; }, catalogReads: () => reads,
  });
}
const open = async h => { await h.fire('session_start'); await h.detailsService().refresh(); };
const report = h => { assert.ok(h.snapshot().topChats, 'Public Analytics report exposes Top chats independently'); return h.snapshot().topChats; };
const queries = h => h.requests.filter(request => new URL(request.url).pathname === path);

test('top chats: full refresh batches recent actual Codex sessions privately; compact and card ranges do not enumerate or query', async () => {
  const h = await backend({ sessions: [session(1), session(2, { name: undefined }), session(3, { modified: new Date(timestamp - 31 * 86400000) }), session(4), session(5, { id: 'invalid' }), session(1)], readEntries: async file => entries(file.endsWith('/4.jsonl') ? 'anthropic' : 'openai-codex', Number(file.match(/\/(\d+)\.jsonl$/)[1])), result: body([thread(1), thread(2)]) });
  await h.command();
  assert.equal(h.catalogReads(), 0, 'Compact never scans local sessions');
  await open(h);
  assert.equal(queries(h).length, 1, 'Full public refresh performs one batched thread lookup');
  const request = queries(h)[0];
  assert.equal(request.url, `https://chatgpt.com${path}`);
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.redirect, 'error');
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${secret}`);
  assert.equal(headers.get('chatgpt-account-id'), 'test-account');
  assert.deepEqual(JSON.parse(request.init.body), { threads: [1, 2].map(n => ({ thread_id: uuid(n), created_at: '2026-10-26T17:00:00.000Z', descendant_thread_ids: [] })) });
  const state = report(h);
  assert.equal(state.data.length, 2);
  assert.match(state.data.find(row => row.weeklyLimitPercent === 2).title, /Untitled.*2026/);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_|11111111-2222|firstMessage|allMessagesText/);
  assert.doesNotMatch(request.init.body, /Named chat|PRIVATE_|gpt-|usage/);
  const reads = h.catalogReads();
  await h.detailsService().refreshMessages({ startDate: '2026-09-28', endDate: '2026-10-27' });
  await h.command();
  assert.equal(queries(h).length, 1);
  assert.equal(h.catalogReads(), reads);
});

test('top chats: cap newest distinct sessions at 100 and publish a meaningful empty coverage state without POST', async () => {
  const h = await backend({ sessions: Array.from({ length: 103 }, (_, i) => session(i + 1)), result: body([]) });
  await open(h);
  assert.equal(queries(h).length, 1, 'Recent candidates are looked up in one bounded batch');
  assert.deepEqual(JSON.parse(queries(h)[0].init.body).threads.map(row => row.thread_id), Array.from({ length: 100 }, (_, i) => uuid(i + 1)));
  assert.equal(report(h).coverage.candidates, 100);
  assert.equal(report(h).coverage.limited, true, 'The report discloses that recent eligible sessions exceeded the cap');
  assert.equal(report(h).coverage.matched, 0);
  assert.deepEqual(report(h).data, []);
  h.setCatalog([]);
  await h.detailsService().refresh();
  assert.equal(queries(h).length, 1, 'An empty catalog causes no empty remote query');
  assert.equal(report(h).coverage.candidates, 0);
  assert.equal(report(h).coverage.limited, false);
  assert.equal(report(h).error, null);
});

test('top chats: ranked attribution preserves percentage points, known zero, partial/null and exact tiny credits', async () => {
  const h = await backend({ sessions: [1, 2, 3, 4, 5].map(n => session(n)), result: body([
    thread(2, { data_status: 'partial', weekly_limit_percent: 0, five_hour_limit_percent: null, balance_usage_credits: '0.000001' }),
    thread(1, { weekly_limit_percent: 7.25 }),
    thread(3, { weekly_limit_percent: null, balance_usage_credits: null }),
    thread(4, { data_status: 'unavailable' }), thread(5, { data_status: 'future-status' }), thread(999),
  ]) });
  await open(h);
  const state = report(h);
  assert.deepEqual(state.data.map(row => row.title), ['Named chat 1', 'Named chat 2', 'Named chat 3']);
  assert.deepEqual(state.data.map(row => row.weeklyLimitPercent), [7.25, 0, null]);
  assert.equal(state.data[1].dataStatus, 'partial');
  assert.equal(state.data[1].fiveHourLimitPercent, null);
  assert.equal(Number(state.data[1].balanceUsageCredits), 0.000001);
  assert.equal(Number(state.data[0].balanceUsageCredits), 0);
  assert.equal(state.data[2].balanceUsageCredits, null);
  assert.equal(state.data[0].groups[0].fiveHourLimitPercent, null);
  assert.equal(state.dataAsOf, Date.parse('2026-10-27T16:00:00Z'));
  assert.equal(state.updatedAt, timestamp);
  assert.equal(state.error, null);
  assert.equal(new Set(state.data.map(row => row.key)).size, 3);
});

test('top chats: invalid amounts, duplicate identities and invalid freshness retain only same-account stale data', async () => {
  const h = await backend();
  await open(h);
  const previous = structuredClone(report(h).data);
  for (const invalid of [body([thread(1, { weekly_limit_percent: -1 })]), body([thread(1, { weekly_limit_percent: '2' })]), ...['not decimal', '-1', '0x10', '1e999'].map(balance_usage_credits => body([thread(1, { balance_usage_credits })])), body([thread(1), thread(1)]), { ...body([thread(1)]), data_as_of: '2026-02-30T16:00:00Z' }]) {
    h.setPayload(invalid);
    await h.detailsService().refresh();
    assert.equal(report(h).stale, true);
    assert.deepEqual(report(h).data, previous);
    assert.match(report(h).error, /top chats.*unavailable/i);
    assert.equal(h.snapshot().overview.error, null);
  }
});

test('top chats: refreshed local titles keep opaque row identity and catalog failure clears private cached rows', async () => {
  const h = await backend();
  await open(h);
  const key = report(h).data[0].key;
  h.setCatalog([session(1, { name: 'Renamed locally' })]);
  await h.detailsService().refresh();
  assert.equal(report(h).data[0].title, 'Renamed locally');
  assert.equal(report(h).data[0].key, key);
  h.failCatalog();
  await h.detailsService().refresh();
  assert.deepEqual(report(h).data, []);
  assert.match(report(h).error, /top chats.*unavailable/i);
  assert.doesNotMatch(h.output(), /PRIVATE_MESSAGE|PRIVATE_SESSIONS|11111111-2222/);
});

test('top chats: account replacement and authentication loss cannot retain previous account attribution', async () => {
  let account = 'account-a';
  const h = await backend({ getAuth: async () => account === null ? undefined : ({ source: 'OAuth', auth: { apiKey: secret, headers: { 'ChatGPT-Account-Id': account } } }) });
  await open(h);
  assert.equal(report(h).data.length, 1);
  account = 'account-b';
  h.setPayload(body([]));
  await h.detailsService().refreshMessages({ startDate: '2026-10-21', endDate: '2026-10-27' });
  assert.equal(queries(h).length, 2, 'Account-changing card refresh hydrates Top chats for the new account');
  assert.deepEqual(report(h).data, []);
  assert.equal(new Headers(queries(h)[1].init.headers).get('chatgpt-account-id'), 'account-b');
  account = null;
  await h.detailsService().refresh();
  assert.deepEqual(report(h).data, []);
  assert.match(report(h).error, /auth|sign in/i);
});
