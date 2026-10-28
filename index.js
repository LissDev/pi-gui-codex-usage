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
  return localDate(seconds * 1000);
}
function localDate(milliseconds) {
  const time = new Date(milliseconds);
  const pad = number => String(number).padStart(2, '0');
  return `${time.getFullYear()}.${pad(time.getMonth() + 1)}.${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}
function resetCountdown(resetAt, now) {
  const remaining = resetAt * 1000 - now;
  if (remaining <= 0) return 'Reset due';
  const minutes = Math.ceil(remaining / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const parts = [days && `${days}d`, hours && `${hours}h`, minutes % 60 && `${minutes % 60}m`];
  return `Resets in ${parts.filter(Boolean).join(' ')}`;
}
function addMetric(metrics, name, item, format) {
  if (item == null) return;
  const cleaned = typeof item === 'string' ? value(item).trim() : (value(item), item);
  if (cleaned === '') return;
  metrics.push({ label: name, value: cleaned, ...(format ? { format } : {}) });
}

function duration(seconds) {
  for (const [unit, size] of [['days', 86400], ['hours', 3600], ['minutes', 60]]) {
    if (seconds > 0 && seconds % size === 0) return `${seconds / size} ${unit}`;
  }
  return seconds > 0 ? `${seconds} seconds` : 'window';
}

function rateMetrics(title, rate, windows, metrics) {
  if (rate == null) return;
  if (!object(rate)) throw new Error('Invalid limits');
  addMetric(metrics, `${title} allowed`, rate.allowed);
  addMetric(metrics, `${title} limit reached`, rate.limit_reached);
  for (const name of ['primary_window', 'secondary_window']) {
    const window = rate[name];
    if (window == null) continue;
    if (!object(window)) throw new Error('Invalid window');
    const used = window?.used_percent;
    if (used != null && (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100)) throw new Error('Invalid percentage');
    if (window.limit_window_seconds != null && (typeof window.limit_window_seconds !== 'number' || !Number.isFinite(window.limit_window_seconds) || window.limit_window_seconds <= 0)) throw new Error('Invalid duration');
    if (window.reset_at != null) date(window.reset_at);
    addMetric(metrics, `${title} ${duration(window.limit_window_seconds)} reset after seconds`, window.reset_after_seconds);
    if ([used, window.limit_window_seconds, window.reset_at].every(item => item == null)) continue;
    windows.push({ label: `${title === 'Included limits' ? '' : `${title} · `}${duration(window.limit_window_seconds)}`, usedPercent: used ?? null, leftPercent: used == null ? null : 100 - used, resetAt: window.reset_at ?? null });
  }
}

function limitsReport(body) {
  if (!object(body) || !Object.hasOwn(body, 'rate_limit')) throw new Error('Invalid usage');
  const windows = [];
  const metrics = [];
  addMetric(metrics, 'Plan', body.plan_type);
  rateMetrics('Included limits', body.rate_limit, windows, metrics);
  rateMetrics('Code review limits', body.code_review_rate_limit, windows, metrics);
  if (body.additional_rate_limits != null) {
    if (!Array.isArray(body.additional_rate_limits)) throw new Error('Invalid additional limits');
    for (const extra of body.additional_rate_limits) {
      const name = [extra.limit_name, extra.metered_feature].filter(item => item != null && item !== '').map(value).join(' · ');
      rateMetrics(`Additional limits${name ? ` · ${name}` : ''}`, extra.rate_limit, windows, metrics);
    }
  }
  addMetric(metrics, 'Credits', body.credits?.balance);
  addMetric(metrics, 'Credits unlimited', body.credits?.unlimited);
  addMetric(metrics, 'Credits available', body.credits?.has_credits);
  addMetric(metrics, 'Credits overage limit reached', body.credits?.overage_limit_reached);
  for (const field of ['approx_local_messages', 'approx_cloud_messages']) {
    const messages = body.credits?.[field];
    if (messages != null && !Array.isArray(messages)) throw new Error('Invalid credits');
    addMetric(metrics, `Credits ${label(field)}`, messages?.filter(item => item != null).map(value).join(' – '));
  }
  for (const [model, usage] of Object.entries(body.model_usage ?? {})) {
    addMetric(metrics, `${value(model)} available`, usage?.available);
    if (usage?.available_at != null) {
      date(usage.available_at);
      addMetric(metrics, `${value(model)} available at`, usage.available_at * 1000, 'datetime');
    }
    addMetric(metrics, `${value(model)} credits would enable`, usage?.credits_would_enable);
  }
  addMetric(metrics, 'Spend control reached', body.spend_control?.reached);
  const spend = body.spend_control?.individual_limit;
  for (const field of ['source', 'limit', 'used', 'remaining', 'used_percent']) addMetric(metrics, `Spend individual limit ${label(field)}`, spend?.[field]);
  addMetric(metrics, 'Rate limit reached type', body.rate_limit_reached_type);
  addMetric(metrics, 'Promo', body.promo);
  addMetric(metrics, 'Earned resets', body.rate_limit_reset_credits?.available_count);
  addMetric(metrics, 'Applicable earned resets', body.rate_limit_reset_credits?.applicable_available_count);
  return { metrics, windows };
}

function analyticsReport(body) {
  if (!object(body) || !object(body.stats) || body.metadata?.stats_error != null) throw new Error('Invalid analytics');
  const metrics = [];
  const fields = ['lifetime_tokens', 'peak_daily_tokens', 'current_streak_days', 'longest_streak_days', 'total_threads', 'longest_running_turn_sec', 'fast_mode_usage_percentage', 'total_skills_used', 'unique_skills_used', 'most_used_reasoning_effort', 'most_used_reasoning_effort_percentage', 'workspace_rank', 'workspace_total_user_count'];
  for (const field of fields) addMetric(metrics, label(field), body.stats[field]);
  const series = [];
  for (const field of ['daily_usage_buckets', 'cumulative_daily_usage_buckets', 'weekly_usage_buckets']) {
    const buckets = body.stats[field];
    if (buckets != null && !Array.isArray(buckets)) throw new Error('Invalid buckets');
    series.push((buckets ?? []).filter(bucket => {
      if (bucket.tokens != null && (typeof bucket.tokens !== 'number' || !Number.isFinite(bucket.tokens) || bucket.tokens < 0)) throw new Error('Invalid token count');
      return validDate(bucket.start_date);
    }).map(bucket => ({ date: bucket.start_date, tokens: bucket.tokens ?? null }))
      .sort((first, second) => first.date.localeCompare(second.date)));
  }
  const suppliedInvocations = body.stats.top_invocations;
  if (suppliedInvocations != null && !Array.isArray(suppliedInvocations)) throw new Error('Invalid invocations');
  const invocations = (suppliedInvocations ?? []).map(item => {
    const invocation = {};
    for (const [source, target] of [['type', 'type'], ['plugin_name', 'pluginName'], ['skill_name', 'skillName'], ['usage_count', 'usageCount']]) {
      if (item[source] == null) continue;
      const cleaned = typeof item[source] === 'string' ? value(item[source]).trim() : (value(item[source]), item[source]);
      if (cleaned !== '') invocation[target] = cleaned;
    }
    return invocation;
  }).filter(item => Object.keys(item).length);
  for (const field of ['stats_as_of', 'generated_at']) {
    if (body.metadata?.[field] == null) continue;
    const timestamp = Date.parse(body.metadata[field]);
    if (!Number.isFinite(timestamp)) throw new Error('Invalid statistics timestamp');
    addMetric(metrics, label(field), timestamp, 'datetime');
  }
  return { metrics, invocations, daily: series[0], cumulative: series[1], weekly: series[2] };
}

function official(url) {
  try { const parsed = new URL(url); return parsed.origin === origin && !parsed.username && !parsed.password; }
  catch { return false; }
}

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

function validateHistoryRange(range) {
  if (!validDate(range?.startDate) || !validDate(range?.endDate) || range.startDate > range.endDate) throw new Error('Invalid history range');
  return { startDate: range.startDate, endDate: range.endDate };
}

function latestHistoryRange(timestamp, days = 7) {
  const end = new Date(timestamp);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
  const key = day => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  return { startDate: key(start), endDate: key(end) };
}

function usageHistoryReport(body, range) {
  if (!object(body) || !['percent', 'credits'].includes(body.units) || !Array.isArray(body.data)) throw new Error('Usage history unavailable');
  const data = body.data.map(day => {
    if (!validDate(day.date) || !Array.isArray(day.attribution)) throw new Error('Invalid usage history');
    const attribution = day.attribution.map(row => {
      if (!object(row) || (row.value != null && (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0))) throw new Error('Invalid usage attribution');
      const item = { value: row.value ?? null };
      for (const field of ['thread_source', 'turn_trigger', 'model', 'surface']) {
        if (row[field] == null) continue;
        if (typeof row[field] !== 'string') throw new Error('Invalid usage dimension');
        const name = value(row[field]).trim();
        if (name) item[field] = name;
      }
      return item;
    });
    return { date: day.date, attribution };
  }).filter(day => day.date >= range.startDate && day.date <= range.endDate).sort((first, second) => first.date.localeCompare(second.date));
  return { units: body.units, data, dataAsOf: null };
}

function messagesReport(body, range) {
  if (!object(body) || !Array.isArray(body.data)) throw new Error('Invalid messages');
  const count = turns => {
    if (turns == null) return null;
    if (!Number.isInteger(turns) || turns < 0) throw new Error('Invalid message count');
    return turns;
  };
  const tokens = source => {
    const measures = {};
    for (const field of ['uncached_text_input_tokens', 'cached_text_input_tokens', 'text_output_tokens', 'text_total_tokens']) {
      if (Object.hasOwn(source ?? {}, field)) measures[field] = count(source[field]);
    }
    return measures;
  };
  const data = body.data.map(day => {
    if (!object(day) || !validDate(day.date)) throw new Error('Invalid messages date');
    const normalized = { date: day.date, totals: { turns: count(day.totals?.turns), ...tokens(day.totals) } };
    for (const [field, name] of [['models', 'model'], ['clients', 'client_id']]) {
      if (day[field] != null && !Array.isArray(day[field])) throw new Error('Invalid message groups');
      normalized[field] = (day[field] ?? []).map(group => {
        if (!object(group) || typeof group[name] !== 'string') throw new Error('Invalid message group');
        return { [name]: value(group[name]).trim(), turns: count(group.turns), ...(field === 'clients' ? tokens(group) : {}) };
      });
    }
    return normalized;
  }).filter(day => day.date >= range.startDate && day.date <= range.endDate).sort((first, second) => first.date.localeCompare(second.date));
  return { data, dataAsOf: null };
}

function toolsReport(body, range, kind) {
  if (!object(body) || !Array.isArray(body.data) || (body.group_by != null && body.group_by !== 'day')) throw new Error('Invalid tool activity');
  const field = `${kind}_usage_overviews`;
  const nameField = `${kind}_name`;
  const fields = kind === 'plugin' ? ['plugin_name', 'display_name', 'marketplace'] : ['skill_name', 'display_name'];
  const data = body.data.map(day => {
    if (!object(day) || !validDate(day.date) || !Array.isArray(day[field])) throw new Error('Invalid tool day');
    const rows = day[field].map(row => {
      if (!object(row) || typeof row[nameField] !== 'string' || !value(row[nameField]).trim()) throw new Error('Invalid tool name');
      if (row.invocation_counts != null && (!Number.isInteger(row.invocation_counts) || row.invocation_counts < 0)) throw new Error('Invalid invocation count');
      const cleaned = {};
      for (const name of fields) {
        if (row[name] == null) continue;
        if (typeof row[name] !== 'string') throw new Error('Invalid tool label');
        const text = value(row[name]).trim();
        if (text) cleaned[name] = text;
      }
      return { ...cleaned, invocation_counts: row.invocation_counts ?? null };
    });
    return { date: day.date, [field]: rows };
  }).filter(day => day.date >= range.startDate && day.date <= range.endDate).sort((first, second) => first.date.localeCompare(second.date));
  const dataAsOf = body.data_freshness_ts == null ? null : typeof body.data_freshness_ts === 'string' ? Date.parse(body.data_freshness_ts) : NaN;
  if (dataAsOf != null && !Number.isFinite(dataAsOf)) throw new Error('Invalid tool freshness');
  return { data, dataAsOf };
}

function resetTimestamp(timestamp) {
  if (timestamp == null) return null;
  const parts = typeof timestamp === 'string' && /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(timestamp);
  if (!parts || !validDate(parts[1])) throw new Error('Invalid reset timestamp');
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) throw new Error('Invalid reset timestamp');
  return parsed;
}

function resetCreditsReport(body) {
  if (!object(body) || !Array.isArray(body.credits)) throw new Error('Invalid reset credits');
  const credits = body.credits.map(credit => {
    if (!object(credit)) throw new Error('Invalid reset credit');
    const cleaned = {};
    for (const field of ['reset_type', 'status', 'title', 'description']) {
      if (credit[field] == null) continue;
      if (typeof credit[field] !== 'string') throw new Error('Invalid reset credit text');
      cleaned[field] = value(credit[field]);
    }
    if (credit.is_supported_by_plan != null && typeof credit.is_supported_by_plan !== 'boolean') throw new Error('Invalid plan support');
    cleaned.is_supported_by_plan = credit.is_supported_by_plan ?? null;
    for (const field of ['granted_at', 'expires_at']) cleaned[field] = resetTimestamp(credit[field]);
    return cleaned;
  });
  const report = { credits, dataAsOf: null };
  for (const field of ['available_count', 'total_earned_count']) {
    if (body[field] != null && (!Number.isInteger(body[field]) || body[field] < 0)) throw new Error('Invalid reset count');
    report[field] = body[field] ?? null;
  }
  return report;
}

function resetHistoryReport(body) {
  if (!object(body) || !Array.isArray(body.events)) throw new Error('Invalid reset history');
  const events = body.events.map(event => {
    if (!object(event) || typeof event.kind !== 'string') throw new Error('Invalid reset event');
    return { kind: value(event.kind), occurred_at: resetTimestamp(event.occurred_at) };
  });
  return { events, window_start: resetTimestamp(body.window_start), dataAsOf: resetTimestamp(body.as_of) };
}

function bounded(promise, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new Error('Cancelled'));
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function localSessionCatalog(signal) {
  const { readFile } = await import('node:fs/promises');
  return {
    listAll: () => SessionManager.listAll(undefined, signal),
    async readEntries(path) {
      const content = await readFile(path, { encoding: 'utf8', signal });
      const entries = parseSessionEntries(content);
      if (entries[0]?.type !== 'session' || entries.length !== content.split('\n').filter(line => line.trim()).length) throw new Error('Invalid local session');
      return entries;
    },
  };
}

function chatAmounts(row) {
  if (!object(row)) throw new Error('Invalid chat usage');
  const amounts = {};
  for (const [source, target] of [['weekly_limit_percent', 'weeklyLimitPercent'], ['five_hour_limit_percent', 'fiveHourLimitPercent']]) {
    const measure = row[source];
    if (measure != null && (typeof measure !== 'number' || !Number.isFinite(measure) || measure < 0)) throw new Error('Invalid chat percentage');
    amounts[target] = measure ?? null;
  }
  const credits = row.balance_usage_credits;
  if (credits != null && (typeof credits !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(credits) || !Number.isFinite(Number(credits)))) throw new Error('Invalid chat credits');
  amounts.balanceUsageCredits = credits ?? null;
  return amounts;
}

function topChatsReport(body, candidates, limited) {
  if (!object(body) || !Array.isArray(body.threads)) throw new Error('Invalid chat usage');
  const dataAsOf = resetTimestamp(body.data_as_of);
  const requested = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const seen = new Set();
  const data = [];
  for (const row of body.threads) {
    if (!object(row) || typeof row.thread_id !== 'string') throw new Error('Invalid chat identity');
    if (!requested.has(row.thread_id)) continue;
    if (seen.has(row.thread_id)) throw new Error('Duplicate chat identity');
    seen.add(row.thread_id);
    if (!['available', 'partial'].includes(row.data_status)) continue;
    const amounts = chatAmounts(row);
    if (row.groups != null && !Array.isArray(row.groups)) throw new Error('Invalid chat groups');
    const groups = (row.groups ?? []).map(group => {
      const cleaned = chatAmounts(group);
      for (const [source, target] of [['model', 'model'], ['reasoning_effort', 'reasoningEffort'], ['speed', 'speed'], ['product_experience', 'productExperience']]) {
        if (group[source] != null && typeof group[source] !== 'string') throw new Error('Invalid chat dimension');
        cleaned[target] = group[source] == null ? null : value(group[source]);
      }
      return cleaned;
    });
    if (![amounts, ...groups].some(measures => ['weeklyLimitPercent', 'fiveHourLimitPercent', 'balanceUsageCredits'].some(field => measures[field] != null))) continue;
    if (row.usage_source != null && typeof row.usage_source !== 'string') throw new Error('Invalid chat source');
    const { id, ...metadata } = requested.get(row.thread_id);
    data.push({ ...metadata, ...amounts, dataStatus: row.data_status, usageSource: row.usage_source == null ? null : value(row.usage_source), groups });
  }
  data.sort((a, b) => a.weeklyLimitPercent == null ? b.weeklyLimitPercent == null ? 0 : 1 : b.weeklyLimitPercent == null ? -1 : b.weeklyLimitPercent - a.weeklyLimitPercent);
  return { data, coverage: { candidates: candidates.length, matched: data.length, limited }, dataAsOf };
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
  let authWork;
  const sourceRequests = new Map();
  let identity;
  let sections = {};
  let detailsInitialized = false;
  const cards = {
    History: { defaultDays: 7, range: latestHistoryRange(now()), version: 0, section: undefined },
    Messages: { defaultDays: 7, range: latestHistoryRange(now()), version: 0, section: undefined },
    Plugins: { defaultDays: 30, range: latestHistoryRange(now(), 30), version: 0, section: undefined },
    Skills: { defaultDays: 30, range: latestHistoryRange(now(), 30), version: 0, section: undefined },
  };
  let reportState;
  let sessionContext;

  function snapshot(authMessage) {
    const limits = sections.Limits;
    const analytics = sections.Analytics;
    const history = cards.History;
    const messages = cards.Messages;
    const resetCredits = sections['Reset credits'];
    const resetHistory = sections['Reset history'];
    const topChats = sections['Top chats'];
    const left = limits?.windows[0]?.leftPercent;
    return {
      summary: left == null ? 'Codex usage · unavailable' : `Codex usage · ${left}% left`,
      overview: { metrics: limits?.metrics ?? [], windows: limits?.windows ?? [], updatedAt: limits?.at ?? null, stale: limits?.stale ?? false, error: authMessage ?? limits?.error ?? (limits ? null : 'Limits unavailable') },
      analytics: { metrics: analytics?.metrics ?? [], invocations: analytics?.invocations ?? [], daily: analytics?.daily ?? [], cumulative: analytics?.cumulative ?? [], weekly: analytics?.weekly ?? [], updatedAt: analytics?.at ?? null, stale: analytics?.stale ?? false, error: authMessage ?? analytics?.error ?? (analytics ? null : 'Analytics unavailable') },
      history: { ...history.range, units: history.section?.units ?? null, data: history.section?.data ?? [], dataAsOf: history.section?.dataAsOf ?? null, updatedAt: history.section?.at ?? null, stale: history.section?.stale ?? false, error: authMessage ?? history.section?.error ?? (history.section ? null : 'Usage history unavailable') },
      messages: { ...messages.range, data: messages.section?.data ?? [], dataAsOf: messages.section?.dataAsOf ?? null, updatedAt: messages.section?.at ?? null, stale: messages.section?.stale ?? false, error: authMessage ?? messages.section?.error ?? (messages.section ? null : 'Messages unavailable') },
      plugins: toolsSnapshot('Plugins', authMessage),
      skills: toolsSnapshot('Skills', authMessage),
      topChats: { data: topChats?.data ?? [], coverage: topChats?.coverage ?? { candidates: 0, matched: 0, limited: false }, dataAsOf: topChats?.dataAsOf ?? null, updatedAt: topChats?.at ?? null, stale: topChats?.stale ?? false, error: authMessage ?? topChats?.error ?? (topChats ? null : 'Top chats unavailable') },
      resetCredits: { credits: resetCredits?.credits ?? [], available_count: resetCredits?.available_count ?? null, total_earned_count: resetCredits?.total_earned_count ?? null, dataAsOf: null, updatedAt: resetCredits?.at ?? null, stale: resetCredits?.stale ?? false, error: authMessage ?? resetCredits?.error ?? (resetCredits ? null : 'Reset credits unavailable') },
      resetHistory: { events: resetHistory?.events ?? [], window_start: resetHistory?.window_start ?? null, dataAsOf: resetHistory?.dataAsOf ?? null, updatedAt: resetHistory?.at ?? null, stale: resetHistory?.stale ?? false, error: authMessage ?? resetHistory?.error ?? (resetHistory ? null : 'Reset history unavailable') },
    };
  }

  function toolsSnapshot(title, authMessage) {
    const card = cards[title];
    return { ...card.range, data: card.section?.data ?? [], dataAsOf: card.section?.dataAsOf ?? null, updatedAt: card.section?.at ?? null, stale: card.section?.stale ?? false, error: authMessage ?? card.section?.error ?? (card.section ? null : `${title} unavailable`) };
  }

  const registration = registerDesktopView(pi, {
    id: 'codex-usage', title: 'Codex Usage', source: import.meta.url,
    frontend: new URL('./dist/desktop.js', import.meta.url),
    backend: () => ({
      id: 'pi-gui-codex-usage.backend',
      setup(env) {
        reportState = env.replicatedState(snapshot());
        env.provide(CodexUsageDetails, {
          state: reportState,
          async refresh(input = {}) {
            return { verified: sessionContext ? await refresh(sessionContext, { details: true, historyRange: input.historyRange, messagesRange: input.messagesRange, pluginsRange: input.pluginsRange, skillsRange: input.skillsRange }) === true : false };
          },
          async refreshHistory(range) {
            const selected = validateHistoryRange(range);
            return { verified: sessionContext ? await refresh(sessionContext, { details: true, card: 'History', historyRange: selected }) === true : false };
          },
          async refreshMessages(range) {
            const selected = validateHistoryRange(range);
            return { verified: sessionContext ? await refresh(sessionContext, { details: true, card: 'Messages', messagesRange: selected }) === true : false };
          },
          async refreshPlugins(range) {
            const selected = validateHistoryRange(range);
            return { verified: sessionContext ? await refresh(sessionContext, { details: true, card: 'Plugins', pluginsRange: selected }) === true : false };
          },
          async refreshSkills(range) {
            const selected = validateHistoryRange(range);
            return { verified: sessionContext ? await refresh(sessionContext, { details: true, card: 'Skills', skillsRange: selected }) === true : false };
          },
        });
      },
    }),
  });

  function invalidateRequests() {
    generation++;
    authWork?.controller.abort();
    authWork = undefined;
    for (const work of sourceRequests.values()) work.controller.abort();
    sourceRequests.clear();
  }

  function clear(ctx) {
    invalidateRequests();
    clearInterval(timer);
    timer = undefined;
    ctx.ui.setWidget(key, undefined);
    ctx.ui.setStatus(key, undefined);
  }

  function render(ctx, authMessage) {
    const report = snapshot(authMessage);
    reportState?.replace(BACKGROUND_CONTEXT, report);
    if (!visible) return;
    const displayTime = now();
    const limits = report.overview;
    const lines = [];
    if (limits.error) lines.push(limits.error);
    for (const window of limits.windows) {
      const used = window.usedPercent;
      const filled = used == null ? 0 : Math.round(used / 5);
      const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
      const fragments = [`Limit: ${window.label}`];
      if (used != null) fragments.push(`Used ${bar} ${used}%`);
      if (window.leftPercent != null) fragments.push(`Left ${window.leftPercent}%`);
      if (window.resetAt != null) fragments.push(`Reset ${date(window.resetAt)}`, resetCountdown(window.resetAt, displayTime));
      lines.push(fragments.join(' · '));
    }
    if (limits.updatedAt != null) lines.push(`${limits.stale ? 'Stale · last successful update' : 'Updated'}: ${localDate(limits.updatedAt)}`);
    ctx.ui.setWidget(key, lines, { placement: 'aboveEditor' });
    ctx.ui.setStatus(key, report.summary);
  }

  function authenticationUnavailable(ctx, message) {
    invalidateRequests();
    identity = undefined;
    sections = {};
    detailsInitialized = false;
    for (const card of Object.values(cards)) card.section = undefined;
    render(ctx, message);
  }

  function resolveAuth(ctx) {
    if (authWork) return authWork.promise;
    const work = { controller: new AbortController(), generation };
    authWork = work;
    const signal = work.controller.signal;
    const timeout = setTimeout(() => work.controller.abort(), timeoutMs);
    work.promise = (async () => {
      let resolved;
      try {
        resolved = await bounded(ctx.modelRegistry.getProviderAuth('openai-codex'), signal);
      } catch {
        if (generation === work.generation) authenticationUnavailable(ctx, 'Pi authentication unavailable; sign in and refresh');
        return;
      }
      if (generation !== work.generation || signal.aborted) return;
      const provider = ctx.modelRegistry.getProvider('openai-codex');
      if (!resolved?.auth?.apiKey || !ctx.modelRegistry.isUsingOAuth({ provider: 'openai-codex' }) || !official(provider?.baseUrl) || (resolved.auth.baseUrl && !official(resolved.auth.baseUrl))) {
        authenticationUnavailable(ctx, 'Official Pi OAuth authentication unavailable');
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
        authenticationUnavailable(ctx, 'Pi OAuth account identity unavailable; sign in and refresh');
        return;
      }
      headers.set('chatgpt-account-id', account);
      if (account !== identity) {
        invalidateRequests();
        sections = {};
        for (const card of Object.values(cards)) card.section = undefined;
        detailsInitialized = false;
        identity = account;
        render(ctx);
      }
      return { headers, generation };
    })().finally(() => {
      clearTimeout(timeout);
      if (authWork === work) authWork = undefined;
    });
    return work.promise;
  }

  function readSource(auth, path, title, format, deadline) {
    if (sourceRequests.has(title)) return sourceRequests.get(title).promise;
    const card = cards[title];
    const range = card ? { ...card.range } : undefined;
    const version = card?.version;
    const work = { controller: new AbortController(), generation: auth.generation };
    sourceRequests.set(title, work);
    const signal = work.controller.signal;
    const current = () => generation === work.generation && (!card || card.version === version);
    const timeout = setTimeout(() => work.controller.abort(), Math.max(0, deadline - Date.now()));
    work.promise = (async () => {
        let catalogReady = false;
        try {
          const url = new URL(`${origin}/backend-api/wham/${path}`);
          const requestHeaders = new Headers(auth.headers);
          const request = { method: 'GET', headers: requestHeaders, redirect: 'error', signal };
          let candidates;
          let limited;
          if (title === 'Top chats') {
            const catalog = services.sessionCatalog ?? await bounded(localSessionCatalog(signal), signal);
            const sessions = (await bounded(catalog.listAll(), signal)).map(session => ({ id: session.id, path: session.path, name: session.name, created: session.created, modified: session.modified }));
            const recent = sessions.filter(session => typeof session.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id) && Number.isFinite(+session.modified) && +session.modified >= now() - 30 * 86400000 && +session.modified <= now()).sort((a, b) => +b.modified - +a.modified);
            const seen = new Set();
            candidates = [];
            for (const session of recent) {
              if (seen.has(session.id)) continue;
              seen.add(session.id);
              const entries = await bounded(catalog.readEntries(session.path), signal);
              if (!Array.isArray(entries)) throw new Error('Invalid local session');
              if (!entries.some(entry => entry.type === 'message' && entry.message?.role === 'assistant' && entry.message.provider === 'openai-codex' && object(entry.message.usage) && Object.values(entry.message.usage).some(measure => typeof measure === 'number' && Number.isFinite(measure) && measure >= 0))) continue;
              const createdAt = session.created != null && Number.isFinite(+session.created) ? +session.created : null;
              candidates.push({ id: session.id, key: createHash('sha256').update(`${identity}:${session.id}`).digest('hex'), title: typeof session.name === 'string' && value(session.name).trim() ? value(session.name).trim() : `Untitled · ${localDate(createdAt ?? +session.modified)}`, createdAt, updatedAt: +session.modified });
              if (candidates.length > 100) break;
            }
            limited = candidates.length > 100;
            candidates = candidates.slice(0, 100);
            catalogReady = true;
            if (!current() || signal.aborted) return;
            if (!candidates.length) {
              sections[title] = { data: [], coverage: { candidates: 0, matched: 0, limited: false }, dataAsOf: null, at: now(), stale: false, error: null };
              return;
            }
            request.method = 'POST';
            requestHeaders.set('content-type', 'application/json');
            request.body = JSON.stringify({ threads: candidates.map(candidate => ({ thread_id: candidate.id, created_at: candidate.createdAt == null ? null : new Date(candidate.createdAt).toISOString(), descendant_thread_ids: [] })) });
          }
          if (card) {
            const parameters = { start_date: range.startDate, end_date: range.endDate, group_by: 'day' };
            if (title === 'History') requestHeaders.set('x-openai-codex-usage-categories', '1');
            else parameters.workspace_user = 'true';
            if (title === 'Plugins') parameters.top_plugin_limit = '10';
            if (title === 'Skills') parameters.top_skill_limit = '10';
            url.search = new URLSearchParams(parameters).toString();
          }
          const response = await bounded(fetch(url.href, request), signal);
          if (!response.ok) throw new Error('Unavailable');
          const body = await bounded(response.json(), signal);
          const report = title === 'Top chats' ? topChatsReport(body, candidates, limited) : format(body, range);
          if (current() && !signal.aborted) {
            const section = { ...report, at: now(), stale: false, error: null };
            if (card) card.section = section;
            else sections[title] = section;
          }
        } catch {
          if (current()) {
            if (title === 'Top chats' && !catalogReady) sections[title] = undefined;
            const section = card ? card.section : sections[title];
            if (section) {
              section.stale = true;
              section.error = title === 'History' ? 'Usage history unavailable' : `${title} unavailable`;
            }
          }
        }
    })().finally(() => {
      clearTimeout(timeout);
      if (sourceRequests.get(title) === work) sourceRequests.delete(title);
    });
    return work.promise;
  }

  async function refresh(ctx, options = {}) {
    const selected = {
      History: options.historyRange && validateHistoryRange(options.historyRange),
      Messages: options.messagesRange && validateHistoryRange(options.messagesRange),
      Plugins: options.pluginsRange && validateHistoryRange(options.pluginsRange),
      Skills: options.skillsRange && validateHistoryRange(options.skillsRange),
    };
    for (const [title, range] of Object.entries(selected)) {
      const card = cards[title];
      if (range && (range.startDate !== card.range.startDate || range.endDate !== card.range.endDate)) {
        card.version++;
        sourceRequests.get(title)?.controller.abort();
        sourceRequests.delete(title);
        card.range = range;
        card.section = undefined;
      }
    }
    const versions = Object.fromEntries(Object.entries(cards).map(([title, card]) => [title, card.version]));
    const deadline = Date.now() + timeoutMs;
    const auth = await resolveAuth(ctx);
    const current = () => auth && auth.generation === generation && (!options.details || Object.keys(cards).every(title => options.card && options.card !== title || cards[title].version === versions[title]));
    if (!current()) return false;
    const hydrateDetails = options.details && !detailsInitialized;
    const sources = !options.card || hydrateDetails ? [['usage', 'Limits', limitsReport], ['profiles/me', 'Analytics', analyticsReport]] : [];
    if (options.details) {
      if (!options.card || hydrateDetails || options.card === 'History') sources.push(['usage/daily-token-usage-breakdown', 'History', usageHistoryReport]);
      if (!options.card || hydrateDetails || options.card === 'Messages') sources.push(['analytics/daily-workspace-usage-counts', 'Messages', messagesReport]);
      if (!options.card || hydrateDetails || options.card === 'Plugins') sources.push(['analytics/daily-plugin-usage-metrics', 'Plugins', (body, range) => toolsReport(body, range, 'plugin')]);
      if (!options.card || hydrateDetails || options.card === 'Skills') sources.push(['analytics/daily-skill-usage-metrics', 'Skills', (body, range) => toolsReport(body, range, 'skill')]);
      if (!options.card || hydrateDetails) sources.push(['rate-limit-reset-credits', 'Reset credits', resetCreditsReport], ['rate-limit-reset-credits/history', 'Reset history', resetHistoryReport]);
      if (!options.card || hydrateDetails) sources.push(['usage/thread_usage/query_v2', 'Top chats']);
      detailsInitialized = true;
    }
    await Promise.all(sources.map(([path, title, format]) => readSource(auth, path, title, format, deadline)));
    if (auth.generation === generation) render(ctx);
    return Boolean(current());
  }

  function start(ctx) {
    clearInterval(timer);
    timer = setInterval(() => refresh(ctx), 180000);
    return refresh(ctx);
  }

  pi.registerCommand('codex-usage', {
    description: 'Choose Compact, Detailed or Hide for Codex usage',
    handler: async (args, ctx) => {
      sessionContext = ctx;
      let choice = args.trim().toLowerCase();
      if (!choice) choice = (await ctx.ui.select('Codex Usage', ['Compact', 'Detailed', 'Hide']))?.toLowerCase();
      if (!choice) return;
      if (choice === 'detailed') {
        ctx.ui.notify(registration.available ? 'Open Add tab → Extension views → Codex Usage, or use the command palette: Open Codex Usage.' : 'The Codex Usage details view needs the pi-gui desktop host.', 'info');
        return;
      }
      if (choice !== 'compact' && choice !== 'hide') {
        ctx.ui.notify('Use /codex-usage compact, detailed or hide.', 'info');
        return;
      }
      visible = choice === 'compact';
      pi.appendEntry(visibilityType, { visible });
      if (visible) await start(ctx);
      else clear(ctx);
    },
  });

  async function restore(_event, ctx) {
    sessionContext = ctx;
    clear(ctx);
    if (_event.type !== 'session_tree') {
      identity = undefined;
      sections = {};
      detailsInitialized = false;
      for (const card of Object.values(cards)) {
        card.range = latestHistoryRange(now(), card.defaultDays);
        card.section = undefined;
        card.version++;
      }
    }
    visible = ctx.sessionManager.getBranch().filter(entry => entry.type === 'custom' && entry.customType === visibilityType).at(-1)?.data?.visible === true;
    render(ctx);
    if (visible) await start(ctx);
  }
  pi.on('session_start', restore);
  pi.on('session_tree', restore);
  pi.on('session_shutdown', (_event, ctx) => { visible = false; sessionContext = undefined; clear(ctx); });
}
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { SessionManager, parseSessionEntries } from '@earendil-works/pi-coding-agent';

import { registerDesktopView } from './vendor/register-desktop-view.js';
import { BACKGROUND_CONTEXT } from './dist/chord-context.js';
import { CodexUsageDetails } from './dist/contract.js';

