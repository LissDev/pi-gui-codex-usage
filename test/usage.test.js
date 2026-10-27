import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, loadExtension, response, usage, analytics, secret, endpoint, analyticsEndpoint, timestamp } from './helpers.js';

test('Pi package discovers a loadable default extension', async () => {
  await loadExtension();
});


test('/codex-usage command is registered through the public extension API', async () => {
  const h = await harness();
  assert.ok(h.commands.has('codex-usage'), 'Extension registers /codex-usage');
});

test('new chat stays hidden without polling; /codex-usage renders ExtensionDock and polls', async () => {
  const h = await harness();
  await h.fire('session_start', { reason: 'startup' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers.size, 0);
  await h.command();
  assert.equal(h.usageRequests().length, 1);
  assert.equal(h.widgets.at(-1)?.key, 'codex-usage');
  assert.equal(h.widgets.at(-1)?.options?.placement, 'aboveEditor');
  assert.ok(h.statuses.at(-1)?.text, 'Native status summarizes usage');
  assert.equal(h.timers.size, 1);
  const timer = [...h.timers.values()][0];
  assert.ok(timer.ms >= 120_000 && timer.ms <= 600_000, 'Refresh every few minutes');
  await timer.callback();
  assert.equal(h.usageRequests().length, 2);
});

test('quota card labels actual window durations, remaining usage, reset, plan and credits', async () => {
  const h = await harness();
  await h.command();
  const text = h.reportText();
  assert.match(text, /7\s*days?|weekly|1\s*week/i);
  assert.match(text, /5\s*(hours?|h)\b/i);
  assert.match(text, /25\s*%/);
  assert.match(text, /75\s*%/);
  assert.match(text, /40\s*%/);
  assert.match(text, /60\s*%/);
  assert.match(text, /reset/i);
  assert.match(text, /plus/i);
  assert.match(text, /12\.50/);
});

test('earned resets show available and applicable counts without mutation actions', async () => {
  const h = await harness();
  await h.command();
  const text = h.reportText();
  assert.match(text, /reset[^\n]*2|2[^\n]*reset/i);
  assert.match(text, /applicable[^\n]*0|0[^\n]*applicable/i);
  assert.ok(h.requests.every(r => !r.init.method || r.init.method === 'GET'), 'Display-only requests');
});

test('server analytics shows token totals, dated buckets and useful stats without profile PII', async () => {
  const h = await harness();
  await h.command();
  const text = h.reportText().replaceAll(',', '');
  for (const value of ['123456', '9876']) {
    assert.ok(text.includes(value), `Server statistic ${value} appears without inference`);
  }
  assert.deepEqual(h.snapshot().analytics.daily, [{ date: '2026-10-26', tokens: 3456 }]);
  assert.deepEqual(h.snapshot().analytics.cumulative, [{ date: '2026-10-26', tokens: 123456 }]);
  assert.deepEqual(h.snapshot().analytics.weekly, [{ date: '2026-10-19', tokens: 45678 }]);
  assert.match(text, /streak/i);
  assert.match(text, /thread/i);
  assert.match(text, /skill/i);
  assert.match(text, /high/i);
  assert.match(text, /12\.5/);
  assert.ok(!h.output().includes('PRIVATE_PROFILE'), 'Profile identity is not persisted or rendered');
});

test('analytics failure remains independent from successful limits', async () => {
  const h = await harness({ fetch: url => String(url) === endpoint ? response() : response({ error: secret }, 503) });
  await h.command();
  assert.match(h.reportText(), /25\s*%/);
  assert.match(h.reportText(), /analytics[^\n]*(unavailable|failed)|(unavailable|failed)[^\n]*analytics/i);
  assert.ok(!h.output().includes(secret));
});

test('null quota and credit fragments are omitted while explicit zero usage stays zero', async () => {
  const body = structuredClone(usage);
  body.rate_limit.primary_window.used_percent = null;
  body.rate_limit.secondary_window.used_percent = 0;
  body.credits.balance = null;
  const h = await harness({ fetch: () => response(body) });
  await h.command();
  const lines = h.reportText().split('\n');
  assert.ok(!lines.some(line => /7\s*days?|week/i.test(line) && /unavailable|unknown|n\/a/i.test(line)), 'Null usage does not add unavailable fragments');
  assert.ok(lines.some(line => /5\s*(hours?|h)\b/i.test(line) && /0\s*%/.test(line)), 'Explicit zero is displayed');
  assert.ok(!lines.some(line => /credit/i.test(line) && /unavailable|unknown|n\/a/i.test(line)), 'Null credits do not add unavailable fragments');
});

test('requests use Pi OAuth only, official usage URL and disabled redirects', async () => {
  const h = await harness();
  await h.command();
  assert.equal(h.usageRequests().length, 1);
  assert.deepEqual(new Set(h.requests.map(r => r.url)), new Set([endpoint, analyticsEndpoint]));
  assert.ok(h.requests.every(r => !r.init.method || r.init.method === 'GET'));
  assert.ok(h.requests.every(r => r.init.redirect === 'error'));
  assert.equal(h.requests[0].url, endpoint);
  assert.equal(h.requests[0].init.redirect, 'error');
  assert.equal(new Headers(h.requests[0].init.headers).get('authorization'), `Bearer ${secret}`);
  assert.equal(new Headers(h.requests[0].init.headers).get('chatgpt-account-id'), 'test-account');
  assert.ok(!h.output().includes(secret), 'Credentials never persist or render');
});

for (const [name, options] of [
  ['missing Pi auth', { auth: null }],
  ['non-OAuth Pi auth', { oauth: false }],
  ['unofficial auth origin', { auth: { source: 'OAuth', auth: { apiKey: secret, baseUrl: 'https://attacker.invalid/backend-api' } } }],
  ['unofficial provider origin', { baseUrl: 'https://attacker.invalid/backend-api' }],
]) {
  test(`${name} prevents credential dispatch`, async () => {
    const h = await harness(options);
    await h.command();
    assert.equal(h.requests.length, 0);
    assert.match(h.compactText(), /unavailable|sign in|auth|official/i);
    assert.ok(!h.output().includes(secret));
  });
}

test('failed refresh preserves last good values, timestamp and sanitized stale status', async () => {
  const h = await harness({ fetch: (url, _init, count) => count === 1 ? response(String(url) === endpoint ? usage : analytics) : response({ error: secret }, 401) });
  await h.command();
  assert.equal(h.timers.size, 1, 'Visible usage schedules refresh');
  await [...h.timers.values()][0].callback();
  assert.match(h.reportText(), /25\s*%/);
  assert.match(h.reportText(), /stale|last successful|last updated/i);
  assert.match(h.reportText(), /2026|17:00/);
  assert.ok(!h.output().includes(secret));
});

test('/codex-usage hide persists hidden, clears dock and prevents late response restoring it', async () => {
  let resolveFetch;
  const pending = new Promise(resolve => { resolveFetch = resolve; });
  const h = await harness({ fetch: url => String(url) === endpoint ? pending : response(analytics) });
  const refreshing = h.command();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.usageRequests().length, 1);
  await h.command('hide');
  const afterHide = h.widgets.length;
  assert.equal(h.widgets.at(-1)?.lines, undefined);
  assert.equal(h.statuses.at(-1)?.text, undefined);
  assert.equal(h.timers.size, 0);
  const aborted = h.requests[0].init.signal?.aborted;
  resolveFetch(response());
  await refreshing;
  assert.ok(aborted, 'Hide aborts outstanding refresh');
  assert.equal(h.widgets.length, afterHide, 'Late completion cannot restore widget');
  const visibility = h.entries.filter(e => e.customType === 'codex-usage.visibility');
  assert.equal(visibility.at(-1).data.visible, false);
});

test('active branch visibility restores on start/tree; hidden branch does not refresh', async () => {
  const h = await harness();
  const visibility = visible => ({ type: 'custom', customType: 'codex-usage.visibility', data: { visible } });
  h.restore([visibility(true)]);
  await h.fire('session_start', { reason: 'resume' });
  assert.equal(h.usageRequests().length, 1);
  h.restore([visibility(false)]);
  await h.fire('session_tree', { newLeafId: 'hidden', oldLeafId: 'visible' });
  assert.equal(h.usageRequests().length, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.widgets.at(-1)?.lines, undefined);
  assert.equal(h.statuses.at(-1)?.text, undefined);
  await h.command();
  assert.equal(h.usageRequests().length, 2, 'Explicit usage re-enables a hidden branch');
});

test('shutdown cancels timer and invalidates pending results', async () => {
  let finish;
  const h = await harness({ fetch: url => String(url) === endpoint ? new Promise(resolve => { finish = resolve; }) : response(analytics) });
  const work = h.command();
  await new Promise(resolve => setImmediate(resolve));
  await h.fire('session_shutdown', { reason: 'quit' });
  const count = h.widgets.length;
  assert.equal(h.timers.size, 0);
  const aborted = h.requests[0].init.signal?.aborted;
  finish(response());
  await work;
  assert.ok(aborted, 'Shutdown aborts outstanding refresh');
  assert.equal(h.widgets.length, count);
});

test('new session ignores an old session response', async () => {
  let finish;
  const h = await harness({ fetch: url => String(url) === endpoint ? new Promise(resolve => { finish = resolve; }) : response(analytics) });
  const work = h.command();
  await new Promise(resolve => setImmediate(resolve));
  h.restore([], 'session-b');
  await h.fire('session_start', { reason: 'new' });
  const count = h.widgets.length;
  finish(response());
  await work;
  assert.equal(h.widgets.length, count);
  assert.equal(h.timers.size, 0);
});
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function poll(h) {
  assert.equal(h.timers.size, 1, 'Visible usage has one polling timer');
  return [...h.timers.values()][0].callback();
}

// Synthetic values retain the independently verified server schema, never user data.
test('complete limits include review windows, credit buckets, model availability and spend/reset details', async () => {
  const body = structuredClone(usage);
  Object.assign(body.rate_limit, { allowed: true, limit_reached: false });
  body.rate_limit.primary_window.reset_after_seconds = 789;
  body.code_review_rate_limit = { allowed: true, limit_reached: false,
    primary_window: { used_percent: 13, limit_window_seconds: 86400, reset_after_seconds: 4321, reset_at: 1793120400 }, secondary_window: null };
  body.additional_rate_limits = null;
  Object.assign(body.credits, { overage_limit_reached: false, approx_local_messages: [17, 19], approx_cloud_messages: [23, 29] });
  body.model_usage = { 'gpt-test-model': { available: true, available_at: null, credits_would_enable: false } };
  body.spend_control = { reached: false, individual_limit: null };
  body.rate_limit_reached_type = null;
  body.promo = null;
  const h = await harness({ fetch: url => response(String(url) === endpoint ? body : analytics) });
  await h.command();
  const text = h.reportText().toLowerCase();
  for (const metric of ['code review', '13%', '87%', '789', '4321', 'overage',
    'local', '17', '19', 'cloud', '23', '29', 'gpt-test-model', 'credits would enable',
    'spend', 'limit reached']) {
    assert.ok(text.includes(metric), `Available limits metric ${metric} appears`);
  }
  assert.doesNotMatch(text, /available at|individual limit|additional limits|promo/, 'Absent limits details are omitted');
  assert.match(text, /1\s*days?|24\s*hours?/);
});

test('complete analytics retains every scalar, all bucket dates, safe metadata and named top invocations', async () => {
  const body = structuredClone(analytics);
  body.stats.daily_usage_buckets.push({ start_date: '2026-10-27', tokens: 2468 });
  body.stats.cumulative_daily_usage_buckets.push({ start_date: '2026-10-27', tokens: 125924 });
  body.stats.weekly_usage_buckets.push({ start_date: '2026-10-26', tokens: 8024 });
  body.stats.top_invocations = [{ type: 'plugin', plugin_id: 'OPAQUE_PLUGIN_ID', plugin_name: 'Test Plugin',
    skill_id: 'OPAQUE_SKILL_ID', skill_name: 'Test Skill', usage_count: 37 }];
  const h = await harness({ fetch: url => response(String(url) === endpoint ? usage : body) });
  await h.command();
  const text = h.reportText().replaceAll(',', '').toLowerCase();
  for (const metric of ['longest running turn', 'unique skills', 'longest streak',
    'most used reasoning effort percentage',
    'stats as of', 'generated at', 'test plugin', 'test skill', '37']) {
    assert.ok(text.includes(metric), `Available analytics metric ${metric} appears`);
  }
  assert.deepEqual(h.snapshot().analytics.daily, [
    { date: '2026-10-26', tokens: 3456 }, { date: '2026-10-27', tokens: 2468 },
  ]);
  assert.deepEqual(h.snapshot().analytics.cumulative, [
    { date: '2026-10-26', tokens: 123456 }, { date: '2026-10-27', tokens: 125924 },
  ]);
  assert.deepEqual(h.snapshot().analytics.weekly, [
    { date: '2026-10-19', tokens: 45678 }, { date: '2026-10-26', tokens: 8024 },
  ]);
  assert.doesNotMatch(text, /workspace rank/, 'Absent workspace rank is omitted');
  assert.ok(!h.output().includes('PRIVATE_PROFILE'));
  assert.ok(!h.output().includes('OPAQUE_'), 'Opaque invocation IDs are omitted');
});

for (const failed of ['limits', 'analytics']) {
  test(`independent source cache preserves ${failed} while the other source updates`, async () => {
    let cycle = 0;
    const h = await harness({ fetch: url => {
      const isLimits = String(url) === endpoint;
      if (cycle && (isLimits === (failed === 'limits'))) return response({ error: secret }, 503);
      const body = structuredClone(isLimits ? usage : analytics);
      if (cycle && isLimits) body.rate_limit.primary_window.used_percent = 31;
      if (cycle && !isLimits) body.stats.lifetime_tokens = 654321;
      return response(body);
    } });
    await h.command();
    cycle++;
    await poll(h);
    const text = h.reportText().replaceAll(',', '');
    assert.match(text, failed === 'limits' ? /25\s*%/ : /123456/);
    assert.match(text, failed === 'limits' ? /654321/ : /31\s*%/);
    assert.match(text, /stale|last successful|last updated/i);
    assert.ok(!h.output().includes(secret));
  });
}

for (const failure of ['throws', 'times out']) {
  test(`unverified auth identity ${failure} after account change suppresses prior metrics`, { timeout: 1500 }, async () => {
    const options = { requestTimeoutMs: 20 };
    const h = await harness(options);
    await h.command();
    assert.match(h.reportText(), /25\s*%/);
    assert.match(h.reportText(), /123[,.]?456/);
    const before = h.requests.length;
    options.auth = { source: 'OAuth', auth: { apiKey: 'OTHER_TEST_SECRET', headers: { 'ChatGPT-Account-Id': 'other-test-account' } } };
    const auth = deferred();
    if (failure === 'throws') options.authError = new Error(`changed credentials ${secret}`);
    else options.getAuth = () => auth.promise;
    try { await poll(h); }
    finally { auth.resolve(undefined); }
    assert.equal(h.requests.length, before, 'Unverified identity does not dispatch HTTP');
    assert.match(h.compactText(), /auth[^\n]*unavailable|sign in/i);
    assert.doesNotMatch(h.reportText(), /25\s*%|123[,.]?456/,
      'Failed identity verification suppresses the previous account data');
    assert.doesNotMatch(h.statuses.at(-1)?.text ?? '', /updated/i);
    assert.ok(!h.output().includes(secret));
    assert.ok(!h.output().includes('OTHER_TEST_SECRET'));
  });
}

for (const failed of ['limits', 'analytics']) {
  test(`rotated bearer for the same verified account preserves stale ${failed} and timestamp`, async () => {
    const options = {};
    const h = await harness(options);
    await h.command();
    const title = failed === 'limits' ? 'Limits' : 'Analytics';
    const oldTimestamp = new Date(timestamp).toLocaleString();
    assert.ok(h.reportText().split('\n').find(line => line.startsWith(`${title}:`))?.includes(oldTimestamp));
    options.auth = { source: 'OAuth', auth: { apiKey: 'ROTATED_TEST_SECRET', headers: { 'ChatGPT-Account-Id': 'test-account' } } };
    options.now = timestamp + 86400000;
    options.fetch = url => {
      const isLimits = String(url) === endpoint;
      if (isLimits === (failed === 'limits')) return response({ error: secret }, 503);
      const body = structuredClone(isLimits ? usage : analytics);
      if (isLimits) body.rate_limit.primary_window.used_percent = 31;
      else body.stats.lifetime_tokens = 654321;
      return response(body);
    };
    await poll(h);
    const text = h.reportText().replaceAll(',', '');
    assert.match(text, failed === 'limits' ? /25\s*%/ : /123456/,
      'OAuth access-token rotation must not invalidate the same account cache');
    assert.match(text, failed === 'limits' ? /654321/ : /31\s*%/);
    const failedHeader = h.reportText().split('\n').find(line => line.startsWith(`${title}:`)) ?? '';
    assert.match(failedHeader, /stale|last successful|last updated/i);
    assert.ok(failedHeader.includes(oldTimestamp), 'Failed source retains its original successful timestamp');
    assert.ok(!h.output().includes('ROTATED_TEST_SECRET'));
  });
}

test('missing verified account identity suppresses previous metrics and prevents dispatch', async () => {
  const options = {};
  const h = await harness(options);
  await h.command();
  const before = h.requests.length;
  options.auth = { source: 'OAuth', auth: { apiKey: 'TOKEN_WITHOUT_ACCOUNT_ID', headers: {} } };
  await poll(h);
  assert.equal(h.requests.length, before, 'Unknown account cannot dispatch account-scoped requests');
  assert.doesNotMatch(h.reportText(), /25\s*%|123[,.]?456/);
  assert.match(h.reportText(), /account|auth|unavailable/i);
  assert.ok(!h.output().includes('TOKEN_WITHOUT_ACCOUNT_ID'));
});

test('runtime OAuth account switch never serves the prior account cache', async () => {
  const options = {};
  const h = await harness(options);
  await h.command();
  options.auth = { source: 'OAuth', auth: { apiKey: 'OTHER_TEST_SECRET', headers: { 'ChatGPT-Account-Id': 'other-test-account' } } };
  options.fetch = () => response({ error: 'unavailable' }, 503);
  await poll(h);
  assert.doesNotMatch(h.reportText(), /25\s*%|123[,.]?456/);
  assert.match(h.reportText(), /unavailable/i);
  assert.ok(!h.output().includes('OTHER_TEST_SECRET'));
  assert.ok(!h.output().includes('other-test-account'));
});

test('account switch clears visible foreign metrics before new account requests complete', async () => {
  const options = {};
  const h = await harness(options);
  await h.command();
  assert.match(h.reportText(), /25\s*%/);
  assert.match(h.reportText(), /123[,.]?456/);
  const limitsRequest = deferred();
  const analyticsRequest = deferred();
  options.auth = { source: 'OAuth', auth: { apiKey: 'OTHER_TEST_SECRET', headers: { 'ChatGPT-Account-Id': 'other-test-account' } } };
  options.fetch = url => String(url) === endpoint ? limitsRequest.promise : analyticsRequest.promise;
  const refresh = poll(h);
  await turn();
  const nextLimits = structuredClone(usage);
  nextLimits.rate_limit.primary_window.used_percent = 71;
  const nextAnalytics = structuredClone(analytics);
  nextAnalytics.stats.lifetime_tokens = 654321;
  try {
    assert.equal(h.requests.length, 4, 'Both new-account requests are pending');
    assert.doesNotMatch(h.reportText(), /25\s*%|123[,.]?456/,
      'Foreign account metrics disappear while new-account responses are pending');
    assert.match(h.reportText(), /loading|refreshing|unavailable/i, 'A safe loading state replaces foreign metrics');
  } finally {
    limitsRequest.resolve(response(nextLimits));
    analyticsRequest.resolve(response(nextAnalytics));
    await refresh;
  }
  assert.match(h.reportText(), /71\s*%/);
  assert.match(h.reportText().replaceAll(',', ''), /654321/);
});

for (const action of ['hide', 'new session', 'shutdown']) {
  test(`pending Pi auth followed by ${action} cannot dispatch or restore UI`, async () => {
    const auth = deferred();
    const h = await harness({ getAuth: () => auth.promise });
    const work = h.command();
    await turn();
    if (action === 'hide') await h.command('hide');
    if (action === 'new session') {
      h.restore([], 'session-b');
      await h.fire('session_start', { reason: 'new' });
    }
    if (action === 'shutdown') await h.fire('session_shutdown', { reason: 'quit' });
    const outputCount = h.widgets.length;
    auth.resolve({ source: 'OAuth', auth: { apiKey: secret, headers: { 'ChatGPT-Account-Id': 'test-account' } } });
    await work;
    assert.equal(h.requests.length, 0, 'Obsolete auth completion cannot dispatch credentials');
    assert.equal(h.widgets.length, outputCount, 'Obsolete auth completion cannot restore the dock');
    assert.equal(h.timers.size, 0);
  });
}

test('overlapping poll ticks do not duplicate an in-flight refresh', async () => {
  const request = deferred();
  const h = await harness({ fetch: (url, _init, count) => String(url) === endpoint && count === 1 ? request.promise : response(String(url) === endpoint ? usage : analytics) });
  const work = h.command();
  await turn();
  const tick = poll(h);
  await turn();
  const count = h.usageRequests().length;
  request.resolve(response());
  await Promise.all([work, tick]);
  assert.equal(count, 1, 'Only one limits request may be in flight');
});

test('HTTP timeout settles refresh with stale last-good data and aborts the request', { timeout: 1500 }, async () => {
  let hanging = false;
  let finish;
  let signal;
  const h = await harness({ requestTimeoutMs: 20, fetch: (url, init) => {
    if (!hanging || String(url) !== endpoint) return response(String(url) === endpoint ? usage : analytics);
    signal = init.signal;
    return new Promise((resolve, reject) => {
      finish = () => resolve(response({}, 503));
      signal?.addEventListener('abort', () => reject(new Error('request timeout')), { once: true });
    });
  } });
  await h.command();
  hanging = true;
  const work = poll(h);
  const outcome = await Promise.race([work.then(() => 'settled'), new Promise(resolve => setTimeout(() => resolve('still pending'), 500))]);
  if (outcome !== 'settled') { finish?.(); await work; }
  assert.equal(outcome, 'settled', 'Bounded HTTP timeout completes the refresh');
  assert.ok(signal?.aborted, 'Timeout aborts request instead of abandoning it');
  assert.match(h.reportText(), /25\s*%/);
  assert.match(h.reportText(), /stale|last successful|last updated/i);
});

for (const [name, body] of [['empty body', {}], ['wrong body type', []],
  ['wrong percent type', { rate_limit: { primary_window: { used_percent: '0', limit_window_seconds: 604800 } } }],
  ['out-of-range percent', { rate_limit: { primary_window: { used_percent: -5, limit_window_seconds: 604800 } } }]]) {
  test(`malformed ${name} cannot replace last-good limits with a fresh or zero quota`, async () => {
    let fail = false;
    const h = await harness({ fetch: url => response(String(url) === endpoint ? (fail ? body : usage) : analytics) });
    await h.command();
    fail = true;
    await poll(h);
    assert.match(h.reportText(), /25\s*%/);
    assert.match(h.reportText(), /stale|last successful|last updated/i);
    assert.doesNotMatch(h.reportText(), /-5\s*%|105\s*%/);
  });
}

test('malformed JSON is a sanitized stale source failure', async () => {
  let fail = false;
  const h = await harness({ fetch: url => String(url) === endpoint && fail ? new Response(`{${secret}`) : response(String(url) === endpoint ? usage : analytics) });
  await h.command();
  fail = true;
  await poll(h);
  assert.match(h.reportText(), /25\s*%/);
  assert.match(h.reportText(), /stale|last successful|last updated/i);
  assert.ok(!h.output().includes(secret));
});

function oauthJwt(payload) {
  return [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'), 'synthetic-signature'].join('.');
}
const oauthAccountClaim = 'https://api.openai.com/auth';

test('installed SDK headerless OAuth JWT supplies the account header and usage metrics', async () => {
  const token = oauthJwt({ [oauthAccountClaim]: { chatgpt_account_id: 'jwt-test-account' } });
  const h = await harness({ auth: { source: 'OAuth', auth: { apiKey: token } } });
  await h.command();
  assert.equal(h.requests.length, 2, 'Headerless Pi OAuth dispatches both usage endpoints');
  assert.deepEqual(new Set(h.requests.map(request => request.url)), new Set([endpoint, analyticsEndpoint]));
  for (const request of h.requests) {
    const headers = new Headers(request.init.headers);
    assert.equal(headers.get('chatgpt-account-id'), 'jwt-test-account');
    assert.equal(headers.get('authorization'), `Bearer ${token}`);
    assert.equal(request.init.redirect, 'error');
  }
  assert.match(h.reportText(), /25\s*%/);
  assert.match(h.reportText().replaceAll(',', ''), /123456/);
  assert.ok(!h.output().includes(token), 'Resolved token is never persisted or rendered');
});

for (const failed of ['limits', 'analytics']) {
  test(`headerless OAuth JWT rotation preserves same-account stale ${failed}`, async () => {
    const firstToken = oauthJwt({ [oauthAccountClaim]: { chatgpt_account_id: 'jwt-test-account' }, exp: 2000000000 });
    const nextToken = oauthJwt({ [oauthAccountClaim]: { chatgpt_account_id: 'jwt-test-account' }, exp: 2000003600 });
    const options = { auth: { source: 'OAuth', auth: { apiKey: firstToken } } };
    const h = await harness(options);
    await h.command();
    assert.match(h.reportText(), /25\s*%/, 'Headerless OAuth initially resolves the account');
    assert.match(h.reportText().replaceAll(',', ''), /123456/);
    options.auth = { source: 'OAuth', auth: { apiKey: nextToken } };
    options.fetch = url => {
      const isLimits = String(url) === endpoint;
      if (isLimits === (failed === 'limits')) return response({}, 503);
      const body = structuredClone(isLimits ? usage : analytics);
      if (isLimits) body.rate_limit.primary_window.used_percent = 31;
      else body.stats.lifetime_tokens = 654321;
      return response(body);
    };
    await poll(h);
    const text = h.reportText().replaceAll(',', '');
    assert.match(text, failed === 'limits' ? /25\s*%/ : /123456/);
    assert.match(text, failed === 'limits' ? /654321/ : /31\s*%/);
    const title = failed === 'limits' ? 'Limits' : 'Analytics';
    const sourceHeader = h.reportText().split('\n').find(line => line.startsWith(`${title}:`)) ?? '';
    assert.match(sourceHeader, /stale|last successful|last updated/i);
    assert.ok(sourceHeader.includes(new Date(timestamp).toLocaleString()));
    assert.ok(!h.output().includes(firstToken));
    assert.ok(!h.output().includes(nextToken));
  });
}

for (const [name, token] of [
  ['malformed JWT', 'malformed.jwt'],
  ['missing JWT account claim', oauthJwt({})],
  ['non-string JWT account claim', oauthJwt({ [oauthAccountClaim]: { chatgpt_account_id: 42 } })],
  ['empty JWT account claim', oauthJwt({ [oauthAccountClaim]: { chatgpt_account_id: '' } })],
]) {
  test(`headerless OAuth ${name} fails closed`, async () => {
    const h = await harness({ auth: { source: 'OAuth', auth: { apiKey: token } } });
    await h.command();
    assert.equal(h.requests.length, 0, 'Unresolvable account claim prevents dispatch');
    assert.match(h.reportText(), /account|auth|unavailable/i);
    assert.doesNotMatch(h.reportText(), /25\s*%|123[,.]?456/);
    assert.ok(!h.output().includes(token));
  });
}

test('refinement: sanitized public metrics preserve scalar types and omit absent fields and empty arrays', async () => {
  const limits = structuredClone(usage);
  limits.credits = { has_credits: true, unlimited: false, balance: null, approx_local_messages: [] };
  limits.rate_limit.allowed = false;
  limits.rate_limit.limit_reached = true;
  limits.rate_limit_reset_credits = { available_count: null, applicable_available_count: 0 };
  const profile = { stats: { lifetime_tokens: 0, current_streak_days: null, total_threads: 8 }, metadata: { generated_at: '2026-10-27T16:01:00Z', stats_as_of: null } };
  const h = await harness({ fetch: url => response(String(url) === endpoint ? limits : profile) });
  await h.command();
  const state = h.snapshot();
  assert.ok(Array.isArray(state.overview.metrics), 'Public Overview exposes typed supplied scalar metrics');
  assert.ok(Array.isArray(state.analytics.metrics), 'Public Analytics exposes typed supplied scalar metrics');
  assert.equal(Object.hasOwn(state.overview, 'lines'), false, 'Internal v0.2 contract migrates atomically without duplicate legacy strings');
  for (const section of [state.overview, state.analytics]) {
    assert.ok(section.metrics.every(metric => typeof metric.label === 'string' && ['string', 'number', 'boolean'].includes(typeof metric.value)));
    assert.ok(section.metrics.every(metric => metric.value !== 'unavailable'));
  }
  const metric = (section, label) => section.metrics.find(item => label.test(item.label));
  assert.equal(metric(state.overview, /unlimited/i)?.value, false);
  assert.equal(metric(state.overview, /has credits|credits available|available credits/i)?.value, true);
  assert.equal(metric(state.overview, /applicable/i)?.value, 0);
  assert.equal(metric(state.analytics, /lifetime tokens/i)?.value, 0);
  assert.equal(metric(state.analytics, /current streak/i), undefined);
  assert.equal(metric(state.overview, /approx local messages/i), undefined);
  const generated = metric(state.analytics, /generated at/i);
  assert.deepEqual(generated && { value: generated.value, format: generated.format }, { value: Date.parse(profile.metadata.generated_at), format: 'datetime' });
  assert.deepEqual(state.analytics.invocations, []);
  assert.deepEqual(state.analytics.daily, []);
});

test('refinement: sanitized invocation details retain only provided known fields including zero without IDs or PII', async () => {
  const profile = structuredClone(analytics);
  profile.stats.top_invocations = [
    { type: 'plugin', plugin_id: 'PRIVATE_PLUGIN_ID', plugin_name: 'Named plugin', skill_id: null, skill_name: null, usage_count: 0, email: 'PRIVATE_EMAIL' },
    { type: 'skill', plugin_id: null, plugin_name: null, skill_id: 'PRIVATE_SKILL_ID', skill_name: 'Named skill', usage_count: 9 },
    { type: null, plugin_name: null, skill_name: null, usage_count: null },
  ];
  const h = await harness({ fetch: url => response(String(url) === endpoint ? usage : profile) });
  await h.command();
  assert.deepEqual(h.snapshot().analytics.invocations, [
    { type: 'plugin', pluginName: 'Named plugin', usageCount: 0 },
    { type: 'skill', skillName: 'Named skill', usageCount: 9 },
  ], 'Structured invocation rows retain real zero, omit nullable fragments and skip empty entries');
  assert.doesNotMatch(h.output(), /PRIVATE_PLUGIN_ID|PRIVATE_SKILL_ID|PRIVATE_EMAIL|PRIVATE_PROFILE/);
});

test('refinement: compact omits unavailable quota fragments and uses local dotted minute timestamps', async () => {
  const limits = structuredClone(usage);
  limits.rate_limit.primary_window.used_percent = null;
  limits.rate_limit.primary_window.reset_at = null;
  limits.rate_limit.secondary_window.used_percent = 0;
  limits.rate_limit.secondary_window.reset_at = null;
  const h = await harness({ fetch: url => response(String(url) === endpoint ? limits : analytics) });
  await h.command();
  const text = h.compactText();
  assert.doesNotMatch(text, /unavailable|unknown|n\/a|Reset/i, 'Missing percentage/reset fragments are hidden in successful compact data');
  assert.match(text, /Used[^\n]*0%/);
  assert.match(text, /Left[^\n]*100%/);
  const date = new Date(timestamp);
  const pad = number => String(number).padStart(2, '0');
  const local = `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  assert.ok(text.includes(local), 'Updated time uses host-local yyyy.mm.dd HH:mm without seconds');
});

test('refinement: missing histories remain empty and null token counts remain gaps rather than zero', async () => {
  const profile = { stats: { daily_usage_buckets: [{ start_date: '2026-10-25', tokens: 0 }, { start_date: '2026-10-26', tokens: null }] }, metadata: {} };
  const h = await harness({ fetch: url => response(String(url) === endpoint ? usage : profile) });
  await h.command();
  assert.deepEqual(h.snapshot().analytics.daily, [{ date: '2026-10-25', tokens: 0 }, { date: '2026-10-26', tokens: null }]);
  assert.deepEqual(h.snapshot().analytics.weekly, []);
  assert.deepEqual(h.snapshot().analytics.cumulative, []);
  assert.equal(h.snapshot().analytics.error, null, 'Legitimate missing fields are not source failures');
});

for (const [field, series] of [
  ['daily_usage_buckets', 'daily'],
  ['cumulative_daily_usage_buckets', 'cumulative'],
  ['weekly_usage_buckets', 'weekly'],
]) {
  test(`history date normalization: ${series} omits invalid calendar dates and sorts valid buckets without changing zero or null`, async () => {
    const profile = {
      stats: { [field]: [
        { tokens: 111 },
        { start_date: 'not-a-date', tokens: 222 },
        { start_date: '2026-02-30', tokens: 333 },
        { start_date: '2026-10-27', tokens: 456 },
        { start_date: '2026-10-25', tokens: 0 },
        { start_date: '2026-10-26', tokens: null },
      ] },
      metadata: {},
    };
    const h = await harness({ fetch: url => response(String(url) === endpoint ? usage : profile) });
    await h.command();
    assert.equal(h.snapshot().analytics.error, null, 'Bad date entries do not discard valid history');
    assert.deepEqual(h.snapshot().analytics[series], [
      { date: '2026-10-25', tokens: 0 },
      { date: '2026-10-26', tokens: null },
      { date: '2026-10-27', tokens: 456 },
    ], 'Public history contains only real source calendar dates in chronological order');
  });
}
