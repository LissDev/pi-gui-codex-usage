import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response, usage, analytics, endpoint, analyticsEndpoint, messagesPath, messages, tokenUsage, pluginsPath, skillsPath, plugins, skills, resetCreditsPath, resetHistoryPath, resetCredits, resetHistory, secret, timestamp } from './helpers.js';

const historyPath = '/backend-api/wham/usage/daily-token-usage-breakdown';
const fields = ['uncached_text_input_tokens', 'cached_text_input_tokens', 'text_output_tokens', 'text_total_tokens'];
const backend = options => harness({ ...options, fetch: (url, init) => {
  const path = new URL(url).pathname;
  assert.ok([new URL(endpoint).pathname, new URL(analyticsEndpoint).pathname, historyPath, messagesPath, pluginsPath, skillsPath, resetCreditsPath, resetHistoryPath].includes(path), 'Token detail introduces no new endpoint');
  if (String(url) === endpoint) return response(usage);
  if (String(url) === analyticsEndpoint) return response(analytics);
  if (path === historyPath) return response({ units: 'percent', data: [{ date: '2026-10-26', attribution: [{ model: 'gpt-6.1-sol', value: 3 }] }] });
  if (path === pluginsPath) return response(plugins);
  if (path === skillsPath) return response(skills);
  if (path === resetCreditsPath) return response(resetCredits);
  if (path === resetHistoryPath) return response(resetHistory);
  return options?.messagesFetch?.(url, init) ?? response(tokenUsage);
} });
const open = async h => { await h.fire('session_start'); await h.detailsService().refresh(); };

test('tokens: existing Messages source retains only four proved totals/client token measures with zero/null and never model tokens or private fields', async () => {
  const body = structuredClone(tokenUsage);
  const day = body.data[0];
  Object.assign(day.totals, { users: 111, threads: 222, credits: 333, private_id: 'PRIVATE_TOTAL_ID', input_tokens: 444 });
  Object.assign(day.clients[0], { users: 111, threads: 222, credits: 333, private_id: 'PRIVATE_CLIENT_ID', input_tokens: 444 });
  Object.assign(day.models[0], Object.fromEntries(fields.map(field => [field, 777])));
  day.thread_id = 'PRIVATE_THREAD_ID';
  const h = await backend({ messagesFetch: () => response(body) });
  await open(h);
  assert.deepEqual(h.snapshot().messages.data, tokenUsage.data, 'Only the explicit token expansion augments the established message count schema');
  assert.equal(h.snapshot().messages.dataAsOf, null);
  assert.equal(h.snapshot().messages.updatedAt, timestamp);
  assert.doesNotMatch(JSON.stringify(h.snapshot().messages), /PRIVATE|users|threads|credits|input_tokens":444|777|TEST_ONLY/);
  assert.equal(h.requests.length, 8);
  assert.equal(h.requests.filter(request => new URL(request.url).pathname === messagesPath).length, 1);
  assert.ok(h.requests.every(request => request.init.method === 'GET' && request.init.redirect === 'error'));
  assert.equal(new Headers(h.requests.find(request => new URL(request.url).pathname === messagesPath).init.headers).get('authorization'), `Bearer ${secret}`);
});

test('tokens: invalid provided token counts fail the shared source stale while absent/null fields keep Messages valid and zero stays zero', async () => {
  let body = structuredClone(tokenUsage);
  const h = await backend({ messagesFetch: () => response(body) });
  await open(h);
  assert.equal(h.snapshot().messages.data[0].totals.text_total_tokens, 9000009, 'Initial valid token detail is available before failure');
  const previous = structuredClone(h.snapshot().messages);
  for (const [container, field, invalid] of [['totals', fields[0], -1], ['clients', fields[1], 1.5], ['totals', fields[2], '7']]) {
    body = structuredClone(tokenUsage);
    (container === 'totals' ? body.data[0].totals : body.data[0].clients[0])[field] = invalid;
    await h.detailsService().refresh();
    assert.equal(h.snapshot().messages.stale, true);
    assert.match(h.snapshot().messages.error, /messages.*unavailable/i);
    assert.deepEqual(h.snapshot().messages.data, previous.data);
    assert.equal(h.snapshot().messages.updatedAt, previous.updatedAt);
    assert.equal(h.snapshot().history.stale, false);
    assert.equal(h.snapshot().plugins.stale, false);
  }
  body = structuredClone(messages);
  body.data[0].totals.text_total_tokens = null;
  body.data[0].totals.text_output_tokens = 0;
  await h.detailsService().refresh();
  assert.equal(h.snapshot().messages.error, null);
  assert.equal(h.snapshot().messages.data[0].totals.turns, 8);
  assert.equal(h.snapshot().messages.data[0].totals.text_total_tokens, null);
  assert.equal(h.snapshot().messages.data[0].totals.text_output_tokens, 0);
  assert.ok(h.snapshot().messages.data[0].totals.cached_text_input_tokens == null);
});

test('tokens: Messages range refresh carries token detail through its one existing request without changing other ranges or compact sources', async () => {
  const h = await backend({ messagesFetch: url => {
    const body = structuredClone(tokenUsage);
    body.data[0].date = new URL(url).searchParams.get('end_date');
    body.data[0].totals.text_total_tokens = 1234567;
    return response(body);
  } });
  await open(h);
  assert.equal(h.snapshot().messages.data[0].totals.text_total_tokens, 1234567);
  const otherRanges = Object.fromEntries(['history', 'plugins', 'skills'].map(key => [key, [h.snapshot()[key].startDate, h.snapshot()[key].endDate]]));
  const before = h.requests.length;
  const range = { startDate: '2026-10-14', endDate: '2026-10-20' };
  assert.equal((await h.detailsService().refreshMessages(range)).verified, true);
  assert.equal(h.requests.length, before + 1);
  assert.equal(new URL(h.requests.at(-1).url).pathname, messagesPath);
  assert.equal(h.snapshot().messages.data[0].date, range.endDate);
  assert.equal(h.snapshot().messages.data[0].totals.text_total_tokens, 1234567);
  for (const [key, dates] of Object.entries(otherRanges)) assert.deepEqual([h.snapshot()[key].startDate, h.snapshot()[key].endDate], dates);
  const compactBefore = h.requests.length;
  await h.command();
  assert.equal(h.requests.length, compactBefore + 2);
  assert.ok(h.requests.slice(compactBefore).every(request => [endpoint, analyticsEndpoint].includes(request.url)));
});
