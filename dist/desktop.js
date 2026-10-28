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

const usageFeatures = { user: 'Chats', subagent: 'Subagents', thread_title: 'Chat titles', thread_title_reconsideration: 'Chat title updates', aeon_child: 'agent_created_thread' };
const usageTriggers = { user: 'User messages', composer: 'User messages', composer_queue: 'Queued messages', automation_cron_scheduled: 'Scheduled automations', automation_heartbeat_scheduled: 'Scheduled follow-ups' };
const usageAmount = (value, units) => `${value}${units === 'percent' ? '%' : ' credits'}`;

function chartControls(prefix, view, groupOptions, changeRange, changeGrouping, changeDay) {
  const { range: selection, days, grouping } = view;
  const controls = element('div', null, 'usage-controls');
  for (const duration of [7, 30]) {
    const button = element('button', `${duration} days`);
    button.type = 'button';
    button.dataset.control = `${prefix}-${duration}`;
    button.setAttribute('aria-pressed', String(days === duration));
    button.onclick = () => {
      const range = periodBounds(duration);
      void changeRange({ startDate: range.start, endDate: range.end }, duration);
    };
    controls.append(button);
  }
  for (const [name, direction] of [['Previous', -1], ['Next', 1]]) {
    const button = element('button', name);
    button.type = 'button';
    button.dataset.control = `${prefix}-${name}`;
    button.disabled = direction === 1 && selection.endDate >= dayKey(new Date());
    button.onclick = () => {
      const shift = key => {
        const date = new Date(`${key}T12:00:00`);
        date.setDate(date.getDate() + days * direction);
        return dayKey(date);
      };
      const endDate = shift(selection.endDate);
      if (endDate <= dayKey(new Date())) void changeRange({ startDate: shift(selection.startDate), endDate }, days);
    };
    controls.append(button);
  }
  if (groupOptions.length) {
    const label = element('label', 'Group by');
    const select = element('select');
    select.dataset.control = `${prefix}-group`;
    for (const [name, field] of groupOptions) {
      const option = element('option', name);
      option.value = field;
      option.selected = grouping === field;
      select.append(option);
    }
    select.onchange = () => changeGrouping(select.value);
    label.append(select);
    controls.append(label);
  }
  const dayLabel = element('label', 'Day details');
  const daySelect = element('select');
  daySelect.dataset.control = `${prefix}-day`;
  daySelect.disabled = true;
  const placeholder = element('option', 'Select a day');
  placeholder.value = '';
  daySelect.append(placeholder);
  daySelect.onchange = () => changeDay(daySelect.value);
  dayLabel.append(daySelect);
  controls.append(dayLabel);
  return { controls, daySelect };
}

function appendDayDetails(region, daySelect, data, selectedDay, describe) {
  daySelect.disabled = !data.length;
  for (const day of data) {
    const option = element('option', calendarDate(day.date));
    option.value = day.date;
    option.selected = selectedDay === day.date;
    daySelect.append(option);
  }
  const chosen = data.find(day => day.date === selectedDay);
  if (chosen) {
    const detail = element('section', describe(chosen), 'usage-day-details');
    detail.setAttribute('role', 'region');
    detail.setAttribute('aria-label', 'Day details');
    detail.setAttribute('aria-live', 'polite');
    region.append(detail);
  }
}

function svgShape(parent, tag, attributes, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text != null) node.textContent = text;
  parent.append(node);
  return node;
}

function usageHistory(report, view, changeRange, changeGrouping, changeDay) {
  const { range: selection, grouping, days, loading, day: selectedDay } = view;
  const region = element('section', null, 'usage-history');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Usage history');
  region.append(element('h2', 'Usage history'));
  const { controls, daySelect } = chartControls('usage', view, [['By feature', 'thread_source'], ['By model', 'model'], ['By surface', 'surface'], ['By turn start', 'turn_trigger']], changeRange, changeGrouping, changeDay);
  region.append(controls, element('p', `${calendarDate(selection.startDate)} – ${calendarDate(selection.endDate)}`, 'history-range'));
  const matching = report.startDate === selection.startDate && report.endDate === selection.endDate;
  if (loading || !matching) {
    region.append(element('p', 'Loading usage history…', 'freshness'));
    return region;
  }
  region.append(freshness(report), element('p', `Data as of: ${report.dataAsOf == null ? 'unknown' : localDate(report.dataAsOf)}`, 'freshness'));
  if (report.error) region.append(element('p', report.error, 'error'));
  if (!report.data.length || !['percent', 'credits'].includes(report.units)) {
    if (!report.error) region.append(element('p', 'No usage data in this range'));
    return region;
  }
  const names = key => (grouping === 'thread_source' ? usageFeatures[key] : grouping === 'turn_trigger' ? usageTriggers[key] : undefined) ?? (key === 'unknown' ? 'Unknown' : key);
  const totals = new Map();
  const data = report.data.filter(day => day.date >= selection.startDate && day.date <= selection.endDate).map(day => {
    const groups = new Map();
    for (const row of day.attribution) {
      if (row.value == null) continue;
      const key = row[grouping] ?? 'unknown';
      const group = grouping === 'turn_trigger' ? usageTriggers[key] ?? key : key;
      groups.set(group, (groups.get(group) ?? 0) + row.value);
      totals.set(group, (totals.get(group) ?? 0) + row.value);
    }
    return { date: day.date, groups, incomplete: day.attribution.some(row => row.value == null), total: [...groups.values()].reduce((sum, value) => sum + value, 0) };
  }).filter(day => day.groups.size);
  if (!data.length) {
    if (!report.error) region.append(element('p', 'No supplied usage values in this range'));
    return region;
  }
  const dayDetails = day => `${calendarDate(day.date)} · ${day.incomplete ? 'Known subtotal ' : ''}${usageAmount(day.total, report.units)}${day.incomplete ? '\nSome attribution is missing' : ''}\n${[...day.groups].map(([key, value]) => `${names(key)}: ${usageAmount(value, report.units)}`).join('\n')}`;
  appendDayDetails(region, daySelect, data, selectedDay, dayDetails);
  const keys = [...totals.keys()];
  const color = key => `var(--usage-series-${keys.indexOf(key) % 8})`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('usage-chart');
  svg.setAttribute('viewBox', '0 0 360 220');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Selected usage in ${report.units}`);
  const tooltip = element('div', '', 'usage-tooltip');
  tooltip.id = 'usage-history-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const maximum = Math.max(...data.map(day => day.total), 1);
  for (const fraction of [0, .5, 1]) {
    const y = 175 - fraction * 145;
    svgShape(svg, 'line', { x1: 36, x2: 348, y1: y, y2: y, class: 'grid-line' });
    svgShape(svg, 'text', { x: 30, y: y + 4, 'text-anchor': 'end' }, `${maximum * fraction}${report.units === 'percent' ? '%' : ''}`);
  }
  const bin = 312 / days;
  const firstDate = Date.parse(`${selection.startDate}T00:00:00Z`);
  for (const day of data) {
    const index = (Date.parse(`${day.date}T00:00:00Z`) - firstDate) / 86400000;
    const x = 36 + index * bin + bin * .15;
    const totalLabel = `${day.incomplete ? 'Known subtotal ' : ''}${usageAmount(day.total, report.units)}`;
    const bar = svgShape(svg, 'g', { role: 'button', tabindex: 0, 'aria-label': `${calendarDate(day.date)} · ${totalLabel}`, 'aria-describedby': tooltip.id });
    svgShape(bar, 'rect', { x, y: 25, width: bin * .7, height: 155, fill: 'transparent' });
    let accumulated = 0;
    for (const [key, value] of day.groups) {
      const height = value / maximum * 145;
      svgShape(bar, 'rect', { x, y: 175 - accumulated - height, width: bin * .7, height, fill: color(key) });
      accumulated += height;
    }
    const show = () => {
      tooltip.textContent = dayDetails(day);
      tooltip.hidden = false;
    };
    const hide = () => { tooltip.hidden = true; };
    bar.onpointerenter = show;
    bar.onpointerleave = hide;
    bar.onfocus = show;
    bar.onblur = hide;
    bar.ontouchend = show;
  }
  const ticks = days === 7 ? Array.from({ length: days }, (_, index) => index) : [0, 7, 14, 21, days - 1];
  for (const index of ticks) {
    const date = new Date(firstDate + index * 86400000).toISOString().slice(0, 10);
    svgShape(svg, 'text', { x: 36 + (index + .5) * bin, y: 204, 'text-anchor': 'middle' }, calendarDate(date).slice(5));
  }
  const legend = element('ul', null, 'usage-legend');
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  for (const [key, value] of totals) {
    const share = total > 0 ? value / total * 100 : 0;
    const percentage = share > 0 && share < .1 ? '<0.1%' : `${Math.round(share * 10) / 10}%`;
    const item = element('li');
    const swatch = element('span', '', 'usage-swatch');
    swatch.style.backgroundColor = color(key);
    item.append(swatch, element('span', `${names(key)} · ${percentage}`));
    legend.append(item);
  }
  const incomplete = report.data.some(day => day.date >= selection.startDate && day.date <= selection.endDate && day.attribution.some(row => row.value == null));
  region.append(svg, tooltip, element('p', incomplete ? 'Share of known selected usage' : 'Share of selected usage', 'freshness'), legend);
  return region;
}

const messageClients = { CODEX_DESKTOP_APP: 'Desktop', CODEX_WORK_DESKTOP: 'Desktop', CODEX_CLI: 'CLI', CODEX_IDE_VSCODE: 'VS Code', CODEX_WEB: 'Web', CODEX_WORK_WEB: 'Web (Work)', CODEX_WORK_MOBILE: 'Mobile', CODEX_GITHUB: 'Code review' };

function messageDays(report, view) {
  return report.data.filter(day => day.date >= view.range.startDate && day.date <= view.range.endDate).map(day => {
    const groups = new Map();
    const rows = day[view.grouping];
    for (const row of rows) {
      if (row.turns == null) continue;
      const name = view.grouping === 'models' ? ['other', 'codex-auto-review'].includes(row.model) ? 'Other' : row.model : messageClients[row.client_id] ?? row.client_id;
      groups.set(name || 'Unknown', (groups.get(name || 'Unknown') ?? 0) + row.turns);
    }
    const known = [...groups.values()].reduce((sum, count) => sum + count, 0);
    const reported = day.totals.turns;
    if (reported != null && reported > known) groups.set('Other', (groups.get('Other') ?? 0) + reported - known);
    return {
      date: day.date, groups, total: reported ?? (groups.size ? known : null),
      subtotal: reported == null, incomplete: reported == null || rows.some(row => row.turns == null),
      discrepancy: reported != null && known > reported,
    };
  }).filter(day => day.total != null);
}

function toolDays(report, view, title) {
  const plugin = title === 'Plugins';
  const field = plugin ? 'plugin_usage_overviews' : 'skill_usage_overviews';
  const supplied = report.data.filter(day => day.date >= view.range.startDate && day.date <= view.range.endDate);
  const names = new Map();
  const days = supplied.map(day => {
    const groups = new Map();
    for (const row of day[field]) {
      const sourceName = plugin ? row.plugin_name : row.skill_name;
      const key = plugin ? JSON.stringify([sourceName, row.marketplace ?? '']) : sourceName;
      const displayName = row.display_name || sourceName;
      names.set(key, [displayName, sourceName !== displayName ? sourceName : null, plugin ? row.marketplace : null].filter(Boolean).join(' · '));
      if (row.invocation_counts != null) groups.set(key, (groups.get(key) ?? 0) + row.invocation_counts);
    }
    return {
      date: day.date, groups, total: groups.size ? [...groups.values()].reduce((sum, count) => sum + count, 0) : null,
      incomplete: !day[field].length || day[field].some(row => row.invocation_counts == null),
    };
  });
  return { days: days.filter(day => day.total != null), names, incomplete: new Set(supplied.map(day => day.date)).size < view.days || days.some(day => day.incomplete) };
}

function countChart(title, report, view, changeRange, changeGrouping, changeDay) {
  const tools = title !== 'Messages';
  const region = element('section', null, 'usage-history');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', title);
  region.append(element('h2', title));
  const { controls, daySelect } = chartControls(title.toLowerCase(), view, tools ? [] : [['By model', 'models'], ['By surface', 'clients']], changeRange, changeGrouping, changeDay);
  region.append(controls, element('p', `${calendarDate(view.range.startDate)} – ${calendarDate(view.range.endDate)}`, 'history-range'));
  if (view.loading || report.startDate !== view.range.startDate || report.endDate !== view.range.endDate) {
    region.append(element('p', `Loading ${title.toLowerCase()}…`, 'freshness'));
    return region;
  }
  region.append(freshness(report), element('p', `Data as of: ${report.dataAsOf == null ? 'unknown' : localDate(report.dataAsOf)}`, 'freshness'));
  if (report.error) region.append(element('p', report.error, 'error'));
  const activity = tools ? toolDays(report, view, title) : undefined;
  const data = tools ? activity.days : messageDays(report, view);
  const otherReported = Symbol('Other reported');
  const name = key => key === otherReported ? 'Other reported' : activity?.names.get(key) ?? key;
  if (!data.length) {
    if (!report.error) region.append(element('p', tools ? `No ${title.toLowerCase()} activity data in this range` : report.data.length ? 'No supplied message counts in this range' : 'No messages data in this range'));
    return region;
  }
  const incomplete = tools ? activity.incomplete : report.data.some(day => day.date >= view.range.startDate && day.date <= view.range.endDate && (day.totals.turns == null || day[view.grouping].some(row => row.turns == null)));
  const total = data.reduce((sum, day) => sum + day.total, 0);
  const unit = tools ? 'invocations' : 'messages';
  region.append(element('p', `${tools ? `Reported subtotal${incomplete ? ' (partial)' : ''}` : incomplete ? 'Known subtotal' : 'Reported total'}: ${amount(total)} ${unit}`, 'quota-value'));
  if (tools) region.append(element('p', 'Top 10 per day; supplied rows only', 'freshness'));
  const describe = day => `${calendarDate(day.date)} · ${tools ? 'Reported subtotal' : day.subtotal ? 'Known subtotal' : 'Total'} ${amount(day.total)} ${unit}${day.incomplete ? '\nSome counts are missing' : ''}${day.discrepancy ? '\nGrouped counts exceed the reported total' : ''}\n${[...day.groups].map(([key, count]) => `${name(key)}: ${amount(count)} ${unit}`).join('\n')}`;
  appendDayDetails(region, daySelect, data, view.day, describe);
  let keys = [...new Set(data.flatMap(day => [...day.groups.keys()]))];
  let chartData = data;
  if (tools) {
    const totals = new Map(keys.map(key => [key, data.reduce((sum, day) => sum + (day.groups.get(key) ?? 0), 0)]));
    keys.sort((first, second) => totals.get(second) - totals.get(first) || (first < second ? -1 : first > second ? 1 : 0));
    if (keys.length > 8) {
      const named = new Set(keys.slice(0, 8));
      keys = [...named, otherReported];
      chartData = data.map(day => {
        const groups = new Map();
        let other;
        for (const [key, count] of day.groups) {
          if (named.has(key)) groups.set(key, count);
          else other = (other ?? 0) + count;
        }
        if (other != null) groups.set(otherReported, other);
        return { ...day, groups };
      });
      region.append(element('p', 'Chart: top eight names; Other reported sums returned known counts only.', 'freshness'));
    }
  }
  const color = key => key === null ? 'var(--foreground)' : `var(--usage-series-${keys.indexOf(key) % 8})`;
  const dash = key => key === null ? '4 3' : keys.indexOf(key) < 8 ? 'none' : `${Math.floor(keys.indexOf(key) / 8) * 2 + 4} 3`;
  const pointStyle = key => keys.indexOf(key) < 8 ? { fill: color(key) } : { fill: 'var(--background)', stroke: color(key), 'stroke-width': 1.5 };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('usage-chart');
  svg.setAttribute('viewBox', '0 0 360 220');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title} by day; exact counts in Day details`);
  const maximum = Math.max(1, ...chartData.flatMap(day => [day.total, ...day.groups.values()]));
  for (const count of new Set([0, Math.ceil(maximum / 2), maximum])) {
    const y = 175 - count / maximum * 145;
    svgShape(svg, 'line', { x1: 36, x2: 348, y1: y, y2: y, class: 'grid-line' });
    svgShape(svg, 'text', { x: 30, y: y + 4, 'text-anchor': 'end' }, String(count));
  }
  const firstDate = Date.parse(`${view.range.startDate}T00:00:00Z`);
  const byDate = new Map(chartData.map(day => [day.date, day]));
  for (const key of [null, ...keys]) {
    let path = '';
    let connected = false;
    for (let index = 0; index < view.days; index++) {
      const date = new Date(firstDate + index * 86400000).toISOString().slice(0, 10);
      const day = byDate.get(date);
      const count = key === null ? day?.total : day?.groups.get(key);
      if (count == null) { connected = false; continue; }
      const x = 36 + (index + .5) / view.days * 312;
      const y = 175 - count / maximum * 145;
      path += `${connected ? 'L' : 'M'}${x},${y} `;
      connected = true;
      const point = svgShape(svg, 'circle', { cx: x, cy: y, r: 3, ...pointStyle(key) });
      svgShape(point, 'title', {}, describe(day));
    }
    svgShape(svg, 'path', { d: path, fill: 'none', stroke: color(key), 'stroke-width': key === null ? 1 : 2, 'stroke-dasharray': dash(key) });
  }
  for (const index of view.days === 7 ? [0, 1, 2, 3, 4, 5, 6] : [0, 7, 14, 21, view.days - 1]) {
    const date = new Date(firstDate + index * 86400000).toISOString().slice(0, 10);
    svgShape(svg, 'text', { x: 36 + (index + .5) / view.days * 312, y: 204, 'text-anchor': 'middle' }, calendarDate(date).slice(5));
  }
  const legend = element('ul', null, 'usage-legend');
  for (const key of [null, ...keys]) {
    const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    swatch.setAttribute('class', 'usage-swatch message-swatch');
    swatch.setAttribute('viewBox', '0 0 32 12');
    swatch.setAttribute('aria-hidden', 'true');
    svgShape(swatch, 'line', { x1: 1, x2: 31, y1: 6, y2: 6, stroke: color(key), 'stroke-width': key === null ? 1 : 2, 'stroke-dasharray': dash(key) });
    svgShape(swatch, 'circle', { cx: 16, cy: 6, r: 3, ...pointStyle(key) });
    const item = element('li');
    item.append(swatch, element('span', key === null ? tools ? 'Reported subtotal' : incomplete ? 'Known total / subtotal' : 'Reported total' : name(key)));
    legend.append(item);
  }
  region.append(svg, legend);
  return region;
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

function historyChart(title, series) {
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
  return svg;
}

function history(title, fullSeries, period) {
  if (!fullSeries.length) return null;
  const bounds = period === 'all' ? { start: fullSeries[0].date, end: fullSeries.at(-1).date } : periodBounds(period);
  const series = fullSeries.filter(bucket => bucket.date >= bounds.start && bucket.date <= bounds.end);
  const section = element('section', null, 'history');
  section.append(element('h3', title), element('p', `${calendarDate(bounds.start)} – ${calendarDate(bounds.end)}`, 'history-range'));
  const chart = historyChart(title, series);
  if (chart) section.append(chart);
  const heatmap = element('div', null, 'heatmap');
  const tooltip = element('div', '', 'heatmap-tooltip');
  tooltip.id = `usage-${title.toLowerCase()}-tooltip`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const body = element('div', null, 'heatmap-body');
  const weekly = title === 'Weekly';
  if (!weekly) {
    const weekdays = element('div', null, 'heatmap-weekdays');
    weekdays.append(element('span'));
    for (const day of ['', 'Mon', '', 'Wed', '', 'Fri', '']) weekdays.append(element('span', day));
    body.append(weekdays);
  }
  const scroll = element('div', null, 'heatmap-scroll');
  scroll.dataset.history = title;
  const months = element('div', null, 'heatmap-months');
  const grid = element('div', null, 'heatmap-grid');
  if (weekly) grid.classList.add('heatmap-weekly');
  grid.setAttribute('aria-label', `${title} supplied ${title === 'Weekly' ? 'week starts' : 'days'}`);
  const buckets = new Map(series.map(bucket => [bucket.date, bucket]));
  const maximum = Math.max(1, ...fullSeries.map(bucket => bucket.tokens ?? 0));
  const start = new Date(`${bounds.start}T00:00:00Z`);
  const end = new Date(`${bounds.end}T00:00:00Z`);
  if (weekly) {
    const weekStart = new Date(`${fullSeries[0].date}T00:00:00Z`).getUTCDay();
    start.setUTCDate(start.getUTCDate() + (weekStart - start.getUTCDay() + 7) % 7);
  } else {
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    end.setUTCDate(end.getUTCDate() + 6 - end.getUTCDay());
  }
  const monthColumns = new Map();
  const firstMonth = new Date(`${bounds.start}T00:00:00Z`);
  const monthName = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
  monthColumns.set(0, [monthName.format(firstMonth)]);
  const nextMonth = new Date(firstMonth);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
  while (nextMonth <= end) {
    const column = Math.max(0, Math.floor((nextMonth - start) / 604800000));
    const names = monthColumns.get(column) ?? [];
    names.push(monthName.format(nextMonth));
    monthColumns.set(column, names);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  }
  const columns = Math.max(1, Math.floor((end - start) / 604800000) + 1);
  heatmap.style.setProperty('--month-axis-height', [...monthColumns.values()].some(names => names.length > 1) ? '40px' : '20px');
  months.style.gridTemplateColumns = `repeat(${columns}, 24px)`;
  for (const [column, names] of monthColumns) {
    const month = element('div');
    for (const name of names) month.append(element('span', name));
    month.style.gridColumn = String(column + 1);
    months.append(month);
  }
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + (weekly ? 7 : 1))) {
    const key = cursor.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket?.tokens == null) {
      const gap = element('span', '', 'heatmap-gap');
      if (key >= bounds.start && key <= bounds.end) gap.setAttribute('aria-label', `${calendarDate(key)} no value supplied`);
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
  scroll.append(months, grid);
  body.append(scroll);
  const legend = element('div', null, 'heatmap-legend');
  legend.append(element('span', 'Less'));
  for (let level = 0; level <= 4; level++) {
    const swatch = element('span', '', 'heatmap-swatch');
    swatch.style.backgroundColor = `var(--heat-${level})`;
    legend.append(swatch);
  }
  legend.append(element('span', 'More'));
  heatmap.append(tooltip, body, legend);
  section.append(heatmap);
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
  let period = 365;
  const scrollPositions = new Map();
  let snapshot;
  let verified = false;
  let disposed = false;
  let timer;
  let unsubscribe;
  let refreshing = false;
  let requestEpoch = 0;
  let verificationEpoch = 0;
  const latestUsage = periodBounds(7);
  const historyView = { days: 7, range: { startDate: latestUsage.start, endDate: latestUsage.end }, grouping: 'thread_source', day: undefined, loading: false, epoch: 0 };
  const messagesView = { days: 7, range: { startDate: latestUsage.start, endDate: latestUsage.end }, grouping: 'models', day: undefined, loading: false, epoch: 0 };
  const latestTools = periodBounds(30);
  const pluginsView = { days: 30, range: { startDate: latestTools.start, endDate: latestTools.end }, day: undefined, loading: false, epoch: 0 };
  const skillsView = { days: 30, range: { startDate: latestTools.start, endDate: latestTools.end }, day: undefined, loading: false, epoch: 0 };
  const cardViews = [historyView, messagesView, pluginsView, skillsView];

  function render(resetScroll = false) {
    const focusedUsage = panel.querySelector('.usage-controls :focus')?.dataset.control;
    if (resetScroll) scrollPositions.clear();
    else {
      for (const scroll of panel.querySelectorAll('.heatmap-scroll')) scrollPositions.set(scroll.dataset.history, scroll.scrollLeft);
    }
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
      if (snapshot.history) {
        if (!historyView.loading && snapshot.history.startDate === historyView.range.startDate && snapshot.history.endDate === historyView.range.endDate && !snapshot.history.data.some(day => day.date === historyView.day && day.attribution.some(row => row.value != null))) historyView.day = undefined;
        panel.append(usageHistory(snapshot.history, historyView, (range, days) => changeCardRange(historyView, range, days, 'refreshHistory'), field => { historyView.grouping = field; render(); }, day => { historyView.day = day; render(); }));
      }
      if (snapshot.messages) {
        if (!messagesView.loading && snapshot.messages.startDate === messagesView.range.startDate && snapshot.messages.endDate === messagesView.range.endDate && !messageDays(snapshot.messages, messagesView).some(day => day.date === messagesView.day)) messagesView.day = undefined;
        panel.append(countChart('Messages', snapshot.messages, messagesView, (range, days) => changeCardRange(messagesView, range, days, 'refreshMessages'), field => { messagesView.grouping = field; render(); }, day => { messagesView.day = day; render(); }));
      }
      for (const [title, report, view, method] of [['Plugins', snapshot.plugins, pluginsView, 'refreshPlugins'], ['Skills', snapshot.skills, skillsView, 'refreshSkills']]) {
        if (!report) continue;
        if (!view.loading && report.startDate === view.range.startDate && report.endDate === view.range.endDate && !toolDays(report, view, title).days.some(day => day.date === view.day)) view.day = undefined;
        panel.append(countChart(title, report, view, (range, days) => changeCardRange(view, range, days, method), undefined, day => { view.day = day; render(); }));
      }
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
        for (const [name, days] of [['7 days', 7], ['30 days', 30], ['90 days', 90], ['Year', 365], ['All', 'all']]) {
          const button = element('button', name);
          button.type = 'button';
          button.setAttribute('aria-pressed', String(period === days));
          button.onclick = () => { const changed = period !== days; period = days; render(changed); };
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
        for (const scroll of panel.querySelectorAll('.heatmap-scroll')) {
          scroll.scrollLeft = scrollPositions.get(scroll.dataset.history) ?? scroll.scrollWidth;
        }
      }
      if (focusedUsage) panel.querySelector(`[data-control="${focusedUsage}"]`)?.focus({ preventScroll: true });
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
  function acceptVerification(result, epoch, failed = false) {
    if (epoch < verificationEpoch || (epoch < requestEpoch && result?.verified !== true)) return;
    verificationEpoch = epoch;
    verified = result?.verified === true;
    snapshot = verified ? service.state.value : undefined;
    connection.textContent = verified ? '' : failed ? 'Refresh unavailable' : 'Account verification unavailable';
  }

  async function changeCardRange(view, range, days, method) {
    const epoch = ++requestEpoch;
    view.epoch = epoch;
    view.range = range;
    if (view.day < range.startDate || view.day > range.endDate) view.day = undefined;
    view.days = days;
    view.loading = true;
    render();
    try {
      const result = await service[method](range, context);
      if (!disposed && epoch === view.epoch) {
        view.loading = false;
        acceptVerification(result, epoch);
      }
    } catch {
      if (!disposed && epoch === view.epoch) acceptVerification(undefined, epoch, true);
    } finally {
      if (!disposed && epoch === view.epoch) { view.loading = false; render(); }
    }
  }
  async function refresh() {
    if (disposed || refreshing) return;
    refreshing = true;
    const epoch = ++requestEpoch;
    for (const view of cardViews) view.epoch = epoch;
    try {
      const result = await service.refresh({ historyRange: historyView.range, messagesRange: messagesView.range, pluginsRange: pluginsView.range, skillsRange: skillsView.range }, context);
      if (!disposed) {
        for (const view of cardViews) if (view.epoch === epoch) view.loading = false;
        acceptVerification(result, epoch);
        render();
      }
    } catch {
      if (!disposed) {
        for (const view of cardViews) if (view.epoch === epoch) view.loading = false;
        acceptVerification(undefined, epoch, true);
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
