import { BACKGROUND_CONTEXT, withAbortSignal } from './chord-context.js';
import { CodexUsageDetails } from './contract.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const amount = number => number == null ? 'unavailable' : number.toLocaleString();
const localDate = milliseconds => milliseconds == null ? 'unavailable' : new Date(milliseconds).toLocaleString();

function freshness(section) {
  const note = element('p', `${section.stale ? 'Stale · last successful update' : 'Updated'}: ${localDate(section.updatedAt)}`, 'freshness');
  if (section.stale) note.classList.add('stale');
  return note;
}

function metricList(lines) {
  const list = element('dl', null, 'metrics');
  for (const line of lines) {
    const separator = line.indexOf(':');
    const name = separator < 0 ? line : line.slice(0, separator);
    const description = separator < 0 ? '' : line.slice(separator + 1).trim();
    const item = element('div', null, 'metric');
    item.append(element('dt', name.charAt(0).toUpperCase() + name.slice(1)), element('dd', description));
    list.append(item);
  }
  return list;
}

function quota(window) {
  const card = element('section', null, 'quota');
  card.append(element('h3', window.label));
  const used = window.usedPercent;
  card.append(element('p', `Used ${used == null ? 'unavailable' : `${used}%`} · Left ${window.leftPercent == null ? 'unavailable' : `${window.leftPercent}%`}`, 'quota-value'));
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
  card.append(element('p', `Reset: ${localDate(window.resetAt == null ? null : window.resetAt * 1000)}`, 'reset'));
  return card;
}

function history(title, series) {
  const section = element('section', null, 'history');
  section.append(element('h3', title));
  if (!series.length) {
    section.append(element('p', 'History unavailable', 'freshness'));
    return section;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 360 190');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title} token history; exact dated values in the table below`);
  const shape = (tag, attributes, text) => {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text != null) node.textContent = text;
    svg.append(node);
    return node;
  };
  const max = Math.max(1, ...series.map(bucket => bucket.tokens ?? 0));
  for (const fraction of [0, .5, 1]) {
    const y = 150 - fraction * 130;
    shape('line', { x1: 46, x2: 348, y1: y, y2: y, class: 'grid-line' });
    shape('text', { x: 40, y: y + 4, 'text-anchor': 'end' }, Intl.NumberFormat(undefined, { notation: 'compact' }).format(max * fraction));
  }
  let path = '';
  let connected = false;
  series.forEach((bucket, index) => {
    if (bucket.tokens == null) { connected = false; return; }
    const x = 46 + (series.length === 1 ? 151 : index / (series.length - 1) * 302);
    const y = 150 - bucket.tokens / max * 130;
    path += `${connected ? 'L' : 'M'}${x},${y} `;
    connected = true;
    shape('circle', { cx: x, cy: y, r: series.length > 40 ? 1.5 : 3, class: 'data-point' });
  });
  shape('path', { d: path, class: 'data-line' });
  shape('text', { x: 46, y: 176 }, series[0].date);
  shape('text', { x: 348, y: 176, 'text-anchor': 'end' }, series.at(-1).date);
  const table = element('table');
  table.append(element('caption', `${title} tokens`));
  const head = element('thead');
  const heading = element('tr');
  for (const name of ['Date', 'Tokens']) {
    const cell = element('th', name);
    cell.scope = 'col';
    heading.append(cell);
  }
  head.append(heading);
  const rows = element('tbody');
  for (const bucket of series) {
    const row = element('tr');
    row.append(element('td', bucket.date), element('td', amount(bucket.tokens)));
    rows.append(row);
  }
  table.append(head, rows);
  section.append(svg, table);
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
  let snapshot;
  let verified = false;
  let disposed = false;
  let timer;
  let unsubscribe;
  let refreshing = false;

  function render() {
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
      panel.append(element('h2', 'Subscription limits'));
      const quotas = element('div', null, 'quotas');
      for (const window of section.windows) quotas.append(quota(window));
      panel.append(quotas, element('h2', 'Account and quota details'), metricList(section.lines));
    } else {
      panel.append(element('h2', 'Usage analytics'));
      panel.append(metricList(section.lines));
      panel.append(history('Daily', section.daily), history('Cumulative', section.cumulative), history('Weekly', section.weekly));
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
