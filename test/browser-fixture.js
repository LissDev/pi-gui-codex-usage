const config = window.fixtureConfig;
const probe = window.probe = { calls: 0, historyCalls: [], timers: new Map(), disposed: 0, unsubscribed: 0, error: null };
const theme = { mode: 'dark', background: '#1d1d1c', foreground: '#d3d3cf', accent: '#7aa2f7' };
probe.changeTheme = next => {
  Object.assign(theme, next);
  document.documentElement.style.colorScheme = theme.mode;
  for (const name of ['background', 'foreground', 'accent']) document.documentElement.style.setProperty(`--${name}`, theme[name]);
};
probe.changeTheme(theme);
let nextTimer = 0;
window.setInterval = callback => { probe.timers.set(++nextTimer, callback); return nextTimer; };
window.clearInterval = id => probe.timers.delete(id);
const listeners = new Set();
const state = {
  value: config.snapshot,
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); probe.unsubscribed++; }; },
};
const service = { state, async refreshHistory(range) {
  probe.historyCalls.push(range);
  if (config.deferredHistory) {
    config.deferredHistory = false;
    return new Promise(resolve => { probe.resolveHistory = resolve; });
  }
  probe.publish({ ...state.value, history: { ...state.value.history, ...range } });
  return { verified: true };
}, async refresh() {
  probe.calls++;
  if (!config.deferredRefresh) return { verified: true };
  return new Promise((resolve, reject) => {
    probe.completeRefresh = next => { probe.publish(next); resolve({ verified: true }); };
    probe.resolveRefresh = result => resolve(result);
    probe.failRefresh = () => reject(new Error('Synthetic authentication unavailable'));
  });
} };
let controller;
let dispose;
probe.publish = snapshot => { state.value = snapshot; for (const listener of listeners) listener(snapshot); };
probe.tick = async () => { await Promise.all([...probe.timers.values()].map(callback => callback())); };
probe.close = () => dispose?.();
probe.abort = () => controller?.abort();
probe.deferNextRefresh = () => { config.deferredRefresh = true; };
probe.deferNextHistory = () => { config.deferredHistory = true; };
probe.mount = async () => {
  if (!config.frontend) return;
  controller = new AbortController();
  const module = await import(config.frontend);
  const host = {
    signal: controller.signal,
    theme,
    actions: {},
    services: {
      open() {
        return {
          use(token) {
            if (token.id !== 'pi-gui-codex-usage.details') throw new Error('Unexpected service token');
            return service;
          },
          async ready() {},
          async dispose() { probe.disposed++; },
        };
      },
    },
  };
  dispose = await module.mount(document.querySelector('#root'), host);
};
try { await probe.mount(); }
catch (error) { probe.error = error.message; }
probe.ready = true;
