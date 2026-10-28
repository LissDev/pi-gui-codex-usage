import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const secret = 'TEST_ONLY_SECRET_NEVER_RENDER';
const endpoint = 'https://chatgpt.com/backend-api/wham/usage';
const analyticsEndpoint = 'https://chatgpt.com/backend-api/wham/profiles/me';
const messagesPath = '/backend-api/wham/analytics/daily-workspace-usage-counts';
const pluginsPath = '/backend-api/wham/analytics/daily-plugin-usage-metrics';
const skillsPath = '/backend-api/wham/analytics/daily-skill-usage-metrics';
const resetCreditsPath = '/backend-api/wham/rate-limit-reset-credits';
const resetHistoryPath = '/backend-api/wham/rate-limit-reset-credits/history';
const resetCredits = { credits: [{ reset_type: 'weekly', status: 'available', title: 'Earned reset', description: 'A reset from supplied activity', is_supported_by_plan: false, granted_at: '2026-10-07T20:40:00Z', expires_at: '2026-11-06T20:40:00Z' }], available_count: 5, total_earned_count: 9 };
const resetHistory = { events: [{ kind: 'granted', occurred_at: '2026-10-07T20:40:00Z' }], window_start: '2026-09-27T21:44:00Z', as_of: '2026-10-27T16:00:00Z', next_cursor: null };
const plugins = { group_by: 'day', data_freshness_ts: '2026-10-27T16:00:00Z', data: [{ date: '2026-10-26', plugin_usage_overviews: [{ plugin_name: 'files', display_name: 'Files', marketplace: 'official', invocation_counts: 5 }] }] };
const skills = { group_by: 'day', data_freshness_ts: '2026-10-27T15:00:00Z', data: [{ date: '2026-10-26', skill_usage_overviews: [{ skill_name: 'review', display_name: 'Review', invocation_counts: 3 }] }] };
const messages = { data: [{ date: '2026-10-26', totals: { turns: 8 }, models: [{ model: 'gpt-6.1-sol', turns: 8 }], clients: [{ client_id: 'CODEX_CLI', turns: 8 }] }] };
const tokenUsage = { data: [{ date: '2026-10-26', totals: { turns: 8, uncached_text_input_tokens: 1000001, cached_text_input_tokens: 2000002, text_output_tokens: 7, text_total_tokens: 9000009 },
  models: [{ model: 'gpt-6.1-sol', turns: 8 }], clients: [
    { client_id: 'CODEX_CLI', turns: 5, uncached_text_input_tokens: 1000001, cached_text_input_tokens: 0, text_output_tokens: 9, text_total_tokens: 1000010 },
    { client_id: 'CODEX_WEB', turns: 3, uncached_text_input_tokens: 0, cached_text_input_tokens: null, text_output_tokens: 5, text_total_tokens: 500 },
  ] }] };
const timestamp = Date.parse('2026-10-27T17:00:00Z');
const usage = {
  plan_type: 'plus',
  rate_limit: {
    primary_window: { used_percent: 25, limit_window_seconds: 604800, reset_at: 1793725200 },
    secondary_window: { used_percent: 40, limit_window_seconds: 18000, reset_at: 1793120400 },
  },
  credits: { has_credits: true, unlimited: false, balance: '12.50' },
  rate_limit_reset_credits: { available_count: 2, applicable_available_count: 0 },
};

const analytics = {
  profile: { username: 'PRIVATE_PROFILE_NAME', profile_picture_url: 'PRIVATE_PROFILE_URL' },
  stats: { lifetime_tokens: 123456, peak_daily_tokens: 9876, current_streak_days: 4,
    longest_streak_days: 8, total_threads: 42, longest_running_turn_sec: 300,
    fast_mode_usage_percentage: 12.5, total_skills_used: 9, unique_skills_used: 3,
    most_used_reasoning_effort: 'high', most_used_reasoning_effort_percentage: 75,
    daily_usage_buckets: [{ start_date: '2026-10-26', tokens: 3456 }],
    cumulative_daily_usage_buckets: [{ start_date: '2026-10-26', tokens: 123456 }],
    weekly_usage_buckets: [{ start_date: '2026-10-19', tokens: 45678 }],
    workspace_rank: null, workspace_total_user_count: null },
  metadata: { stats_as_of: '2026-10-27T16:00:00Z', generated_at: '2026-10-27T16:01:00Z', stats_error: null },
};

async function loadExtension() {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.ok(Array.isArray(manifest.pi?.extensions) && manifest.pi.extensions.length > 0,
    'An installable Pi package must declare its extension entry in pi.extensions');
  let module;
  try {
    module = await import(new URL(manifest.pi.extensions[0], root));
  } catch (error) {
    assert.fail(`Declared usage extension must load: ${error.code ?? error.name}`);
  }
  assert.equal(typeof module.default, 'function', 'Pi extension must export a default registration function');
  return module.default;
}

function response(body = usage, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function harness(options = {}) {
  const commands = new Map();
  const events = new Map();
  const entries = [];
  const requests = [];
  const widgets = [];
  const statuses = [];
  const timers = new Map();
  const notifications = [];
  const selections = [];
  const declarations = [];
  const servicesById = new Map();
  const bus = new Map();
  const stateListeners = new Set();
  const environment = {
    replicatedState: initial => ({
      value: initial,
      replace(_context, next) { this.value = next; for (const listener of stateListeners) listener(next); },
      subscribe(listener) { stateListeners.add(listener); return () => stateListeners.delete(listener); },
    }),
    provide: (token, service) => servicesById.set(token.id, service),
  };
  let branch = [];
  let session = 'session-a';
  let nextTimer = 0;
  const pi = {
    events: {
      on(name, listener) { const listeners = bus.get(name) ?? new Set(); listeners.add(listener); bus.set(name, listeners); return () => listeners.delete(listener); },
      emit(name, payload) {
        if (name === 'pi-gui:desktop-view:register') {
          declarations.push(payload.declaration);
          payload.accept();
          payload.declaration.backend().setup(environment);
        }
        for (const listener of bus.get(name) ?? []) listener(payload);
      },
    },
    registerCommand: (name, command) => commands.set(name, command),
    on: (name, callback) => { const listeners = events.get(name) ?? new Set(); listeners.add(callback); events.set(name, listeners); return () => listeners.delete(callback); },
    appendEntry: (customType, data) => {
      const entry = { type: 'custom', customType, data };
      entries.push(entry);
      branch.push(entry);
    },
  };
  const ctx = {
    model: { provider: 'openai-codex', id: 'gpt-5.4', baseUrl: 'https://chatgpt.com/backend-api' },
    modelRegistry: {
      isUsingOAuth: () => options.oauth ?? true,
      getProvider: () => ({ id: 'openai-codex', baseUrl: options.baseUrl ?? 'https://chatgpt.com/backend-api' }),
      getProviderAuth: async (provider) => {
        assert.equal(provider, 'openai-codex', 'Use Pi Codex auth, never another provider');
        if (options.getAuth) return options.getAuth(provider);
        if (options.authError) throw options.authError;
        return options.auth === null ? undefined : options.auth ?? {
          source: 'OAuth',
          auth: { apiKey: secret, headers: { 'ChatGPT-Account-Id': 'test-account' } },
        };
      },
    },
    sessionManager: {
      getSessionId: () => session,
      getSessionFile: () => `${session}.jsonl`,
      getLeafId: () => 'leaf',
      getBranch: () => branch,
      getEntries: () => branch,
    },
    hasUI: true,
    ui: {
      notify: (message, type) => notifications.push({ message, type }),
      select: async (title, items) => { selections.push({ title, items }); return options.selection; },
      setStatus: (key, text) => statuses.push({ key, text }),
      setWidget: (key, lines, options) => widgets.push({ key, lines, options }),
    },
  };
  const services = {
    now: () => options.now ?? timestamp,
    ...(options.requestTimeoutMs == null ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
    setInterval: (callback, ms) => { timers.set(++nextTimer, { callback, ms }); return nextTimer; },
    clearInterval: (id) => timers.delete(id),
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      const usageCount = requests.filter(r => r.url === endpoint).length;
      if (options.fetch) return options.fetch(url, init, usageCount);
      if (new URL(url).pathname === resetCreditsPath) return response(resetCredits);
      if (new URL(url).pathname === resetHistoryPath) return response(resetHistory);
      if (new URL(url).pathname === pluginsPath) return response(plugins);
      if (new URL(url).pathname === skillsPath) return response(skills);
      if (new URL(url).pathname === messagesPath) return response(messages);
      return response(String(url) === analyticsEndpoint ? analytics : usage);
    },
  };
  const extension = await loadExtension();
  await extension(pi, services);
  const fire = async (name, event = {}) => {
    assert.ok(events.has(name), `Extension handles ${name}`);
    for (const listener of events.get(name)) await listener({ type: name, ...event }, ctx);
  };
  const command = (args = 'compact') => {
    assert.ok(commands.has('codex-usage'), 'Extension registers /codex-usage');
    return commands.get('codex-usage').handler(args, ctx);
  };
  const invokeRegisteredUsage = async (args = 'compact') => {
    const entry = [...commands].find(([name]) => /usage/.test(name));
    assert.ok(entry, 'A public usage command exists for independent display behavior checks');
    return entry[1].handler(args, ctx);
  };
  const compactText = () => (widgets.at(-1)?.lines ?? []).join('\n');
  const detailsService = () => servicesById.get('pi-gui-codex-usage.details');
  const snapshot = () => detailsService()?.state.value;
  const reportText = () => {
    const state = snapshot();
    assert.ok(state, 'Sanitized report state is available to the registered view');
    return ['overview', 'analytics'].map(name => {
      const section = state[name];
      const metrics = section?.metrics?.map(metric => `${metric.label}: ${metric.value}`).join('\n') ?? section?.lines?.join('\n') ?? '';
      const windows = section?.windows?.map(window => `${window.label}: ${window.usedPercent == null ? '' : `${window.usedPercent}% used · ${window.leftPercent}% remaining`} · reset ${window.resetAt ?? ''}`).join('\n') ?? '';
      const invocations = section?.invocations?.map(item => Object.values(item).join(' · ')).join('\n') ?? '';
      return `${name === 'overview' ? 'Limits' : 'Analytics'}: ${section?.stale ? 'stale · last successful' : 'updated'} ${section?.updatedAt == null ? '' : new Date(section.updatedAt).toLocaleString()}\n${section?.error ?? ''}\n${metrics}\n${windows}\n${invocations}`;
    }).join('\n');
  };
  const output = () => JSON.stringify({ entries, widgets, statuses, snapshot: snapshot() });
  return { ctx, commands, entries, requests, usageRequests: () => requests.filter(r => r.url === endpoint),
    timers, fire, command, invokeRegisteredUsage, widgets, statuses, compactText, reportText, output,
    notifications, selections, declarations, detailsService, snapshot,
    restore: (saved, id = session) => { branch = [...saved]; session = id; },
  };
}

export { root, secret, endpoint, analyticsEndpoint, messagesPath, messages, tokenUsage, pluginsPath, skillsPath, plugins, skills, resetCreditsPath, resetHistoryPath, resetCredits, resetHistory, timestamp, usage, analytics, response, loadExtension, harness };
