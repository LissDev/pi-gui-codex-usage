import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { harness, usage, analytics, response, endpoint, timestamp, root, secret } from './helpers.js';

function textBar(line) {
  const bar = line.match(/[█▓■=━░▒□─.-]{4,}/u)?.[0];
  assert.ok(bar, 'Quota has a readable proportional text fill bar');
  return { filled: [...bar].filter(char => /[█▓■=━]/u.test(char)).length, length: [...bar].length };
}

test('command namespace is kebab-case codex-usage', async () => {
  const h = await harness();
  assert.ok(h.commands.has('codex-usage'));
  assert.ok(!h.commands.has('usage'), 'Renamed command no longer occupies the host usage command');
});

test('bare command offers native Compact Detailed Hide choices; cancellation changes nothing', async () => {
  const h = await harness();
  await h.invokeRegisteredUsage('');
  assert.equal(h.selections.length, 1, 'Bare command opens native choice menu');
  assert.deepEqual(h.selections[0].items, ['Compact', 'Detailed', 'Hide']);
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.entries.length, 0);
});

test('compact displays only quotas with used bars and exact collapsed summary', async () => {
  const h = await harness();
  await h.invokeRegisteredUsage('compact');
  const text = h.compactText();
  assert.doesNotMatch(text, /analytics|lifetime|streak|plan|credits|earned resets/i);
  assert.equal(h.statuses.at(-1)?.text, 'Codex usage · 75% left');
  const weekly = text.split('\n').find(line => /7\s*days?|week/i.test(line));
  assert.ok(weekly);
  assert.match(weekly, /25\s*%/);
  assert.match(weekly, /left[^\n]*75\s*%|75\s*%[^\n]*left/i);
  assert.match(weekly, /reset/i);
  const bar = textBar(weekly);
  assert.ok(Math.abs(bar.filled / bar.length - .25) <= 1 / bar.length, 'Fill represents used25%, not remaining75%');
  assert.match(text, /last.*(update|success)|updated/i);
});

test('compact text bars handle zero and fully used windows', async () => {
  const body = structuredClone(usage);
  body.rate_limit.primary_window.used_percent = 0;
  body.rate_limit.secondary_window.used_percent = 100;
  const h = await harness({ fetch: url => response(String(url) === endpoint ? body : analytics) });
  await h.invokeRegisteredUsage('compact');
  const lines = h.compactText().split('\n');
  const empty = textBar(lines.find(line => /7\s*days?|week/i.test(line)) ?? '');
  const full = textBar(lines.find(line => /5\s*(hours?|h)\b/i.test(line)) ?? '');
  assert.equal(empty.filled, 0);
  assert.equal(full.filled, full.length);
  assert.equal(h.statuses.at(-1)?.text, 'Codex usage · 100% left');
});

test('detailed entry leaves hidden compact hidden and gives native opening instructions', async () => {
  const h = await harness();
  await h.invokeRegisteredUsage('detailed');
  assert.equal(h.timers.size, 0, 'Details entry starts no recurring backend timer');
  assert.equal(h.entries.length, 0, 'Details does not persist compact visibility');
  assert.equal(h.widgets.length, 0, 'Details does not show compact');
  assert.match(h.notifications.map(item => item.message).join('\n'), /Add tab[^\n]*Extension views[^\n]*Codex Usage|Open Codex Usage/i);
});

test('detailed entry preserves shown compact state without a new visibility write', async () => {
  const h = await harness();
  await h.invokeRegisteredUsage('compact');
  const writes = h.entries.length;
  const visible = h.compactText();
  await h.invokeRegisteredUsage('detailed');
  assert.equal(h.entries.length, writes);
  assert.equal(h.compactText(), visible);
  assert.equal(h.timers.size, 1);
});

test('right workbench report is registered with sanitized finite-refresh service and packaged assets', async () => {
  const h = await harness();
  const declaration = h.declarations.find(view => view.title === 'Codex Usage');
  assert.ok(declaration, 'Native workbench catalogue includes Codex Usage');
  assert.equal(declaration.id, 'codex-usage');
  const frontend = new URL(declaration.frontend);
  assert.ok(frontend.href.startsWith(root.href), 'Prebuilt entry belongs to installed package');
  assert.match(frontend.pathname, /\.(m?js)$/);
  await access(fileURLToPath(frontend));
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const relativeEntry = decodeURIComponent(frontend.pathname.slice(root.pathname.length));
  assert.ok(manifest.files.some(file => relativeEntry === file || relativeEntry.startsWith(`${file.replace(/\/$/, '')}/`)), 'Package includes the prebuilt frontend directory');
  const source = await readFile(new URL(manifest.pi.extensions[0], root), 'utf8');
  assert.doesNotMatch(source, /from\s*['"]@pi-gui\//, 'Plugin has no runtime private host-package import');
  await h.fire('session_start', { reason: 'startup' });
  const service = h.detailsService();
  assert.ok(service?.state && typeof service.refresh === 'function', 'Public service exposes state and finite refresh');
  await service.refresh({}, {});
  assert.equal(h.timers.size, 0, 'Details-only refresh creates no backend interval');
  const state = h.snapshot();
  assert.ok(Array.isArray(state.overview.windows));
  assert.ok(Array.isArray(state.analytics.daily));
  assert.equal(state.overview.windows[0].usedPercent, 25);
  assert.equal(state.overview.windows[0].leftPercent, 75);
  assert.equal(state.overview.updatedAt, timestamp);
  const serialized = JSON.stringify(state);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes('test-account'));
  assert.ok(!serialized.includes('PRIVATE_PROFILE'));
  assert.ok(!serialized.includes('authorization'));
  assert.equal(h.widgets.filter(item => item.lines).length, 0, 'Details refresh does not enable compact');
});

test('same-session tree navigation retains the mounted report while compact is hidden', async () => {
  const h = await harness();
  await h.fire('session_start', { reason: 'startup' });
  const service = h.detailsService();
  const unsubscribe = service.state.subscribe(() => {});
  try {
    await service.refresh({}, {});
    assert.equal(h.snapshot().overview.windows[0].usedPercent, 25);
    h.restore([{ type: 'custom', customType: 'codex-usage.visibility', data: { visible: false } }]);
    await h.fire('session_tree', { oldLeafId: 'branch-a', newLeafId: 'branch-b' });
    assert.equal(h.snapshot().overview.windows[0]?.usedPercent, 25,
      'Account-scoped report remains available after a same-session branch change');
    assert.match(h.reportText().replaceAll(',', ''), /123456/);
    assert.equal(h.timers.size, 0, 'Hidden compact and mounted details create no backend interval');
    assert.equal(h.widgets.filter(item => item.lines).length, 0, 'Branch change does not enable compact');
  } finally { unsubscribe(); }
});

test('details refresh cancelled by compact hide reports that identity was not verified', async () => {
  const options = {};
  const h = await harness(options);
  await h.fire('session_start', { reason: 'startup' });
  const service = h.detailsService();
  await service.refresh({}, {});
  assert.equal(h.snapshot().overview.windows[0].usedPercent, 25);
  let finishAuth;
  options.getAuth = () => new Promise(resolve => { finishAuth = resolve; });
  const refresh = service.refresh({}, {});
  await new Promise(resolve => setImmediate(resolve));
  await h.command('hide');
  let outcome;
  let rejected = false;
  try { outcome = await refresh; }
  catch { rejected = true; }
  finally {
    finishAuth({ source: 'OAuth', auth: { apiKey: 'OTHER_TEST_SECRET', headers: { 'ChatGPT-Account-Id': 'other-test-account' } } });
  }
  assert.ok(rejected || outcome?.verified === false,
    'Cancelled auth work must not report successful identity verification');
  assert.equal(h.requests.length, 2, 'Cancelled new-account auth cannot dispatch HTTP');
  assert.equal(h.timers.size, 0);
});

test('same-account source failure preserves stale data but reports verified identity', async () => {
  const options = {};
  const h = await harness(options);
  await h.fire('session_start', { reason: 'startup' });
  const service = h.detailsService();
  await service.refresh({}, {});
  options.fetch = url => {
    if (String(url) === endpoint) return response({}, 503);
    const body = structuredClone(analytics);
    body.stats.lifetime_tokens = 654321;
    return response(body);
  };
  const result = await service.refresh({}, {});
  assert.equal(h.snapshot().overview.windows[0].usedPercent, 25);
  assert.equal(h.snapshot().overview.stale, true);
  assert.match(h.reportText().replaceAll(',', ''), /654321/);
  assert.equal(result?.verified, true, 'Data-source failure does not invalidate a successfully verified account');
});
