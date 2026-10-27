import { BACKGROUND_CONTEXT, withAbortSignal } from './chord-context.js';
import { CodexUsageDetails } from './contract.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const amount = number => number.toLocaleString();
function localDate(milliseconds) {
  const time = new Date(milliseconds);
  const pad = number => String(number).padStart(2, '0');
  return `${time.getFullYear()}.${pad(time.getMonth() + 1)}.${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}
const calendarDate = date => date.replaceAll('-', '.');
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function periodBounds(period) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - period + 1);
  return { start: dayKey(start), end: dayKey(today) };
}

function freshness(section) {
  if (section.updatedAt == null && !section.stale) return element('span');
  const text = section.updatedAt == null ? 'Stale' : `${section.stale ? 'Stale · last successful update' : 'Updated'}: ${localDate(section.updatedAt)}`;
  const note = element('p', text, 'freshness');
  if (section.stale) note.classList.add('stale');
  return note;
}

function metricList(metrics) {
  const list = element('dl', null, 'metrics');
  for (const metric of metrics) {
    const item = element('div', null, 'metric');
    const description = element('dd');
    if (typeof metric.value === 'boolean') {
      const icon = element('span', metric.value ? '✓' : '✕', metric.value ? 'boolean-true' : 'boolean-false');
      icon.setAttribute('aria-label', metric.value ? 'True' : 'False');
      icon.setAttribute('role', 'img');
      description.append(icon);
    } else description.textContent = metric.format === 'datetime' ? localDate(metric.value) : amount(metric.value);
    item.append(element('dt', metric.label.charAt(0).toUpperCase() + metric.label.slice(1)), description);
    list.append(item);
  }
  return list;
}

function quota(window) {
  const card = element('section', null, 'quota');
  card.append(element('h3', window.label));
  const used = window.usedPercent;
  const percentages = [];
  if (used != null) percentages.push(`Used ${used}%`);
  if (window.leftPercent != null) percentages.push(`Left ${window.leftPercent}%`);
  if (percentages.length) card.append(element('p', percentages.join(' · '), 'quota-value'));
  if (used != null) {
    const track = element('div', null, 'track');
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-label', `${window.label} used`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(used));
    track.setAttribute('aria-valuetext', `${used}% used`);
    const fill = element('div', null, 'fill');
    fill.style.width = `${used}%`;
    track.append(fill);
    card.append(track);
  }
  if (window.resetAt != null) card.append(element('p', `Reset: ${localDate(window.resetAt * 1000)}`, 'reset'));
  return card;
}

function history(title, fullSeries, period) {
  const bounds = period === 'all' ? null : periodBounds(period);
  const series = bounds ? fullSeries.filter(bucket => bucket.date >= bounds.start && bucket.date <= bounds.end) : fullSeries;
  const section = element('section', null, 'history');
  section.append(element('h3', title));
  if (!series.length) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 360 140');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title} token history; exact dated values in the heatmap below`);
  const shape = (tag, attributes, text) => {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text != null) node.textContent = text;
    svg.append(node);
    return node;
  };
  const max = Math.max(1, ...series.map(bucket => bucket.tokens ?? 0));
  for (const fraction of [0, .5, 1]) {
    const y = 108 - fraction * 92;
    shape('line', { x1: 46, x2: 348, y1: y, y2: y, class: 'grid-line' });
    shape('text', { x: 40, y: y + 4, 'text-anchor': 'end' }, Intl.NumberFormat(undefined, { notation: 'compact' }).format(max * fraction));
  }
  let path = '';
  let connected = false;
  series.forEach((bucket, index) => {
    if (bucket.tokens == null) { connected = false; return; }
    const x = 46 + (series.length === 1 ? 151 : index / (series.length - 1) * 302);
    const y = 108 - bucket.tokens / max * 92;
    path += `${connected ? 'L' : 'M'}${x},${y} `;
    connected = true;
    shape('circle', { cx: x, cy: y, r: series.length > 40 ? 1.5 : 3, class: 'data-point' });
  });
  shape('path', { d: path, class: 'data-line' });
  for (const index of new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])) {
    const x = series.length === 1 ? 197 : 46 + index / (series.length - 1) * 302;
    shape('text', { x, y: 132, 'text-anchor': index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle' }, calendarDate(series[index].date).slice(5));
  }
  const heatmap = element('div', null, 'heatmap');
  const tooltip = element('div', '', 'heatmap-tooltip');
  tooltip.id = `usage-${title.toLowerCase()}-tooltip`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const scroll = element('div', null, 'heatmap-scroll');
  const grid = element('div', null, 'heatmap-grid');
  grid.setAttribute('aria-label', `${title} supplied ${title === 'Weekly' ? 'week starts' : 'days'}`);
  const buckets = new Map(series.map(bucket => [bucket.date, bucket]));
  const maximum = Math.max(1, ...fullSeries.map(bucket => bucket.tokens ?? 0));
  const start = new Date(`${bounds?.start ?? series[0].date}T00:00:00Z`);
  const end = new Date(`${bounds?.end ?? series.at(-1).date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  end.setUTCDate(end.getUTCDate() + 6 - end.getUTCDay());
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket?.tokens == null) {
      const gap = element('span', '', 'heatmap-gap');
      if (bucket) gap.setAttribute('aria-label', `${calendarDate(key)} no value supplied`);
      grid.append(gap);
      continue;
    }
    const level = bucket.tokens === 0 ? 0 : Math.max(1, Math.ceil(bucket.tokens / maximum * 4));
    const cell = element('button', '', 'heatmap-cell');
    cell.type = 'button';
    cell.style.setProperty('--heat-color', `var(--heat-${level})`);
    const text = `${calendarDate(key)} · ${amount(bucket.tokens)} tokens`;
    cell.setAttribute('aria-label', text);
    cell.setAttribute('aria-describedby', tooltip.id);
    const show = () => { tooltip.textContent = text; tooltip.hidden = false; };
    const hide = () => { tooltip.hidden = true; };
    cell.onpointerenter = show;
    cell.onpointerleave = hide;
    cell.ontouchend = show;
    cell.onfocus = show;
    cell.onblur = hide;
    grid.append(cell);
  }
  scroll.append(grid);
  const legend = element('div', null, 'heatmap-legend');
  legend.append(element('span', 'Less'));
  for (let level = 0; level <= 4; level++) {
    const swatch = element('span', '', 'heatmap-swatch');
    swatch.style.backgroundColor = `var(--heat-${level})`;
    legend.append(swatch);
  }
  legend.append(element('span', 'More'));
  heatmap.append(tooltip, scroll, legend);
  section.append(svg, heatmap);
  return section;
}

export async function mount(root, host) {
  host.signal.throwIfAborted();
  const stylesheet = element('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./desktop.css', import.meta.url).href;
  const main = element('article', null, 'codex-usage');
  main.append(element('h1', 'Codex Usage'));
  const nav = element('nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Usage report');
  const tabs = ['Overview', 'Analytics'].map(name => {
    const button = element('button', name);
    button.type = 'button';
    button.id = `usage-${name.toLowerCase()}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'usage-panel');
    nav.append(button);
    return button;
  });
  const panel = element('section');
  panel.id = 'usage-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.tabIndex = 0;
  const connection = element('p', '', 'connection');
  connection.setAttribute('role', 'status');
  main.append(nav, connection, panel);
  root.replaceChildren(stylesheet, main);
  let selected = 0;
  let period = 30;
  let snapshot;
  let verified = false;
  let disposed = false;
  let timer;
  let unsubscribe;
  let refreshing = false;

  function render() {
    const focusedPeriod = panel.querySelector('.periods button:focus')?.textContent;
    tabs.forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(selected === index));
      tab.tabIndex = selected === index ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tabs[selected].id);
    if (!verified || !snapshot) {
      panel.replaceChildren(element('p', connection.textContent ? 'Report unavailable' : 'Loading report…'));
      return;
    }
    const section = selected === 0 ? snapshot.overview : snapshot.analytics;
    panel.replaceChildren(freshness(section));
    if (section.error) panel.append(element('p', section.error, 'error'));
    if (selected === 0) {
      if (section.windows.length) {
        panel.append(element('h2', 'Subscription limits'));
        const quotas = element('div', null, 'quotas');
        for (const window of section.windows) quotas.append(quota(window));
        panel.append(quotas);
      }
      if (section.metrics.length) panel.append(element('h2', 'Account and quota details'), metricList(section.metrics));
    } else {
      if (section.metrics.length) panel.append(element('h2', 'All-time statistics'), metricList(section.metrics));
      if (section.invocations.length) {
        const group = element('section', null, 'invocations');
        group.append(element('h3', 'Top invocations · All time'));
        const list = element('ul');
        for (const invocation of section.invocations) {
          list.append(element('li', [invocation.type, invocation.pluginName, invocation.skillName, invocation.usageCount].filter(item => item != null && item !== '').map(amount).join(' · ')));
        }
        group.append(list);
        panel.append(group);
      }
      if (section.daily.length || section.cumulative.length || section.weekly.length) {
        const controls = element('div', null, 'periods');
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', 'History period');
        for (const [name, days] of [['7 days', 7], ['30 days', 30], ['All', 'all']]) {
          const button = element('button', name);
          button.type = 'button';
          button.setAttribute('aria-pressed', String(period === days));
          button.onclick = () => { period = days; render(); };
          controls.append(button);
        }
        panel.append(controls);
        for (const [title, series] of [['Daily', section.daily], ['Cumulative', section.cumulative], ['Weekly', section.weekly]]) {
          const chart = history(title, series, period);
          if (chart) panel.append(chart);
        }
        if (focusedPeriod) {
          [...controls.querySelectorAll('button')].find(button => button.textContent === focusedPeriod)?.focus({ preventScroll: true });
        }
      }
    }
  }

  tabs.forEach((tab, index) => {
    tab.onclick = () => { selected = index; render(); };
    tab.onkeydown = event => {
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - selected : undefined;
      if (target == null) return;
      event.preventDefault();
      selected = target;
      render();
      tabs[target].focus();
    };
  });
  render();
  const context = withAbortSignal(host.signal, BACKGROUND_CONTEXT);
  const binding = host.services.open({
    services: [CodexUsageDetails],
    assertAccess: () => host.signal.throwIfAborted(),
    onError: () => { if (!disposed) connection.textContent = 'Usage service unavailable'; },
  });
  const service = binding.use(CodexUsageDetails);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    unsubscribe?.();
    host.signal.removeEventListener('abort', dispose);
    for (const tab of tabs) { tab.onclick = null; tab.onkeydown = null; }
    void binding.dispose(BACKGROUND_CONTEXT).catch(() => {});
    root.replaceChildren();
  };
  host.signal.addEventListener('abort', dispose, { once: true });
  async function refresh() {
    if (disposed || refreshing) return;
    refreshing = true;
    try {
      const result = await service.refresh({}, context);
      if (!disposed) {
        verified = result?.verified === true;
        snapshot = verified ? service.state.value : undefined;
        connection.textContent = verified ? '' : 'Account verification unavailable';
        render();
      }
    } catch {
      if (!disposed) {
        verified = false;
        snapshot = undefined;
        connection.textContent = 'Refresh unavailable';
        render();
      }
    } finally { refreshing = false; }
  }
  try {
    await binding.ready(context);
    if (disposed) return dispose;
    unsubscribe = service.state.subscribe(next => { if (!disposed && verified) { snapshot = next; render(); } });
    await refresh();
    if (!disposed) timer = setInterval(refresh, 180000);
  } catch {
    dispose();
    if (!host.signal.aborted) root.append(element('p', 'Codex Usage service unavailable'));
  }
  return dispose;
}
