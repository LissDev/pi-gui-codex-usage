const key = 'codex-usage';
const visibilityType = 'codex-usage.visibility';
const origin = 'https://chatgpt.com';
const unavailable = 'unavailable';
const label = field => field.replaceAll('_', ' ');
const object = item => item !== null && typeof item === 'object' && !Array.isArray(item);
function value(item) {
  if (item == null) return unavailable;
  if (!['string', 'number', 'boolean'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item))) throw new Error('Invalid metric');
  return String(item).replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}
function date(seconds) {
  if (seconds == null) return unavailable;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || !Number.isFinite(new Date(seconds * 1000).getTime())) throw new Error('Invalid reset');
  return new Date(seconds * 1000).toLocaleString();
}

function duration(seconds) {
  for (const [unit, size] of [['days', 86400], ['hours', 3600], ['minutes', 60]]) {
    if (seconds > 0 && seconds % size === 0) return `${seconds / size} ${unit}`;
  }
  return seconds > 0 ? `${seconds} seconds` : 'window';
}

function rateLines(title, rate) {
  if (rate == null) return [`${title}: ${unavailable}`];
  if (!object(rate)) throw new Error('Invalid limits');
  const lines = [`${title} · allowed: ${value(rate.allowed)} · limit reached: ${value(rate.limit_reached)}`];
  for (const name of ['primary_window', 'secondary_window']) {
    const window = rate[name];
    if (window == null) { lines.push(`${label(name)}: ${unavailable}`); continue; }
    if (!object(window)) throw new Error('Invalid window');
    const used = window?.used_percent;
    if (used != null && (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100)) throw new Error('Invalid percentage');
    if (window.limit_window_seconds != null && (typeof window.limit_window_seconds !== 'number' || !Number.isFinite(window.limit_window_seconds) || window.limit_window_seconds <= 0)) throw new Error('Invalid duration');
    lines.push(`${duration(window.limit_window_seconds)}: ${used == null ? unavailable : `${used}% used · ${100 - used}% remaining`} · resets ${date(window.reset_at)} · reset after seconds: ${value(window.reset_after_seconds)}`);
  }
  return lines;
}

function limitsLines(body) {
  if (!object(body) || !Object.hasOwn(body, 'rate_limit')) throw new Error('Invalid usage');
  const lines = [`Plan: ${value(body.plan_type)}`, ...rateLines('Included limits', body.rate_limit), ...rateLines('Code review limits', body.code_review_rate_limit)];
  if (body.additional_rate_limits == null) lines.push(`Additional limits: ${unavailable}`);
  else {
    if (!Array.isArray(body.additional_rate_limits)) throw new Error('Invalid additional limits');
    for (const extra of body.additional_rate_limits) {
      lines.push(...rateLines(`Additional ${value(extra.limit_name)} · ${value(extra.metered_feature)}`, extra.rate_limit));
    }
  }
  lines.push(`Credits: ${value(body.credits?.balance)} · unlimited: ${value(body.credits?.unlimited)} · available: ${value(body.credits?.has_credits)} · overage limit reached: ${value(body.credits?.overage_limit_reached)}`);
  for (const field of ['approx_local_messages', 'approx_cloud_messages']) {
    const messages = body.credits?.[field];
    if (messages != null && !Array.isArray(messages)) throw new Error('Invalid credits');
    lines.push(`Credits ${label(field)}: ${messages?.map(value).join(' – ') ?? unavailable}`);
  }
  for (const [model, usage] of Object.entries(body.model_usage ?? {})) {
    lines.push(`${value(model)} · available: ${value(usage?.available)} · available at: ${date(usage?.available_at)} · credits would enable: ${value(usage?.credits_would_enable)}`);
  }
  lines.push(`Spend control reached: ${value(body.spend_control?.reached)}`);
  const spend = body.spend_control?.individual_limit;
  lines.push(`Spend individual limit: ${spend == null ? unavailable : ['source', 'limit', 'used', 'remaining', 'used_percent'].map(field => `${label(field)}: ${value(spend[field])}`).join(' · ')}`);
  lines.push(`Rate limit reached type: ${value(body.rate_limit_reached_type)}`);
  lines.push(`Promo: ${value(body.promo)}`);
  lines.push(`Earned resets: ${value(body.rate_limit_reset_credits?.available_count)} · applicable: ${value(body.rate_limit_reset_credits?.applicable_available_count)}`);
  return lines;
}

function analyticsLines(body) {
  if (!object(body) || !object(body.stats) || body.metadata?.stats_error != null) throw new Error('Invalid analytics');
  const lines = [];
  const fields = ['lifetime_tokens', 'peak_daily_tokens', 'current_streak_days', 'longest_streak_days', 'total_threads', 'longest_running_turn_sec', 'fast_mode_usage_percentage', 'total_skills_used', 'unique_skills_used', 'most_used_reasoning_effort', 'most_used_reasoning_effort_percentage', 'workspace_rank', 'workspace_total_user_count'];
  for (const field of fields) lines.push(`${label(field)}: ${value(body.stats?.[field])}`);
  for (const field of ['daily_usage_buckets', 'cumulative_daily_usage_buckets', 'weekly_usage_buckets']) {
    const buckets = body.stats[field];
    if (buckets != null && !Array.isArray(buckets)) throw new Error('Invalid buckets');
    lines.push(`${label(field)}: ${buckets?.map(bucket => `${value(bucket.start_date)}: ${value(bucket.tokens)}`).join(' · ') ?? unavailable}`);
  }
  const invocations = body.stats.top_invocations;
  if (invocations != null && !Array.isArray(invocations)) throw new Error('Invalid invocations');
  lines.push(`Top invocations: ${invocations?.map(item => `${value(item.type)} · ${value(item.plugin_name)} · ${value(item.skill_name)}: ${value(item.usage_count)}`).join(' / ') ?? unavailable}`);
  lines.push(`Stats as of: ${value(body.metadata?.stats_as_of)} · generated at: ${value(body.metadata?.generated_at)}`);
  return lines;
}

function official(url) {
  try { const parsed = new URL(url); return parsed.origin === origin && !parsed.username && !parsed.password; }
  catch { return false; }
}

export default function codexUsage(pi, services = {}) {
  const fetch = services.fetch ?? globalThis.fetch;
  const setInterval = services.setInterval ?? globalThis.setInterval;
  const clearInterval = services.clearInterval ?? globalThis.clearInterval;
  const now = services.now ?? Date.now;
  const timeoutMs = services.requestTimeoutMs ?? 25000;
  let visible = false;
  let timer;
  let generation = 0;
  let running;
  let identity;
  let sections = {};

  function clear(ctx) {
    generation++;
    running?.controller.abort();
    running = undefined;
    clearInterval(timer);
    timer = undefined;
    ctx.ui.setWidget(key, undefined);
    ctx.ui.setStatus(key, undefined);
  }

  function render(ctx, authMessage) {
    const lines = ['Codex Usage'];
    if (authMessage) lines.push(authMessage);
    for (const title of ['Limits', 'Analytics']) {
      const section = sections[title];
      lines.push(`${title}: ${section ? `${section.stale ? 'stale · last successful' : 'updated'} ${new Date(section.at).toLocaleString()}` : unavailable}`);
      if (section) lines.push(...section.lines);
    }
    ctx.ui.setWidget(key, lines, { placement: 'aboveEditor' });
    ctx.ui.setStatus(key, `Codex Usage · ${['Limits', 'Analytics'].map(title => `${title} ${sections[title] ? sections[title].stale ? 'stale' : 'updated' : unavailable}`).join(' · ')}`);
  }

  function refresh(ctx) {
    if (!visible) return;
    if (running) return running.promise;
    const work = { controller: new AbortController(), generation };
    running = work;
    const current = () => visible && generation === work.generation;
    const signal = work.controller.signal;
    const timeout = setTimeout(() => work.controller.abort(), timeoutMs);
    function bounded(promise) {
      return new Promise((resolve, reject) => {
        const aborted = () => reject(new Error('Cancelled'));
        if (signal.aborted) { aborted(); return; }
        signal.addEventListener('abort', aborted, { once: true });
        Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
      });
    }
    work.promise = (async () => {
      let resolved;
      try {
        resolved = await bounded(ctx.modelRegistry.getProviderAuth('openai-codex'));
      } catch {
        if (current()) {
          identity = undefined;
          sections = {};
          render(ctx, 'Pi authentication unavailable; sign in and refresh');
        }
        return;
      }
      if (!current() || signal.aborted) return;
      const provider = ctx.modelRegistry.getProvider('openai-codex');
      if (!resolved?.auth?.apiKey || !ctx.modelRegistry.isUsingOAuth({ provider: 'openai-codex' }) || !official(provider?.baseUrl) || (resolved.auth.baseUrl && !official(resolved.auth.baseUrl))) {
        identity = undefined;
        sections = {};
        render(ctx, 'Official Pi OAuth authentication unavailable');
        return;
      }
      const headers = new Headers(resolved.auth.headers);
      headers.set('authorization', `Bearer ${resolved.auth.apiKey}`);
      let account = headers.get('chatgpt-account-id')?.trim();
      if (!account) {
        try {
          const parts = resolved.auth.apiKey.split('.');
          const payload = parts.length === 3 ? JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) : undefined;
          const claim = payload?.['https://api.openai.com/auth']?.chatgpt_account_id;
          if (typeof claim === 'string') account = claim.trim();
        } catch {}
      }
      if (!account) {
        identity = undefined;
        sections = {};
        render(ctx, 'Pi OAuth account identity unavailable; sign in and refresh');
        return;
      }
      headers.set('chatgpt-account-id', account);
      if (account !== identity) {
        sections = {};
        identity = account;
        render(ctx);
      }
      await Promise.all([['usage', 'Limits', limitsLines], ['profiles/me', 'Analytics', analyticsLines]].map(async ([path, title, format]) => {
        try {
          const response = await bounded(fetch(`${origin}/backend-api/wham/${path}`, { method: 'GET', headers, redirect: 'error', signal }));
          if (!response.ok) throw new Error('Unavailable');
          const lines = format(await bounded(response.json()));
          if (current() && !signal.aborted) sections[title] = { lines, at: now(), stale: false };
        } catch {
          if (current() && sections[title]) sections[title].stale = true;
        }
      }));
      if (current()) render(ctx);
    })().finally(() => {
      clearTimeout(timeout);
      if (running === work) running = undefined;
    });
    return work.promise;
  }

  function start(ctx) {
    clearInterval(timer);
    timer = setInterval(() => refresh(ctx), 180000);
    return refresh(ctx);
  }

  pi.registerCommand('usage', {
    description: 'Show Codex usage; /usage hide stops and hides it',
    handler: async (args, ctx) => {
      visible = args.trim() !== 'hide';
      pi.appendEntry(visibilityType, { visible });
      if (visible) await start(ctx);
      else clear(ctx);
    },
  });

  async function restore(_event, ctx) {
    clear(ctx);
    identity = undefined;
    sections = {};
    visible = ctx.sessionManager.getBranch().filter(entry => entry.type === 'custom' && entry.customType === visibilityType).at(-1)?.data?.visible === true;
    if (visible) await start(ctx);
  }
  pi.on('session_start', restore);
  pi.on('session_tree', restore);
  pi.on('session_shutdown', (_event, ctx) => { visible = false; clear(ctx); });
}
import { Buffer } from 'node:buffer';

