// ---------------------------------------------------------------------------
// Фон расширения: клик по кнопке на панели открывает настройки на активной
// вкладке. Вся остальная работа идёт в мосте и в ядре.
// ---------------------------------------------------------------------------
(function background() {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const action = api.action || api.browserAction;
  if (!action || !action.onClicked) return;

  action.onClicked.addListener((tab) => {
    if (!tab || tab.id == null) return;
    try {
      const res = api.tabs.sendMessage(tab.id, { skq: 'open-settings' });
      if (res && typeof res.catch === 'function') res.catch(() => {});
    } catch { /* вкладка без нашего моста */ }
  });
})();
