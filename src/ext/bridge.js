// ---------------------------------------------------------------------------
// Мост расширения. Работает в изолированном мире: хранит настройки и передаёт
// их ядру, которое живёт в контексте страницы. Общение — через те же события,
// что и в юзерскрипте: skq:settings-save, skq:settings-load, skq:open-settings.
// ---------------------------------------------------------------------------
(function bridge() {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.storage) return;

  // Сборка подставляет true там, где ядро не объявлено в манифесте (MV2)
  const INJECT_CORE = {{INJECT_CORE}};
  // Там же лежит исходник ядра: его вставляют строкой, чтобы успеть подменить
  // fetch до первых запросов сайта. Файлом это было бы асинхронно.
  const CORE_SRC = {{CORE_SRC}};
  const KEY = 'settings';
  const PROBE_MS = 200;

  let coreReady = false;
  let cached;

  // Firefox отдаёт промисы, Chrome — колбэки
  const promiseApi = typeof globalThis.browser !== 'undefined' && !!globalThis.browser.storage;

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        if (promiseApi) api.storage.local.get(key).then((d) => resolve(d ? d[key] : null), () => resolve(null));
        else api.storage.local.get(key, (d) => resolve(d ? d[key] : null));
      } catch { resolve(null); }
    });
  }

  function storageSet(key, value) {
    try {
      const res = api.storage.local.set({ [key]: value });
      if (res && typeof res.catch === 'function') res.catch(() => {});
    } catch { /* ignore */ }
  }

  // в Firefox объект из изолированного мира нужно отдавать странице через cloneInto
  const share = (value) => (typeof cloneInto === 'function' ? cloneInto(value, window) : value);

  function send(name, detail) {
    const init = detail === undefined ? undefined : { detail: share(detail) };
    document.dispatchEvent(new CustomEvent(name, init));
  }

  async function pushSettings() {
    if (cached === undefined) cached = await storageGet(KEY);
    if (cached) send('skq:settings-load', JSON.stringify(cached));
  }

  // строкой — выполняется сразу же, но страница с жёстким CSP может это запретить
  function injectInline() {
    if (typeof CORE_SRC !== 'string' || !CORE_SRC) return false;
    try {
      const script = document.createElement('script');
      script.textContent = CORE_SRC;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch { /* ниже попробуем файлом */ }
    return coreReady; // ядро отвечает событием прямо во время вставки
  }

  function injectCore() {
    if (injectInline()) return;
    const script = document.createElement('script');
    script.src = api.runtime.getURL('core-main.js');
    script.async = false;
    script.addEventListener('load', () => script.remove());
    (document.head || document.documentElement).appendChild(script);
  }

  document.addEventListener('skq:ready', () => {
    coreReady = true;
    pushSettings();
  });
  document.addEventListener('skq:settings-request', pushSettings);

  document.addEventListener('skq:settings-save', (e) => {
    try {
      const next = JSON.parse(e.detail);
      if (next && typeof next === 'object') {
        cached = next;
        storageSet(KEY, next);
      }
    } catch { /* ignore */ }
  });

  // кнопка расширения на панели браузера открывает те же настройки
  api.runtime.onMessage.addListener((msg) => {
    if (msg && msg.skq === 'open-settings') send('skq:open-settings');
  });

  if (INJECT_CORE) {
    injectCore();
  } else {
    // ядро объявлено в манифесте; если браузер не поддерживает мир MAIN — вставим сами
    send('skq:ping');
    setTimeout(() => { if (!coreReady) injectCore(); }, PROBE_MS);
  }

  pushSettings();
})();
