// Загрузчик. Работает в песочнице Tampermonkey: хранит настройки и держит меню.
// Основной код (core) внедряется прямо в страницу — только там он может
// подменять fetch/XHR сайта и читать данные React.
// ---------------------------------------------------------------------------
(function loader() {
  'use strict';

  let stored = null;
  try { stored = GM_getValue('settings', null); } catch { /* ignore */ }

  const code = `(${core})(${JSON.stringify(stored)});`;
  let injected = null;
  try {
    // GM_addElement обходит CSP сайта
    injected = GM_addElement('script', { textContent: code });
  } catch (e) {
    console.warn('[skq] GM_addElement failed, falling back', e);
  }
  if (!injected) {
    const s = document.createElement('script');
    s.textContent = code;
    (document.head || document.documentElement).appendChild(s);
    injected = s;
  }
  if (injected && injected.remove) injected.remove();

  document.addEventListener('skq:settings-save', (e) => {
    try {
      GM_setValue('settings', JSON.parse(e.detail));
    } catch (err) {
      console.warn('[skq] settings not saved', err);
    }
  });

  // Язык пункта меню: он живёт в песочнице, поэтому определяем его отдельно
  const MENU_LABEL = {{MENU}};
  function menuLabel() {
    const codes = [location.pathname.split('/')[1], document.documentElement.lang, navigator.language];
    for (const raw of codes) {
      const c = String(raw || '').toLowerCase().replace(/_/g, '-');
      if (MENU_LABEL[c]) return MENU_LABEL[c];
      if (MENU_LABEL[c.split('-')[0]]) return MENU_LABEL[c.split('-')[0]];
    }
    return MENU_LABEL.en;
  }

  GM_registerMenuCommand('⚙ ' + menuLabel(), () => {
    document.dispatchEvent(new CustomEvent('skq:open-settings'));
  });
})();
