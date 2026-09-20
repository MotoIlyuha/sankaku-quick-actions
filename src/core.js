// ---------------------------------------------------------------------------
// Основной код — выполняется в контексте страницы
// ---------------------------------------------------------------------------
function core(storedSettings) {
  'use strict';

  if (window.__skqLoaded) return;
  window.__skqLoaded = true;

  const DEFAULT_API = 'https://sankakuapi.com';
  const DEBUG = false;
  const POPPER_SEL = '[role="tooltip"], [class*="MuiTooltip-popper"]';

  // Пути иконок MUI (viewBox 0 0 24 24)
  const PATH = {
    star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    half: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4V6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
    empty: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
    favOn: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    favOff: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  };

  const log = (...a) => DEBUG && console.log('[skq]', ...a);

  const W = window;

  // Страница «Создать пост», встроенная в «Массовую загрузку»
  const FRAME_PREFIX = 'skq-frame:';
  const FRAME_MODE = window.top !== window && String(window.name || '').startsWith(FRAME_PREFIX);
  const MASS_HASH = '#skq-mass';
  const isMutating = (m) => !/^(GET|HEAD|OPTIONS)$/.test(m);

  // Сетевая активность формы — родитель по ней понимает, что форма «успокоилась»
  const frameNet = { inflight: 0, last: Date.now() };
  if (FRAME_MODE) window.__skqNet = frameNet;
  const netStart = () => { frameNet.inflight++; frameNet.last = Date.now(); };
  const netEnd = () => { frameNet.inflight = Math.max(0, frameNet.inflight - 1); frameNet.last = Date.now(); };

  // ---------------------------------------------------------------------------
  // Настройки (меню Tampermonkey → «Настройки»)
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    hideAds: true,
    hidePromo: true, // напоминания купить Sankaku Plus / Infinite
    revealHoverMs: 400,
    revealKeyboardMs: 1500,
    rehideOnBlur: false,
    rehideDelayMs: 1000,
    favKey: 'KeyF',
    commentKey: 'KeyC',
    emotionKey: 'KeyE',
    massMaxForms: 3,
    showPoints: true,
    showReputation: true,
    showMyVote: true, // своя оценка прямо на карточке в сетке
    showFavCount: true, // количество лайков в углу карточки
    menu: {}, // пункты бокового меню: { ключ: {name, off, hk, hkOn, count} }
    menuKey: 'KeyM', // клавиша, открывающая и закрывающая боковое меню
    menuKeyOn: false,
    menuHoldMod: false, // меню видно, пока зажат Ctrl или Alt
    titles: {}, // заголовки страниц без пункта меню: { исходный текст: своё название }
  };
  const settings = {
    ...DEFAULTS,
    ...(storedSettings && typeof storedSettings === 'object' ? storedSettings : {}),
  };

  // Сохранением в хранилище Tampermonkey занимается загрузчик
  function saveSettings(next) {
    Object.assign(settings, next);
    document.dispatchEvent(new CustomEvent('skq:settings-save', { detail: JSON.stringify(settings) }));
    applySettings();
  }

  // В расширении хранилище асинхронное: ядро стартует с настройками по умолчанию,
  // а сохранённые приходят отдельным событием, как только их прочитает мост.
  document.addEventListener('skq:settings-load', (e) => {
    try {
      const next = JSON.parse(e.detail);
      if (!next || typeof next !== 'object') return;
      Object.assign(settings, next);
      if (document.body) applySettings();
    } catch { /* ignore */ }
  });

  // мост проверяет, добрались ли мы до страницы, и сам вставит ядро, если нет
  const announce = () => document.dispatchEvent(new CustomEvent('skq:ready'));
  document.addEventListener('skq:ping', announce);
  announce();
  // мост мог загрузиться раньше и не услышать нас — просим настройки сами
  document.dispatchEvent(new CustomEvent('skq:settings-request'));

  const AD_HOSTS = /(?:^|\.)(?:realsrv|exosrv|exoclick|magsrv|pemsrv|tsyndicate|juicyads|adglare|twinrdsrv|trafficjunky|trafficstars|clickadu|hilltopads|popads|propellerads|adsterra|a-ads|adnxs|doubleclick|googlesyndication|adservice\.google|ero-advertising|plugrush|adspyglass|bidgear|adskeeper|mgid)\./i;

  function isAdUrl(src) {
    if (!src) return false;
    try { return AD_HOSTS.test(new URL(src, location.href).hostname); } catch { return false; }
  }

  // Не даём вставить на страницу скрипты и фреймы рекламных сетей
  {
    const isAdNode = (n) =>
      settings.hideAds && n && n.nodeType === 1 && /^(SCRIPT|IFRAME|IMG)$/.test(n.tagName) && isAdUrl(n.getAttribute('src'));
    const NP = W.Node.prototype;
    for (const m of ['appendChild', 'insertBefore']) {
      const orig = NP[m];
      NP[m] = function (node) {
        if (isAdNode(node)) { log('blocked', node.getAttribute('src')); return node; }
        return orig.apply(this, arguments);
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Языки. Ключ строки — её русский текст, перевод берётся по языку,
  // выбранному в настройках Sankaku (он же стоит в адресе страницы).
  // ---------------------------------------------------------------------------
  const SKQ_VERSION = '{{VERSION}}';

  const STRINGS = {{I18N}};

  // варианты записи одного и того же языка
  const LANG_ALIAS = {
    'zh-cn': 'zh', 'zh-hans': 'zh', 'zh-sg': 'zh', cn: 'zh',
    'zh-tw': 'zh-tw', 'zh-hant': 'zh-tw', 'zh-hk': 'zh-tw', 'zh-mo': 'zh-tw', tw: 'zh-tw',
    nb: 'no', nn: 'no', nob: 'no', in: 'id', jw: 'id', iw: 'he', ua: 'uk',
  };

  const knownLang = (c) => c === 'ru' || Object.prototype.hasOwnProperty.call(STRINGS, c);

  function normLang(code) {
    let c = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    if (!c) return '';
    c = LANG_ALIAS[c] || c;
    if (knownLang(c)) return c;
    const base = LANG_ALIAS[c.split('-')[0]] || c.split('-')[0];
    return knownLang(base) ? base : '';
  }

  // сайт помнит язык и в адресе, и в своём хранилище
  function langFromStorage() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (!/lang|locale|i18n/i.test(key)) continue;
        const raw = localStorage.getItem(key) || '';
        let code = normLang(raw);
        if (!code) {
          try {
            const o = JSON.parse(raw);
            if (o && typeof o === 'object') code = normLang(o.language || o.lang || o.locale);
          } catch { /* не JSON */ }
        }
        if (code) return code;
      }
    } catch { /* ignore */ }
    return '';
  }

  const langState = { key: null, code: 'en' };

  function lang() {
    const seg = location.pathname.split('/')[1] || '';
    const key = seg + '|' + (document.documentElement.lang || '');
    if (key === langState.key) return langState.code;
    langState.key = key;
    langState.code = normLang(seg) || normLang(document.documentElement.lang) ||
      langFromStorage() || normLang(navigator.language) || 'en';
    return langState.code;
  }

  // Перевод строки: первый аргумент — русский текст, второй — подстановки
  function t(key, vars) {
    const code = lang();
    const table = code === 'ru' ? null : STRINGS[code];
    let out = (table && table[key]) || (code === 'ru' ? key : (STRINGS.en && STRINGS.en[key]) || key);
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
    return out;
  }

  // Экранирование для строк, попадающих в разметку. Кавычки важны не меньше
  // угловых скобок: перевод с " внутри иначе развалил бы title="…".
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ESC[ch]);
  // T() — тот же перевод, но готовый к вставке в HTML-шаблон
  const T = (key, vars) => esc(t(key, vars));

  // ---------------------------------------------------------------------------
  // Хранилище
  // ---------------------------------------------------------------------------
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const myVotes = store.get('skq:votes', {});
  function saveVote(id, n) {
    delete myVotes[id];
    myVotes[id] = n;
    const keys = Object.keys(myVotes);
    if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete myVotes[k]);
    store.set('skq:votes', myVotes);
  }

  const posts = new Map(); // id -> { id, md5, total_score, vote_count, fav_count, is_favorited, user_vote, _touched }
  const byMd5 = new Map(); // md5 -> id
  const auth = { base: null, headers: null, credentials: undefined };
  let lastHoveredId = null;
  // Навигация с клавиатуры: mode = клавиатура сейчас «ведёт», card/id = активная карточка
  const kb = { mode: false, card: null, id: null };
  let hoverCard = null;

  // Телефон: наведения нет, клавиатуры обычно тоже. Медиазапрос честнее, чем
  // разбор userAgent, и переключается сам, если подключили мышь.
  const coarse = typeof matchMedia === 'function' ? matchMedia('(hover: none)') : null;
  const TOUCH = () => !!(coarse && coarse.matches);
  const markTouch = () => document.documentElement.classList.toggle('skq-touch', TOUCH());
  if (coarse && coarse.addEventListener) coarse.addEventListener('change', markTouch);

  const isObj = (o) => o && typeof o === 'object';
  const looksLikePost = (o) =>
    isObj(o) && !Array.isArray(o) &&
    (typeof o.id === 'number' || typeof o.id === 'string') &&
    ('fav_count' in o || 'total_score' in o || 'vote_count' in o);

  function remember(src, soft) {
    const id = String(src.id);
    const p = posts.get(id) || { id };
    const vals = {
      md5: src.md5,
      total_score: src.total_score,
      vote_count: src.vote_count,
      fav_count: src.fav_count,
      is_favorited: src.is_favorited,
      user_vote: src.user_vote ?? src.my_vote ?? src.current_user_vote,
      preview_url: src.preview_url,
      sample_url: src.sample_url,
      file_url: src.file_url,
      file_type: src.file_type,
    };
    for (const k in vals) {
      if (vals[k] === undefined || vals[k] === null) continue;
      if (soft && p[k] !== undefined) continue;
      p[k] = vals[k];
    }
    posts.set(id, p);
    if (p.md5) byMd5.set(p.md5, id);
    return p;
  }
  const ensurePost = (id) => posts.get(String(id)) || remember({ id });

  let harvestUrl = '';

  function harvest(data, depth = 0, url) {
    if (!isObj(data) || depth > 7) return;
    if (depth === 0) {
      harvestUrl = url || '';
      sniffReputation(data);
      harvest(data, 1);
      // в ответе могла прийти наша оценка — обновляем метки на карточках
      if (!FRAME_MODE && document.body) scheduleScan();
      return;
    }
    if (Array.isArray(data)) { for (const x of data) harvest(x, depth + 1); return; }
    if (looksLikePost(data)) remember(data, false);
    for (const k in data) if (isObj(data[k])) harvest(data[k], depth + 1);
  }

  const userVote = (p) => Number(p.user_vote ?? myVotes[p.id] ?? 0) || 0;

  // ---------------------------------------------------------------------------
  // Перехват запросов сайта: берём токен/заголовки и данные постов
  // ---------------------------------------------------------------------------
  function headersToObj(h) {
    const o = {};
    if (!h) return o;
    if (typeof h.forEach === 'function' && typeof h.get === 'function') h.forEach((v, k) => (o[k.toLowerCase()] = v));
    else if (Array.isArray(h)) h.forEach(([k, v]) => (o[String(k).toLowerCase()] = v));
    else Object.keys(h).forEach((k) => (o[k.toLowerCase()] = h[k]));
    return o;
  }

  function onSiteRequest(url, headers, credentials) {
    try {
      if (!/^bearer\s+\S/i.test(headers.authorization || '')) return;
      const u = new URL(url, location.href);
      if (u.origin === location.origin) return;
      const keep = {};
      for (const k in headers) if (!/^(content-type|content-length)$/.test(k)) keep[k] = headers[k];
      auth.headers = keep;
      auth.base = u.origin;
      if (credentials) auth.credentials = credentials;
    } catch { /* ignore */ }
  }

  function shouldHarvest(url) {
    return /sankakuapi\.com|capi-v\d+\.sankakucomplex\.com/i.test(url) || (!!auth.base && url.startsWith(auth.base));
  }

  const origFetch = W.fetch.bind(W);
  W.fetch = function (input, init) {
    let url = '';
    try {
      const headers = {};
      let creds = init && init.credentials;
      if (input && typeof input === 'object' && typeof input.url === 'string' && input.headers) {
        url = input.url;
        Object.assign(headers, headersToObj(input.headers));
        creds = creds || input.credentials;
      } else {
        url = String(input);
      }
      Object.assign(headers, headersToObj(init && init.headers));
      onSiteRequest(url, headers, creds);
    } catch { /* ignore */ }
    const res = origFetch(input, init);
    if (FRAME_MODE) {
      netStart();
      res.then(netEnd, netEnd);
    }
    if (url && shouldHarvest(url)) {
      res.then((r) => r.clone().json().then((d) => harvest(d, 0, url))).catch(() => {});
    }
    if (FRAME_MODE && url) {
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (isMutating(method)) {
        res.then(
          (r) => r.clone().json().catch(() => null).then((d) => onMutatingResponse(method, url, r.status, d)),
          () => {},
        );
      }
    }
    return res;
  };

  const XP = W.XMLHttpRequest.prototype;
  const xOpen = XP.open, xSetHeader = XP.setRequestHeader, xSend = XP.send;
  XP.open = function (method, url) {
    this.__skq = { method: String(method || 'GET').toUpperCase(), url: String(url), h: {} };
    return xOpen.apply(this, arguments);
  };
  XP.setRequestHeader = function (k, v) {
    if (this.__skq) this.__skq.h[String(k).toLowerCase()] = v;
    return xSetHeader.apply(this, arguments);
  };
  XP.send = function () {
    const meta = this.__skq;
    if (meta) {
      onSiteRequest(meta.url, meta.h, this.withCredentials ? 'include' : undefined);
      if (FRAME_MODE) {
        netStart();
        this.addEventListener('loadend', netEnd);
      }
      if (shouldHarvest(meta.url)) {
        this.addEventListener('load', () => {
          try {
            if (this.responseType === 'json') harvest(this.response, 0, meta.url);
            else if (this.responseType === '' || this.responseType === 'text') harvest(JSON.parse(this.responseText), 0, meta.url);
          } catch { /* ignore */ }
        });
      }
      if (FRAME_MODE && isMutating(meta.method)) {
        this.addEventListener('loadend', () => {
          let d = null;
          try {
            if (this.responseType === 'json') d = this.response;
            else if (this.responseType === '' || this.responseType === 'text') d = JSON.parse(this.responseText);
          } catch { /* не JSON */ }
          onMutatingResponse(meta.method, meta.url, this.status, d);
        });
      }
    }
    return xSend.apply(this, arguments);
  };

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  function findStoredToken() {
    const re = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;
    const found = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const m = (localStorage.getItem(k) || '').match(re);
        if (m) found.push([k, m[0]]);
      }
    } catch { /* ignore */ }
    for (const c of document.cookie.split(';')) {
      const i = c.indexOf('=');
      if (i < 0) continue;
      let v = c.slice(i + 1);
      try { v = decodeURIComponent(v); } catch { /* ignore */ }
      const m = v.match(re);
      if (m) found.push([c.slice(0, i).trim(), m[0]]);
    }
    const best = found.find(([k]) => /access/i.test(k)) || found.find(([k]) => !/refresh/i.test(k));
    return best && best[1];
  }

  function requestHeaders() {
    if (auth.headers) return { ...auth.headers };
    const h = { accept: 'application/vnd.sankaku.api+json;v=2', platform: 'web-app', 'api-version': '2' };
    const token = findStoredToken();
    if (token) h.authorization = 'Bearer ' + token;
    return h;
  }

  async function api(method, path, body) {
    const headers = requestHeaders();
    if (!headers.authorization) {
      const e = new Error(t('Не найден токен. Войдите в аккаунт и обновите страницу'));
      e.status = 401;
      throw e;
    }
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await origFetch((auth.base || DEFAULT_API) + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: auth.credentials,
    });
    let data = null;
    try { data = await r.json(); } catch { /* пустой ответ */ }
    log(method, path, r.status, data);
    if (!r.ok || (data && data.success === false)) {
      const msg = (data && (data.error || data.message || data.code)) || `HTTP ${r.status}`;
      const e = new Error(r.status === 401 ? t('Сессия истекла. Обновите страницу') : String(msg));
      e.status = r.status;
      throw e;
    }
    return data || {};
  }

  const isAuthError = (e) => e.status === 401 || e.status === 403 || e.status === 429;

  async function loadPostInfo(p) {
    if (p._loaded) return;
    p._loaded = true;
    try {
      harvest(await api('GET', `/posts?lang=en&page=1&limit=1&tags=${encodeURIComponent('id_range:' + p.id)}`));
    } catch (e) {
      log('info load failed', e);
    }
  }

  async function vote(id, n) {
    const p = ensurePost(id);
    if (p.user_vote === undefined && myVotes[id] === undefined) await loadPostInfo(p);
    const old = userVote(p);
    if (n === old && n !== 0) n = 0; // повторный клик по своей оценке снимает её

    let data;
    if (n === 0) {
      try {
        data = await api('DELETE', `/posts/${id}/vote`);
      } catch (e) {
        if (isAuthError(e)) throw e;
        data = await api('POST', `/posts/${id}/vote`, { score: 0 });
      }
    } else {
      data = await api('POST', `/posts/${id}/vote`, { score: n });
    }

    if (typeof p.vote_count === 'number' && typeof p.total_score === 'number') {
      let c = p.vote_count, t = p.total_score;
      if (old) { c -= 1; t -= old; }
      if (n) { c += 1; t += n; }
      p.vote_count = Math.max(0, c);
      p.total_score = Math.max(0, t);
    }
    const src = data.post || data;
    if (typeof src.vote_count === 'number') p.vote_count = src.vote_count;
    if (typeof src.total_score === 'number') p.total_score = src.total_score;

    p.user_vote = n;
    p._touched = true;
    saveVote(id, n);
    return n;
  }

  async function toggleFav(id) {
    const p = ensurePost(id);
    if (typeof p.is_favorited !== 'boolean') await loadPostInfo(p);
    const known = typeof p.is_favorited === 'boolean';
    let on = !!p.is_favorited;

    let data;
    try {
      data = await api(on ? 'DELETE' : 'POST', `/posts/${id}/favorite`);
    } catch (e) {
      // состояние было неизвестно, а пост, видимо, уже в избранном
      if (known || isAuthError(e)) throw e;
      on = true;
      data = await api('DELETE', `/posts/${id}/favorite`);
    }

    p.is_favorited = !on;
    const src = data.post || data;
    if (typeof src.fav_count === 'number') p.fav_count = src.fav_count;
    else if (typeof p.fav_count === 'number') p.fav_count = Math.max(0, p.fav_count + (on ? -1 : 1));
    p._touched = true;
    return p.is_favorited;
  }

  // ---------------------------------------------------------------------------
  // Как понять, к какому посту относится виджет
  // ---------------------------------------------------------------------------
  function idFromHref(href) {
    const m = /\/posts?\/(?:show\/)?([A-Za-z0-9]+)(?:[/?#]|$)/.exec(href || '');
    return m ? m[1] : null;
  }

  function linkIdIn(el) {
    if (!el) return null;
    const own = el.closest('a[href]');
    const id = own && idFromHref(own.getAttribute('href'));
    if (id) return id;
    for (const a of el.querySelectorAll('a[href]')) {
      const x = idFromHref(a.getAttribute('href'));
      if (x) return x;
    }
    return null;
  }

  function fiberOf(el) {
    for (const k in el) {
      if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return el[k];
    }
    return null;
  }

  // Ищем объект поста в пропсах React-компонентов выше по дереву
  function postFromFiber(el) {
    let f = fiberOf(el);
    for (let i = 0; f && i < 80; i++, f = f.return) {
      const pr = f.memoizedProps;
      if (!isObj(pr)) continue;
      for (const key of ['post', 'currentPost', 'activePost', 'item']) {
        if (looksLikePost(pr[key])) return pr[key];
      }
    }
    return null;
  }

  function anchorOf(popper) {
    if (!popper || !popper.id) return null;
    return document.querySelector(`[aria-describedby="${CSS.escape(popper.id)}"]`);
  }

  function activeSlideMd5() {
    const slide = document.querySelector('.swiper-slide-active');
    if (!slide) return null;
    for (const m of slide.querySelectorAll('img[src], video[src], source[src]')) {
      const r = /\/([0-9a-f]{32})\.\w+/i.exec(m.getAttribute('src'));
      if (r) return r[1].toLowerCase();
    }
    return null;
  }

  function resolveSync(w) {
    const fp = postFromFiber(w);
    if (fp) return remember(fp, true);

    const pop = w.closest(POPPER_SEL);
    if (pop) {
      const id = linkIdIn(anchorOf(pop)) || lastHoveredId;
      return id ? ensurePost(id) : null;
    }

    const md5 = activeSlideMd5();
    if (md5) return byMd5.has(md5) ? posts.get(byMd5.get(md5)) : { md5 };

    let el = w.parentElement;
    for (let i = 0; el && el !== document.body && i < 10; i++, el = el.parentElement) {
      const ids = new Set();
      for (const a of el.querySelectorAll('a[href]')) {
        const x = idFromHref(a.getAttribute('href'));
        if (x) ids.add(x);
        if (ids.size > 1) break;
      }
      if (ids.size === 1) return ensurePost([...ids][0]);
      if (ids.size > 1) break;
    }

    const id = idFromHref(location.pathname);
    return id ? ensurePost(id) : null;
  }

  async function resolvePost(w) {
    const ref = resolveSync(w);
    if (!ref || ref.id != null) return ref;
    const data = await api('GET', `/posts?lang=en&page=1&limit=1&tags=${encodeURIComponent('md5:' + ref.md5)}`);
    harvest(data);
    const id = byMd5.get(ref.md5);
    return id ? posts.get(id) : null;
  }

  // ---------------------------------------------------------------------------
  // Отрисовка
  // ---------------------------------------------------------------------------
  function setPath(svg, d) {
    const path = svg.querySelector('path');
    if (!path || path.getAttribute('d') === d) return;
    path.setAttribute('d', d);
    path.removeAttribute('fill-rule');
    path.removeAttribute('clip-rule');
  }

  // Во время наведения исходная форма звезды лежит в data-skq-d
  function setStarShape(star, d) {
    if ('skqD' in star.dataset) star.dataset.skqD = d;
    else setPath(star, d);
  }

  function setCount(w, value) {
    const el = w.querySelector('p, span');
    if (!el) return;
    const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    const text = String(value);
    if (node) { if (node.nodeValue !== text) node.nodeValue = text; }
    else el.textContent = text;
    w.dataset.skqWrote = '1';
  }

  const stars = (w) => [...w.querySelectorAll('.skq-star')];

  function paintRate(w, p) {
    const mine = userVote(p);
    const hasAvg = typeof p.vote_count === 'number' && typeof p.total_score === 'number';
    const avg = hasAvg && p.vote_count > 0 ? Math.round((p.total_score / p.vote_count) * 2) / 2 : 0;
    for (const s of stars(w)) {
      const n = +s.dataset.skqN;
      s.classList.toggle('skq-mine', n <= mine);
      if (hasAvg) setStarShape(s, n <= avg ? PATH.star : n - 0.5 === avg ? PATH.half : PATH.empty);
    }
    if (hasAvg && (p._touched || w.dataset.skqWrote)) setCount(w, p.vote_count);
  }

  function paintFav(w, p) {
    const svg = w.querySelector('.skq-heart');
    if (svg && typeof p.is_favorited === 'boolean') {
      setPath(svg, p.is_favorited ? PATH.favOn : PATH.favOff);
      svg.classList.toggle('skq-faved', p.is_favorited);
    }
    if (typeof p.fav_count === 'number' && (p._touched || w.dataset.skqWrote)) setCount(w, p.fav_count);
  }

  function paint(w, p) {
    if (w.classList.contains('skq-rate')) paintRate(w, p);
    else paintFav(w, p);
  }

  const widgets = new Set();

  function refresh(w, force) {
    const ref = resolveSync(w);
    const key = ref ? (ref.id != null ? String(ref.id) : 'md5:' + ref.md5) : '';
    if (!force && w.dataset.skqKey === key) return;
    w.dataset.skqKey = key;
    if (ref && ref.id != null) paint(w, ref);
  }

  function refreshPost(id) {
    for (const w of widgets) if (w.dataset.skqKey === String(id)) refresh(w, true);
    markCards();
  }

  function preview(w, n) {
    for (const s of stars(w)) {
      const k = +s.dataset.skqN;
      if (!('skqD' in s.dataset)) s.dataset.skqD = s.querySelector('path')?.getAttribute('d') || '';
      setPath(s, k <= n ? PATH.star : PATH.empty);
      s.classList.toggle('skq-hover', k <= n);
    }
  }

  function unpreview(w) {
    for (const s of stars(w)) {
      if ('skqD' in s.dataset) {
        const d = s.dataset.skqD;
        delete s.dataset.skqD;
        if (d) setPath(s, d);
      }
      s.classList.remove('skq-hover');
    }
  }

  function markPopper(w) {
    const pop = w.closest(POPPER_SEL);
    if (pop) pop.classList.add('skq-pop');
  }

  // ---------------------------------------------------------------------------
  // Реклама и напоминания о подписке
  // ---------------------------------------------------------------------------
  const PROMO_RE = /sankaku\s*(?:plus|infinite|premium|gold)\b|remove\s+ads|без\s*рекламы|безрекламн/i;
  const PROMO_PAGE_RE = /\/(?:plus|infinite|premium|upgrade|subscriptions?|billing|settings|account)(?:\/|$)/i;
  const PAPER_SEL = '[class*="MuiPaper-root"], [class*="MuiCard-root"]';
  const MODAL_SEL = '[class*="MuiDialog-root"], [class*="MuiModal-root"], [role="presentation"]';

  function hide(el, why) {
    if (!el || el === document.body || el === document.documentElement || el.classList.contains('skq-hidden')) return;
    el.classList.add('skq-hidden');
    el.dataset.skqHidden = why;
    log('hidden', why, el);
    if (el.matches(MODAL_SEL) || el.querySelector('[role="dialog"]')) {
      // MUI блокирует прокрутку, пока открыт диалог
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }

  // Поднимаемся через обёртки, у которых единственный ребёнок и тот же размер
  function collapseWrappers(c) {
    for (let p = c.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.children.length !== 1 || p.matches('main, nav, header, ul, [role="dialog"]')) break;
      if (p.getBoundingClientRect().height > c.getBoundingClientRect().height + 40) break;
      c = p;
    }
    return c;
  }

  function adContainer(el) {
    let c = el;
    for (let i = 0, n = el.parentElement; n && n !== document.body && i < 6; i++, n = n.parentElement) {
      if (n.parentElement && n.parentElement.querySelector(':scope > ' + CARD_SEL)) return n; // ячейка сетки
      if (n.matches(PAPER_SEL)) return n.querySelector(CARD_SEL) ? c : collapseWrappers(n);
      if (n.querySelector(CARD_SEL) || n.children.length > 1) break;
      c = n;
    }
    return c;
  }

  function promoContainer(el) {
    if (el.closest('[role="dialog"]')) return el.closest(MODAL_SEL) || el.closest('[role="dialog"]');
    let c = el.closest(`li, button, [role="button"], ${PAPER_SEL}, [class*="MuiAlert-root"], [class*="MuiSnackbar"]`);
    if (c && c.matches('button, [role="button"]')) {
      const li = c.closest('li');
      if (li && li.querySelectorAll('button, a[href], [role="button"]').length <= 1) c = li;
    }
    if (!c || c.querySelector(CARD_SEL) || c.getBoundingClientRect().height > innerHeight * 0.6) {
      c = el.parentElement || el;
    }
    return collapseWrappers(c);
  }

  function propsUp(el, depth, test) {
    let f = fiberOf(el);
    for (let i = 0; f && i < depth; i++, f = f.return) {
      if (isObj(f.memoizedProps) && test(f.memoizedProps)) return f.memoizedProps;
    }
    return null;
  }

  const isBannerProps = (p) => 'bannerName' in p || ('showBanner' in p && 'btnTitle' in p);
  const isAdItemProps = (p) => [p.item, p.data, p.ad].some((x) => isObj(x) && /^(ad|ads|advert|banner|promo)/i.test(String(x.type || x.kind || '')));

  function inGridCell(el) {
    for (let n = el.parentElement, i = 0; n && i < 6; n = n.parentElement, i++) {
      if (n.parentElement && n.parentElement.querySelector(':scope > ' + CARD_SEL)) return !n.matches(CARD_SEL);
    }
    return false;
  }

  function hideJunk() {
    if (!document.body) return;

    if (settings.hideAds) {
      for (const el of document.querySelectorAll('iframe, ins, [id^="exo"], [id^="div-gpt-ad"], [data-zoneid], [data-zone-id]')) {
        if (el.closest('.skq-hidden')) continue;
        if (el.tagName === 'IFRAME') {
          const src = el.getAttribute('src');
          const adLike = /(?:^|[-_\s])(?:ad|ads|exo|ts|banner)(?:[-_\s\d]|$)/i.test(`${el.id} ${el.className}`);
          if (!isAdUrl(src) && !adLike && !(!src && inGridCell(el))) continue;
        }
        hide(adContainer(el), 'ad');
      }
      // ячейки сетки, которые не посты, но ведут на сторонние сайты или помечены как реклама
      for (const card of document.querySelectorAll(CARD_SEL)) {
        const grid = card.parentElement;
        if (!grid || grid.dataset.skqGrid === String(grid.children.length)) continue;
        grid.dataset.skqGrid = String(grid.children.length);
        for (const cell of grid.children) {
          if (cell.matches(CARD_SEL) || cell.classList.contains('skq-hidden')) continue;
          const external = [...cell.querySelectorAll('a[href^="http"]')].some((a) => !/sankaku/i.test(new URL(a.href).hostname));
          if (external || propsUp(cell, 4, isAdItemProps)) hide(cell, 'ad');
        }
      }
    }

    if (settings.hidePromo && !PROMO_PAGE_RE.test(location.pathname)) {
      for (const paper of document.querySelectorAll(PAPER_SEL)) {
        if (!paper.classList.contains('skq-hidden') && propsUp(paper, 6, isBannerProps)) hide(collapseWrappers(paper), 'banner');
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const v = node.nodeValue;
        if (v.length < 6 || !PROMO_RE.test(v)) continue;
        const el = node.parentElement;
        if (!el || el.closest(`.skq-hidden, .skq-toast, [data-test="skq_mass_upload"], ${CARD_SEL}, ${POPPER_SEL}, input, textarea, script, style, a[href*="tags="]`)) continue;
        if (el.isContentEditable) continue;
        hide(promoContainer(el), 'promo');
      }
    }
  }

  function scan() {
    hideJunk();
    mountSettingsTab();
    scanReputationDom();
    mountReputation();
    applySiteMenu();
    markTitles();
    if (!FRAME_MODE) {
      injectMassMenuItem();
      syncMassRoute();
    }

    for (const svg of document.querySelectorAll('svg[data-test$="stars"]:not(.skq-star)')) {
      if (svg.closest('button')) continue;
      const row = svg.parentElement;
      const w = row && row.parentElement;
      if (!w) continue;
      for (const s of row.querySelectorAll('svg[data-test$="stars"]')) {
        s.classList.add('skq-star');
        s.dataset.skqN = String(parseInt(s.getAttribute('data-test'), 10));
      }
      w.classList.add('skq-rate');
      w.title = t('Клик: поставить оценку. Клик по своей оценке: снять её');
      widgets.add(w);
      markPopper(w);
    }

    for (const svg of document.querySelectorAll('svg[data-test="fav"]:not(.skq-heart), [class*="MuiTooltip-tooltip"] svg:not(.skq-heart)')) {
      const d = svg.querySelector('path')?.getAttribute('d') || '';
      // у иконки комментариев на странице поста тоже data-test="fav" — узнаём сердечко по форме
      if (!HEART_PATH_RE.test(d.slice(0, 40))) continue;
      if (svg.closest('button')) continue;
      const w = svg.parentElement;
      if (!w) continue;
      svg.classList.add('skq-heart');
      w.classList.add('skq-fav');
      w.title = t('Добавить в избранное / убрать из избранного');
      widgets.add(w);
      markPopper(w);
    }

    for (const w of widgets) {
      if (!w.isConnected) widgets.delete(w);
      else refresh(w, false);
    }

    markCards();

    // виртуальная сетка пересоздаёт карточки — возвращаем уже раскрытые превью
    if (revealed.size) {
      for (const card of document.querySelectorAll(CARD_SEL)) {
        const id = cardId(card);
        if (id && revealed.has(id) && isHidden(card)) applyReveal(card, revealed.get(id));
      }
    }
  }

  let scanTimer = 0;
  const scheduleScan = () => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 60);
  };

  // ---------------------------------------------------------------------------
  // Уведомления
  // ---------------------------------------------------------------------------
  let toastEl = null, toastTimer = 0;
  function toast(text, isError) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'skq-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.toggle('skq-err', !!isError);
    toastEl.classList.add('skq-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('skq-show'), isError ? 4000 : 1800);
  }

  // ---------------------------------------------------------------------------
  // События
  // ---------------------------------------------------------------------------
  const ACTIVE_SEL = '.skq-star, .skq-fav';
  const HEART_PATH_RE = /16\.5[\s,]+3|12 21\.35/;
  const closestEl = (node, sel) => (node instanceof Element ? node.closest(sel) : null);

  // Не пускаем нажатия к Draggable/Swiper/ссылкам под виджетом
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend', 'dblclick']) {
    document.addEventListener(type, (e) => {
      if (closestEl(e.target, ACTIVE_SEL)) e.stopPropagation();
    }, true);
  }

  document.addEventListener('click', async (e) => {
    const hit = closestEl(e.target, ACTIVE_SEL);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const isFav = hit.classList.contains('skq-fav');
    const w = isFav ? hit : hit.closest('.skq-rate');
    if (!w || w.classList.contains('skq-busy')) return;
    w.classList.add('skq-busy');
    try {
      const p = await resolvePost(w);
      if (!p) throw new Error(t('Не удалось определить пост'));
      w.dataset.skqKey = String(p.id);
      if (isFav) {
        const on = await toggleFav(p.id);
        toast(on ? t('Добавлено в избранное') : t('Убрано из избранного'));
      } else {
        const n = await vote(p.id, +hit.dataset.skqN);
        toast(n ? t('Оценка: {stars}', { stars: '★'.repeat(n) }) : t('Оценка снята'));
      }
      refreshPost(p.id);
    } catch (err) {
      console.warn('[skq]', err);
      toast(t('Ошибка: {msg}', { msg: err.message }), true);
    } finally {
      w.classList.remove('skq-busy');
    }
  }, true);

  document.addEventListener('mouseover', (e) => {
    const a = closestEl(e.target, 'a[href]');
    if (a) {
      const id = idFromHref(a.getAttribute('href'));
      if (id) lastHoveredId = id;
    }
    const s = closestEl(e.target, '.skq-star');
    if (s) preview(s.closest('.skq-rate'), +s.dataset.skqN);
  }, true);

  document.addEventListener('mouseout', (e) => {
    const from = e.target instanceof Element ? e.target : null;
    const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (!from) return;

    // уход со звёзд: убираем подсветку
    const s = from.closest('.skq-star');
    if (s) {
      const w = s.closest('.skq-rate');
      if (w && !(to && w.contains(to) && to.closest('.skq-star'))) unpreview(w);
    }

    if (!e.isTrusted || kb.mode) return;

    // Карточка-подсказка MUI закрывается, когда курсор уходит с превью.
    // Курсор переходит с превью на карточку: прячем от React этот «уход».
    const toPop = to && to.closest('.skq-pop');
    if (toPop && !from.closest(POPPER_SEL)) {
      const anchor = anchorOf(toPop);
      if (anchor && anchor.contains(from)) {
        e.stopPropagation();
        return;
      }
    }

    // Курсор ушёл с карточки наружу: сообщаем превью, что курсор ушёл
    const fromPop = from.closest('.skq-pop');
    if (fromPop && !(to && fromPop.contains(to))) {
      const anchor = anchorOf(fromPop);
      if (anchor && !(to && anchor.contains(to))) {
        anchor.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window, relatedTarget: to }));
      }
    }
  }, true);

  // ---------------------------------------------------------------------------
  // Клавиатура: стрелки — выбор карточки в сетке, 1-5 — оценка, F — избранное
  // ---------------------------------------------------------------------------
  const CARD_SEL = '[data-test="post-card"]';

  const cardId = (card) => linkIdIn(card);
  const allCards = () => [...document.querySelectorAll(CARD_SEL)].filter((c) => c.getBoundingClientRect().width > 0);
  const hoverTarget = (card) => card.querySelector('a[href] img') || card.querySelector('a[href]') || card;

  function fire(el, kind, related) {
    const r = el.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true, view: window, relatedTarget: related || null,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    };
    if (typeof PointerEvent !== 'undefined') el.dispatchEvent(new PointerEvent('pointer' + kind, { ...init, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mouse' + kind, init));
  }

  function currentCard() {
    if (!kb.id) return null;
    if (kb.card && kb.card.isConnected && cardId(kb.card) === kb.id) return kb.card;
    // виртуальная сетка могла пересоздать элемент
    const found = allCards().find((c) => cardId(c) === kb.id) || null;
    if (kb.card && kb.card !== found) kb.card.classList.remove('skq-kb-active');
    kb.card = found;
    if (found && kb.mode) found.classList.add('skq-kb-active');
    return found;
  }

  // ---- Своя оценка на карточке ----
  function voteOfId(id) {
    const p = posts.get(String(id));
    return p ? userVote(p) : Number(myVotes[String(id)]) || 0;
  }

  function favsOfId(id) {
    const p = posts.get(String(id));
    return p && typeof p.fav_count === 'number' ? p.fav_count : null;
  }

  // большие числа сайт тоже сокращает: 12 300 → 12.3K
  const shortCount = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n));

  // Одна метка на карточке: создаём, обновляем или убираем
  function cardBadge(card, cls, text, title) {
    let badge = card.querySelector(':scope > .' + cls);
    if (text == null) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement('div');
      badge.className = cls;
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      card.appendChild(badge);
    }
    if (badge.textContent !== text) badge.textContent = text;
    if (badge.title !== title) badge.title = title;
  }

  function markCards() {
    if (FRAME_MODE || !document.body) return;
    const wantVote = settings.showMyVote, wantFavs = settings.showFavCount;
    for (const card of document.querySelectorAll(CARD_SEL)) {
      const id = wantVote || wantFavs ? cardId(card) : null;
      // данные могли прийти в карточке, а не в перехваченном ответе
      if (id && !card.dataset.skqVoteRead) {
        card.dataset.skqVoteRead = '1';
        const fp = postFromFiber(hoverTarget(card));
        if (fp && String(fp.id) === id) remember(fp, true);
      }
      const n = wantVote && id ? voteOfId(id) : 0;
      cardBadge(card, 'skq-myvote', n ? `★ ${n}` : null, n ? t('Ваша оценка: {n} из 5', { n }) : '');
      // ноль не показываем: пустой угол спокойнее, чем «♥ 0» на половине сетки
      const favs = wantFavs && id ? favsOfId(id) : null;
      cardBadge(card, 'skq-favs', favs ? `♥ ${shortCount(favs)}` : null,
        favs ? t('Лайков: {n}', { n: favs }) : '');
    }
  }

  // ---- Скрытые превью ----
  const EYE_OFF = /^M12 7c2\.76 0 5 2\.24 5 5/;
  const revealed = new Map(); // id -> url превью ('' — достаточно снять размытие)
  const previewPending = new Map();
  let revealTimer = 0;

  const cardImg = (card) => card.querySelector('a[href] img') || card.querySelector('img');
  const isPlaceholder = (img) => !!img && /PreviewUnavailable/i.test(img.getAttribute('src') || '');
  const eyeIcons = (card) => [...card.querySelectorAll('svg')].filter((s) => EYE_OFF.test(s.querySelector('path')?.getAttribute('d') || ''));

  function isHidden(card) {
    if (isPlaceholder(cardImg(card))) return true;
    return !card.classList.contains('skq-revealed') && eyeIcons(card).length > 0;
  }

  function previewOf(p) {
    if (!p) return '';
    if (p.preview_url) return p.preview_url;
    if (p.sample_url) return p.sample_url;
    if (p.file_url && /^image\//.test(p.file_type || 'image/')) return p.file_url;
    return '';
  }

  function fetchPreview(id) {
    if (previewPending.has(id)) return previewPending.get(id);
    const job = (async () => {
      const p = ensurePost(id);
      if (!previewOf(p)) {
        try {
          harvest(await api('GET', `/posts?lang=en&page=1&limit=1&tags=${encodeURIComponent('id_range:' + id)}`));
        } catch (e) { log('preview list failed', e); }
      }
      if (!previewOf(p)) {
        try { harvest(await api('GET', `/posts/${id}`)); } catch (e) { log('preview post failed', e); }
      }
      return previewOf(p);
    })().finally(() => previewPending.delete(id));
    previewPending.set(id, job);
    return job;
  }

  function applyReveal(card, url) {
    const img = cardImg(card);
    if (img && url && img.getAttribute('src') !== url) {
      if (!img.dataset.skqOrigSrc) img.dataset.skqOrigSrc = img.getAttribute('src') || '';
      img.removeAttribute('srcset');
      img.src = url;
      img.classList.add('skq-rev-img');
    }
    eyeIcons(card).forEach((s) => s.classList.add('skq-eye'));
    card.classList.add('skq-revealed');
  }

  async function reveal(card) {
    const id = cardId(card);
    if (!id || !isHidden(card)) return;
    let url = revealed.get(id);
    if (url === undefined) {
      if (isPlaceholder(cardImg(card))) {
        const fp = postFromFiber(hoverTarget(card));
        if (fp && String(fp.id) === id) remember(fp, true);
        url = previewOf(posts.get(id)) || await fetchPreview(id);
        if (!url) { toast(t('Превью для этого поста недоступно'), true); return; }
      } else {
        url = ''; // картинка есть, она только размыта
      }
      revealed.set(id, url);
    }
    // карточку могли пересоздать, пока шёл запрос
    const target = card.isConnected ? card : allCards().find((c) => cardId(c) === id);
    if (target) applyReveal(target, url);
    // пока грузилось превью, карточку могли покинуть
    if (activeId() !== id) cardLeft(target || card);
  }

  // ---- Повторное скрытие после потери фокуса ----
  const rehideTimers = new Map();

  function activeId() {
    const c = kb.mode ? currentCard() : hoverCard;
    return c ? cardId(c) : null;
  }

  function cancelRehide(id) {
    clearTimeout(rehideTimers.get(id));
    rehideTimers.delete(id);
  }

  function unreveal(id) {
    revealed.delete(id);
    for (const card of document.querySelectorAll(CARD_SEL)) {
      if (cardId(card) !== id) continue;
      const img = cardImg(card);
      if (img) {
        if (img.dataset.skqOrigSrc) img.src = img.dataset.skqOrigSrc;
        delete img.dataset.skqOrigSrc;
        img.classList.remove('skq-rev-img');
      }
      card.querySelectorAll('.skq-eye').forEach((s) => s.classList.remove('skq-eye'));
      card.classList.remove('skq-revealed');
    }
  }

  function cardLeft(card) {
    if (!card || !settings.rehideOnBlur) return;
    const id = cardId(card);
    if (!id) return;
    cancelRehide(id);
    rehideTimers.set(id, setTimeout(() => {
      rehideTimers.delete(id);
      if (activeId() !== id && revealed.has(id)) unreveal(id);
    }, settings.rehideDelayMs));
  }

  function scheduleReveal(card, delay) {
    clearTimeout(revealTimer);
    revealTimer = 0;
    if (card) { const id = cardId(card); if (id) cancelRehide(id); }
    if (!card || !isHidden(card)) return;
    const id = cardId(card);
    revealTimer = setTimeout(() => {
      revealTimer = 0;
      const cur = kb.mode ? currentCard() : hoverCard;
      if (cur && cardId(cur) === id) reveal(cur);
    }, delay);
  }

  const activeCard = () => (kb.mode ? currentCard() : hoverCard && hoverCard.isConnected ? hoverCard : null);

  function isOverlay(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') return !n.matches(POPPER_SEL);
    }
    return false;
  }

  // Высота закреплённой шапки над сеткой
  function topInset(card) {
    const r = card.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    for (let y = 0; y < innerHeight / 2; y += 8) {
      const el = document.elementFromPoint(x, y);
      if (!el || !isOverlay(el)) return y;
    }
    return 0;
  }

  function scrollParent(el) {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  }

  function scrollByY(card, dy) {
    const sp = scrollParent(card);
    if (sp) sp.scrollBy(0, dy);
    else window.scrollBy(0, dy);
  }

  function inView(card) {
    const r = card.getBoundingClientRect();
    return r.bottom > topInset(card) + 20 && r.top < innerHeight - 20;
  }

  function ensureVisible(card) {
    const r = card.getBoundingClientRect();
    const sp = scrollParent(card);
    const top = Math.max(topInset(card), sp ? sp.getBoundingClientRect().top : 0) + 8;
    const bottom = Math.min(innerHeight, sp ? sp.getBoundingClientRect().bottom : innerHeight) - 8;
    if (r.top < top) scrollByY(card, r.top - top);
    else if (r.bottom > bottom) scrollByY(card, Math.min(r.bottom - bottom, r.top - top));
  }

  function activate(card) {
    const prev = kb.card && kb.card.isConnected ? kb.card : hoverCard && hoverCard.isConnected ? hoverCard : null;
    kb.mode = true;
    if (kb.card) kb.card.classList.remove('skq-kb-active');
    kb.card = card;
    kb.id = cardId(card);
    card.classList.add('skq-kb-active');
    ensureVisible(card);
    const target = hoverTarget(card);
    if (prev && prev !== card) {
      fire(hoverTarget(prev), 'out', target);
      cardLeft(prev);
    }
    if (prev !== card) fire(target, 'over', prev ? hoverTarget(prev) : null);
    scheduleReveal(card, settings.revealKeyboardMs);
  }

  function deactivate(under) {
    const card = currentCard();
    kb.mode = false;
    kb.card = null;
    kb.id = null;
    scheduleReveal(null);
    if (!card) return;
    card.classList.remove('skq-kb-active');
    if (!(under && (card.contains(under) || under.closest(POPPER_SEL)))) {
      fire(hoverTarget(card), 'out', under);
      cardLeft(card);
    }
  }

  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
  };

  function pickNext(cur, dir, cards) {
    const c = center(cur);
    const tol = c.h / 2;
    const items = cards.filter((k) => k !== cur).map((k) => ({ k, ...center(k) }));
    const sameRow = items.filter((i) => Math.abs(i.y - c.y) < tol);
    const below = items.filter((i) => i.y >= c.y + tol);
    const above = items.filter((i) => i.y <= c.y - tol);
    const nearestRow = (list, down) => {
      if (!list.length) return [];
      const y = down ? Math.min(...list.map((i) => i.y)) : Math.max(...list.map((i) => i.y));
      return list.filter((i) => Math.abs(i.y - y) < tol);
    };
    const pick = (list, cmp) => (list.sort(cmp)[0] || {}).k || null;
    switch (dir) {
      case 'right':
        return pick(sameRow.filter((i) => i.x > c.x), (a, b) => a.x - b.x) ||
          pick(nearestRow(below, true), (a, b) => a.x - b.x);
      case 'left':
        return pick(sameRow.filter((i) => i.x < c.x), (a, b) => b.x - a.x) ||
          pick(nearestRow(above, false), (a, b) => b.x - a.x);
      case 'down':
        return pick(nearestRow(below, true), (a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x));
      case 'up':
        return pick(nearestRow(above, false), (a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x));
    }
    return null;
  }

  function firstVisible(cards) {
    return cards
      .filter(inView)
      .sort((a, b) => {
        const ca = center(a), cb = center(b);
        return Math.abs(ca.y - cb.y) < ca.h / 2 ? ca.x - cb.x : ca.y - cb.y;
      })[0] || null;
  }

  function move(dir, retried) {
    const cards = allCards();
    if (!cards.length) return false;
    let cur = kb.mode ? currentCard() : hoverCard && hoverCard.isConnected ? hoverCard : null;
    if (!cur || !inView(cur)) {
      const first = firstVisible(cards);
      if (first) activate(first);
      return true;
    }
    if (!kb.mode) activate(cur); // продолжаем с карточки под курсором
    const next = pickNext(cur, dir, cards);
    if (next) {
      activate(next);
    } else if (!retried && dir !== 'left') {
      // следующий ряд ещё не отрисован виртуальной сеткой — подкручиваем и пробуем снова
      scrollByY(cur, dir === 'up' ? -cur.getBoundingClientRect().height : cur.getBoundingClientRect().height);
      setTimeout(() => move(dir, true), 300);
    }
    return true;
  }

  function readerOpen() {
    const s = document.querySelector('.swiper-slide-active');
    return !!s && s.getBoundingClientRect().height > innerHeight * 0.5;
  }

  const busyIds = new Set();

  async function keyAction(card, kind, n) {
    const id = cardId(card);
    if (!id) { toast(t('Не удалось определить пост'), true); return; }
    if (busyIds.has(id)) return;
    busyIds.add(id);
    card.classList.add('skq-card-busy');
    try {
      const fp = postFromFiber(card.querySelector('a[href]') || card);
      if (fp && String(fp.id) === id) remember(fp, true);
      if (kind === 'fav') {
        const on = await toggleFav(id);
        toast(on ? '♥ ' + t('Добавлено в избранное') : '♡ ' + t('Убрано из избранного'));
      } else {
        const v = await vote(id, n);
        toast(v ? t('Оценка: {stars}', { stars: '★'.repeat(v) + '☆'.repeat(5 - v) }) : t('Оценка снята'));
      }
      refreshPost(id);
    } catch (err) {
      console.warn('[skq]', err);
      toast(t('Ошибка: {msg}', { msg: err.message }), true);
    } finally {
      busyIds.delete(id);
      card.classList.remove('skq-card-busy');
    }
  }

  // ---- Хоткеи на странице поста: 1–5, F, C (комментарии), E (эмоция) ----
  const COMMENT_ICON_RE = /^M20 2H4/;
  const EMOTION_ICON_RE = /^M7 9\.5C7 8\.67/;
  const EMO_CLICKABLE = 'button, [role="button"], [role="menuitem"], [role="option"], img, [class*="emoji" i], [class*="reaction" i], [class*="emotion" i]';

  const consumeKey = (e) => { e.preventDefault(); e.stopPropagation(); };

  // Физическая клавиша; если браузер не сообщил code — выводим из key (латиница и цифры)
  function codeOf(e) {
    if (e.code) return e.code;
    const k = String(e.key || '');
    if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
    if (/^[0-9]$/.test(k)) return 'Digit' + k;
    return '';
  }

  function onScreen(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  function clickEl(el) {
    if (!el) return;
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
  }

  // Элемент самой страницы поста (не всплывающая карточка, не плитка сетки)
  function pageElement(selector, pick = (x) => x) {
    const list = [...document.querySelectorAll(selector)]
      .map(pick)
      .filter((el) => el && !el.closest(`${POPPER_SEL}, ${CARD_SEL}, #skq-mass`) && el.getClientRects().length);
    return list.find(onScreen) || list[0] || null;
  }

  const pathOf = (svg) => (svg.querySelector('path') && svg.querySelector('path').getAttribute('d')) || '';
  const postRating = () => pageElement('.skq-rate');
  const postFav = () => pageElement('.skq-fav');
  const commentIcon = () => pageElement('svg', (svg) => (COMMENT_ICON_RE.test(pathOf(svg)) ? svg : null));
  const commentEditor = () => pageElement('#comment-editor .ql-editor, .ql-editor[contenteditable="true"]');
  const emotionButton = () => pageElement('svg', (svg) =>
    (EMOTION_ICON_RE.test(pathOf(svg)) ? svg.closest('button, [role="button"]') || svg : null));
  const onPostPage = () => !!(postRating() || postFav());

  function focusEditable(el) {
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function openComments() {
    let editor = commentEditor();
    if (!editor) {
      clickEl(commentIcon());
      for (let i = 0; i < 30 && !(editor = commentEditor()); i++) await sleep(100);
    }
    if (!editor) {
      toast(t('Не нашёл поле комментария'), true);
      return;
    }
    editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
    focusEditable(editor);
  }

  // ---- Выбор эмоции цифрами ----
  const emo = { active: false, options: [], layer: null, raf: 0, timer: 0, token: 0 };

  function visibleClickables() {
    const out = new Set();
    for (const el of document.querySelectorAll(EMO_CLICKABLE)) {
      const c = el.closest('button, [role="button"], [role="menuitem"], [role="option"]') || el;
      if (out.has(c) || !onScreen(c) || c.closest(`#skq-mass, .skq-toast, .skq-emo-layer, ${CARD_SEL}`)) continue;
      const cs = getComputedStyle(c);
      if (cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05) out.add(c);
    }
    return out;
  }

  const areaOf = (el) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };

  // Из появившихся после нажатия элементов выбираем группу похожих — ближайшую к кнопке
  function pickEmotionGroup(cands, btn) {
    if (cands.length < 2) return [];
    const groups = new Map();
    for (const el of cands) {
      let box = el.parentElement;
      for (let i = 0; i < 3 && box && !cands.some((o) => o !== el && box.contains(o)); i++) box = box.parentElement;
      if (!box) continue;
      if (!groups.has(box)) groups.set(box, []);
      groups.get(box).push(el);
    }
    const br = btn.getBoundingClientRect();
    let best = [], bestScore = -Infinity;
    for (const group of groups.values()) {
      if (group.length < 2 || group.length > 12) continue;
      const areas = group.map(areaOf).sort((a, b) => a - b);
      const median = areas[Math.floor(areas.length / 2)];
      const similar = group.filter((el) => areaOf(el) > median * 0.5 && areaOf(el) < median * 2);
      if (similar.length < 2) continue;
      const rects = similar.map((el) => el.getBoundingClientRect());
      const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2;
      const cy = (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2;
      const score = -Math.hypot(cx - (br.left + br.width / 2), cy - (br.top + br.height / 2)) + (similar.length === 6 ? 200 : 0);
      if (score > bestScore) { bestScore = score; best = similar; }
    }
    return best.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left;
    });
  }

  async function startEmotionPick() {
    endEmotionPick();
    const token = ++emo.token; // новое нажатие отменяет незавершённый поиск
    const btn = emotionButton();
    if (!btn) return;
    const before = visibleClickables();
    clickEl(btn);
    const fresh = () => [...visibleClickables()].filter((el) => !before.has(el) && el !== btn && !el.contains(btn));
    let options = [];
    for (let i = 0; i < 20 && options.length < 2; i++) {
      await sleep(100);
      if (token !== emo.token) return;
      options = pickEmotionGroup(fresh(), btn);
    }
    if (options.length >= 2) {
      await sleep(150); // список мог ещё анимироваться
      if (token !== emo.token) return;
      const settled = pickEmotionGroup(fresh(), btn);
      if (settled.length >= 2) options = settled;
    }
    if (options.length < 2) {
      toast(t('Не нашёл список эмоций — выделите его на странице, и я подстрою поиск'), true);
      return;
    }
    showEmotionBadges(options.slice(0, 9));
  }

  function showEmotionBadges(options) {
    endEmotionPick();
    emo.active = true;
    emo.options = options;
    const layer = document.createElement('div');
    layer.className = 'skq-emo-layer';
    options.forEach((el, i) => {
      const badge = document.createElement('div');
      badge.className = 'skq-emo-badge';
      badge.textContent = String(i + 1);
      layer.appendChild(badge);
    });
    document.body.appendChild(layer);
    emo.layer = layer;
    const place = () => {
      if (!emo.active) return;
      // список закрылся сам (клик мимо и т. п.)
      if (options.every((el) => !el.isConnected || !onScreen(el))) { endEmotionPick(); return; }
      options.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const badge = layer.children[i];
        badge.style.display = el.isConnected && r.width ? '' : 'none';
        badge.style.left = `${r.left - 6}px`;
        badge.style.top = `${r.top - 6}px`;
      });
      emo.raf = requestAnimationFrame(place);
    };
    place();
    emo.timer = setTimeout(endEmotionPick, 15000);
    toast(t('Эмоция: нажмите 1–{n}', { n: options.length }));
  }

  function endEmotionPick() {
    emo.active = false;
    cancelAnimationFrame(emo.raf);
    clearTimeout(emo.timer);
    document.querySelectorAll('.skq-emo-layer').forEach((el) => el.remove());
    emo.layer = null;
    emo.options = [];
  }

  // Клавиши в режиме выбора эмоции; true — клавиша обработана
  function handleEmotionKey(e) {
    if (!emo.active) return false;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(codeOf(e));
    if (m && +m[1] <= emo.options.length && !e.shiftKey) {
      consumeKey(e);
      const el = emo.options[+m[1] - 1];
      endEmotionPick();
      clickEl(el);
      toast(t('Эмоция {n}', { n: m[1] }));
      return true;
    }
    endEmotionPick();
    emo.token++;
    if (codeOf(e) === settings.emotionKey && !e.shiftKey) {
      // повторное нажатие закрывает список
      consumeKey(e);
      clickEl(emotionButton());
      return true;
    }
    return false; // Esc и прочие клавиши — сайту
  }

  // Хоткеи страницы поста; true — клавиша обработана
  function handlePostHotkey(e) {
    if (e.shiftKey) return false;
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(codeOf(e));
    if (digit) {
      const rating = postRating();
      const star = rating && rating.querySelector(`.skq-star[data-skq-n="${digit[1]}"]`);
      if (!star) return false;
      consumeKey(e);
      if (!e.repeat) clickEl(star);
      return true;
    }
    if (codeOf(e) === settings.favKey) {
      const fav = postFav();
      if (!fav) return false;
      consumeKey(e);
      if (!e.repeat) clickEl(fav);
      return true;
    }
    if (codeOf(e) === settings.commentKey) {
      if (!onPostPage() || !(commentEditor() || commentIcon())) return false;
      consumeKey(e);
      if (!e.repeat) openComments();
      return true;
    }
    if (codeOf(e) === settings.emotionKey) {
      if (!onPostPage() || !emotionButton()) return false;
      consumeKey(e);
      if (!e.repeat) startEmotionPick();
      return true;
    }
    return false;
  }

  const ARROWS = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' };

  document.addEventListener('keydown', (e) => {
    if (settingsOpen || e.ctrlKey || e.altKey || e.metaKey) return;
    const node = e.composedPath ? e.composedPath()[0] : e.target; // поля внутри shadow DOM тоже считаем
    if (node instanceof Element && (node.closest('input, textarea, select') || node.isContentEditable)) return;
    if (handleEmotionKey(e)) return;
    // открытый диалог сайта — не мешаем, если только это не сам просмотр поста
    if ([...document.querySelectorAll('[role="dialog"]')].some((d) =>
      !d.closest('.skq-hidden') && !d.querySelector('.skq-rate, .skq-fav'))) return;

    const dir = ARROWS[e.key];
    if (dir) {
      if (e.shiftKey || readerOpen()) return;
      // на странице поста стрелки остаются сайту, пока курсор не на карточке сетки
      if (!kb.mode && !(hoverCard && hoverCard.isConnected) && onPostPage()) return;
      if (move(dir)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }

    if (e.key === 'Escape' && kb.mode) {
      deactivate(null);
      return;
    }

    const card = activeCard();
    if (!card) {
      handlePostHotkey(e);
      return;
    }

    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(codeOf(e));
    if (digit && !e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) keyAction(card, 'vote', +digit[1]);
      return;
    }
    if (codeOf(e) === settings.favKey && !e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) keyAction(card, 'fav');
      return;
    }
    if (e.key === 'Enter' && kb.mode) {
      const a = card.querySelector('a[href]');
      if (a) { e.preventDefault(); a.click(); }
    }
  }, true);

  // Пока ведёт клавиатура, «ховеры» от прокрутки под неподвижным курсором не пускаем к сайту
  for (const type of ['mouseover', 'mouseout', 'pointerover', 'pointerout']) {
    document.addEventListener(type, (e) => {
      if (!e.isTrusted) return;
      if (kb.mode) { e.stopPropagation(); return; }
      if (type === 'mouseover') {
        const card = closestEl(e.target, CARD_SEL);
        if (card) {
          if (card !== hoverCard) {
            cardLeft(hoverCard);
            hoverCard = card;
            scheduleReveal(card, settings.revealHoverMs);
          }
        } else if (!closestEl(e.target, POPPER_SEL) && hoverCard) {
          cardLeft(hoverCard);
          hoverCard = null;
          scheduleReveal(null);
        }
      }
    }, true);
  }

  // На телефоне наведения нет: скрытое превью открывается долгим нажатием,
  // а открыть пост после него мы не даём — иначе жест был бы бесполезен.
  if (!FRAME_MODE) {
    const press = { timer: 0, card: null, x: 0, y: 0, opened: false };
    const pressOff = () => { clearTimeout(press.timer); press.timer = 0; press.card = null; };

    document.addEventListener('pointerdown', (e) => {
      if (!e.isTrusted || e.pointerType === 'mouse' || !TOUCH()) return;
      const card = closestEl(e.target, CARD_SEL);
      if (!card || !isHidden(card)) return;
      Object.assign(press, { card, x: e.clientX, y: e.clientY, opened: false });
      press.timer = setTimeout(() => {
        press.timer = 0;
        press.opened = true;
        reveal(card);
      }, Math.max(300, settings.revealHoverMs));
    }, true);

    document.addEventListener('pointermove', (e) => {
      if (!press.card) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) pressOff();
    }, true);
    for (const type of ['pointerup', 'pointercancel', 'scroll']) {
      document.addEventListener(type, pressOff, true);
    }
    document.addEventListener('click', (e) => {
      if (!press.opened) return;
      press.opened = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  // Реальное движение мыши возвращает управление мыши
  let lastMouse = null;
  document.addEventListener('mousemove', (e) => {
    if (!e.isTrusted) return;
    const moved = !lastMouse || lastMouse.x !== e.screenX || lastMouse.y !== e.screenY;
    lastMouse = { x: e.screenX, y: e.screenY };
    if (!moved || !kb.mode) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const prev = currentCard();
    deactivate(under);
    hoverCard = closestEl(under, CARD_SEL) || (closestEl(under, POPPER_SEL) ? prev : null);
    scheduleReveal(hoverCard, settings.revealHoverMs);
    if (under && !(prev && prev.contains(under)) && !closestEl(under, POPPER_SEL)) fire(under, 'over', null);
  }, true);

  // ---------------------------------------------------------------------------
  // Массовая загрузка.
  // Для каждого файла встраивается настоящая страница «Создать пост» (iframe):
  // рейтинг, теги, Autotag и всё остальное работают средствами самого сайта.
  // ---------------------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- Код внутри встроенной формы ----
  const frameState = { armedAt: 0, done: false, pendingId: null, timer: 0, ids: [] };

  function notifyParent(msg) {
    try { window.parent.postMessage({ skq: true, ...msg }, location.origin); } catch { /* ignore */ }
  }

  const frameArmed = () => frameState.armedAt > 0 && Date.now() - frameState.armedAt < 180000 && !frameState.done;

  function frameArm() {
    frameState.armedAt = Date.now();
    frameState.done = false;
    frameState.pendingId = null;
    frameState.ids = [];
    notifyParent({ type: 'armed' });
  }

  // Ждём немного: создание поста может состоять из нескольких запросов
  function frameSucceeded(id) {
    if (!frameArmed()) return;
    if (id != null && id !== '') frameState.pendingId = String(id);
    // ID уже известен — сообщаем сразу
    if (frameState.pendingId) {
      clearTimeout(frameState.timer);
      frameState.timer = 0;
      frameState.done = true;
      notifyParent({ type: 'created', id: frameState.pendingId });
      return;
    }
    // иначе ждём чуть-чуть, вдруг ID придёт с запоздавшим ответом; повторные признаки успеха
    // (например, плашка сайта висит на экране) это ожидание не перезапускают
    if (frameState.timer) return;
    frameState.timer = setTimeout(() => {
      frameState.timer = 0;
      frameState.done = true;
      notifyParent({ type: 'created', id: frameState.pendingId });
    }, 1200);
  }

  function onMutatingResponse(method, url, status, data) {
    if (!frameArmed()) return;
    let path = '';
    try { path = new URL(url, location.href).pathname; } catch { /* ignore */ }
    if (/vote|favou?rite|auto_?tag|suggest|translat|\/tags?(?:\/|$)|log|metric|analytic|track/i.test(path)) return;
    rememberPostId(data);
    if (status >= 400) {
      clearTimeout(frameState.timer);
      frameState.armedAt = 0;
      const msg = isObj(data) ? data.error || data.message || data.code || '' : '';
      notifyParent({ type: 'failed', status, message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
      return;
    }
    if (status < 200 || status >= 300) return;
    // ответ без тела на создание поста тоже считаем успехом
    if (!isObj(data)) {
      if (method === 'POST' && /\/posts?(?:\/|$)/.test(path)) frameSucceeded(lastPostId());
      return;
    }
    const id = lastPostId();
    if (id != null || data.success === true) frameSucceeded(id);
  }

  // ID поста из любого ответа сайта после нажатия «Создать пост»
  function rememberPostId(data, depth = 0) {
    if (!isObj(data) || depth > 3) return;
    if (Array.isArray(data)) { for (const x of data) rememberPostId(x, depth + 1); return; }
    const id = data.post_id ?? ((looksLikePost(data) || data.md5 || data.file_url) ? data.id : undefined);
    if (id != null && id !== '') frameState.ids.push(String(id));
    for (const k of ['post', 'data', 'result']) if (isObj(data[k])) rememberPostId(data[k], depth + 1);
  }
  const lastPostId = () => frameState.ids[frameState.ids.length - 1];

  // Сайт показывает плашку «Пост успешно загружен» — самый надёжный признак
  const SNACK_SEL = '[class*="MuiSnackbarContent"], [class*="MuiAlert-root"], [class*="MuiSnackbar-root"], [role="alert"]';
  const SUCCESS_RE = /пост.{0,20}(?:успешно\s+)?(?:загружен|создан|опубликован)|successfully\s+(?:uploaded|created|published)|post\s+(?:uploaded|created|published)\s+successfully/i;
  const FAIL_RE = /ошибк|не удалось|уже сущест|дубликат|error|failed|duplicate|invalid/i;

  // MUI помечает плашку классом (…Success / …Error) — это не зависит от языка
  function severityOf(el) {
    const cls = [el, el.parentElement, el.firstElementChild]
      .filter(Boolean)
      .map((n) => (typeof n.className === 'string' ? n.className : ''))
      .join(' ');
    if (/success/i.test(cls)) return 'ok';
    if (/error|danger/i.test(cls)) return 'fail';
    return '';
  }

  function checkSnackbar() {
    if (!frameArmed()) return;
    for (const el of document.querySelectorAll(SNACK_SEL)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 300) continue;
      const severity = severityOf(el);
      if (severity === 'ok' || SUCCESS_RE.test(text)) { frameSucceeded(lastPostId()); return; }
      if (severity === 'fail' || FAIL_RE.test(text)) {
        clearTimeout(frameState.timer);
        frameState.armedAt = 0;
        notifyParent({ type: 'failed', message: text.slice(0, 140) });
        return;
      }
    }
  }

  const CREATE_RE = /созда\S*\s+пост|create\s+post|опубликовать|publish|submit/i;
  // Сайт держит все свои надписи в словаре рядом с состоянием страницы. Берём их
  // оттуда: на голландском кнопка называется «Bericht maken», по словам не найти
  const CREATE_KEYS = ['common-title__create_post', 'common-title__create-new-post'];

  function siteWord(key, win) {
    try {
      const st = (win || W).__PRELOADED_STATE__;
      const store = st && st.initialI18nStore;
      if (!isObj(store)) return '';
      const from = (lang) => (isObj(store[lang]) && isObj(store[lang].translation) ? store[lang].translation[key] : '');
      const found = from(st.initialLanguage) || Object.keys(store).map(from).find(Boolean);
      return typeof found === 'string' ? found : '';
    } catch { return ''; }
  }

  const createWords = (win) => CREATE_KEYS.map((k) => siteWord(k, win)).filter(Boolean).map((w) => w.toLowerCase());
  const btnText = (b) => String((b && (b.textContent || b.value)) || '').replace(/\s+/g, ' ').trim();

  function looksLikeCreate(b, win) {
    const text = btnText(b);
    if (!text) return false;
    return createWords(win).includes(text.toLowerCase()) || CREATE_RE.test(text);
  }

  function initFrameMode() {
    document.documentElement.classList.add('skq-frame');
    document.addEventListener('click', (e) => {
      const b = closestEl(e.target, 'button, [role="button"], input[type="submit"]');
      if (b && (b.type === 'submit' || looksLikeCreate(b, W))) frameArm();
    }, true);
    document.addEventListener('submit', frameArm, true);
    new MutationObserver(checkSnackbar).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(checkSnackbar, 400);
    // после создания сайт может сам перейти на страницу поста
    setInterval(() => {
      if (frameArmed() && !/\/posts\/upload\/?$/.test(location.pathname)) frameSucceeded(idFromHref(location.pathname));
    }, 500);
    // перетаскивание файлов над формой — пусть родитель покажет свою зону
    document.addEventListener('dragenter', (e) => {
      if ([...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files')) notifyParent({ type: 'dragenter' });
    }, true);
  }

  // ---- Страница массовой загрузки ----
  const mass = {
    host: null, root: null, items: [], seq: 0, created: 0, visible: false, uploadPath: null,
    dragTimer: 0, savedTitle: null, titleEl: null,
    grid: false, lastClicked: null, undo: [],
  };
  try { mass.grid = localStorage.getItem('skq:massGrid') === '1'; } catch { /* ignore */ }

  function langPrefix() {
    const m = /^\/([a-z]{2}(?:-[a-z]{2,4})?)(?=\/|$)/i.exec(location.pathname);
    return m ? '/' + m[1] : '';
  }
  const uploadPath = () => mass.uploadPath || langPrefix() + '/posts/upload';

  function injectMassMenuItem() {
    const a = document.querySelector('a[data-test="upload_post"]');
    const li = a && a.closest('li');
    if (!li || !li.parentElement || li.parentElement.querySelector('[data-test="skq_mass_upload"]')) return;
    const clone = li.cloneNode(true);
    clone.querySelectorAll('.Mui-selected, [class*="Mui-selected"]').forEach((n) => n.classList.remove('Mui-selected'));
    const ca = clone.querySelector('a') || clone;
    ca.setAttribute('data-test', 'skq_mass_upload');
    ca.setAttribute('href', a.getAttribute('href') + MASS_HASH);
    const label = clone.querySelector('[class*="MuiListItemText-primary"]') || clone.querySelector('span') || ca;
    label.textContent = t('Массовая загрузка');
    ca.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMass(a.getAttribute('href'));
    });
    li.after(clone);
  }

  function openMass(path) {
    mass.uploadPath = path || uploadPath();
    const target = mass.uploadPath + MASS_HASH;
    if (location.pathname + location.hash !== target) {
      history.pushState(history.state, '', target);
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    }
    // закрываем выезжающее меню сайта
    const backdrop = document.querySelector('[class*="MuiDrawer-modal"] [class*="MuiBackdrop-root"]');
    if (backdrop) backdrop.click();
    syncMassRoute();
  }

  function syncMassRoute() {
    const want = location.hash === MASS_HASH;
    if (want && /\/posts\/upload\/?$/.test(location.pathname)) mass.uploadPath = location.pathname;
    if (want && !mass.visible) showMass();
    else if (!want && mass.visible) hideMass();
    if (mass.visible) { placeMass(); setMassTitle(); refreshTiles(); }
  }

  function placeMass() {
    const bar = document.querySelector('header, [class*="MuiAppBar-root"]');
    const top = bar && !bar.closest('.skq-hidden') ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
    mass.host.style.top = top + 'px';
  }

  function setMassTitle() {
    const title = t('Массовая загрузка');
    if (!mass.savedTitle) mass.savedTitle = document.title;
    if (document.title !== title + ' | Sankaku') document.title = title + ' | Sankaku';
    const bar = document.querySelector('header, [class*="MuiAppBar-root"]');
    if (!bar) return;
    if (mass.titleEl && mass.titleEl.isConnected && mass.titleEl.textContent === title) return;
    const leafs = [...bar.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span')]
      .filter((el) => el.children.length === 0 && el.textContent.trim());
    const target = leafs.find((el) => /^(создать пост|create post|upload)$/i.test(el.textContent.trim())) ||
      leafs.find((el) => /MuiTypography-h[1-6]/i.test(typeof el.className === 'string' ? el.className : '') &&
        el.textContent.trim().length <= 40);
    if (target) {
      mass.titleEl = target;
      target.dataset.skqTitle = target.textContent;
      target.textContent = title;
    }
  }

  function restoreTitle() {
    if (mass.savedTitle) document.title = mass.savedTitle;
    mass.savedTitle = null;
    const el = mass.titleEl;
    if (el && el.isConnected && el.dataset.skqTitle) {
      // сайт мог уже сам сменить заголовок при переходе
      if (el.textContent.trim() === t('Массовая загрузка')) el.textContent = el.dataset.skqTitle;
      delete el.dataset.skqTitle;
    }
    mass.titleEl = null;
  }

  const MASS_CSS = `
    * { box-sizing: border-box; }
    .page { max-width: 1320px; margin: 0 auto; padding: 0 16px 48px; font: 14px/1.4 Roboto, "Segoe UI", Arial, sans-serif; color: #fff; }
    .top {
      position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 14px 0; background: #303030;
    }
    .title { font-size: 20px; font-weight: 500; }
    .stats { flex: 1 1 auto; color: #aaa; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; border: 0;
      background: #484848; color: #fff; font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1.2; text-transform: uppercase;
      letter-spacing: .4px; cursor: pointer; white-space: nowrap;
    }
    .btn:hover { background: #555; }
    .btn:disabled { opacity: .45; cursor: default; }
    .btn:disabled:hover { background: #484848; }
    .btn:focus-visible { outline: 2px solid #ff8c00; outline-offset: 2px; }
    .btn.primary { background: #ff8c00; }
    .btn.primary:hover { background: #ff9d26; }
    .btn.danger { background: #b3261e; }
    .btn.small { padding: 6px 10px; font-size: 13px; text-transform: none; letter-spacing: 0; }
    .btn[hidden] { display: none; }
    .switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; color: #ddd; }
    .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .switch .track { position: relative; width: 34px; height: 18px; border-radius: 9px; background: #666; transition: background .15s; }
    .switch .track::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
      background: #fff; transition: transform .15s;
    }
    .switch input:checked + .track { background: #ff8c00; }
    .switch input:checked + .track::after { transform: translateX(16px); }
    .switch input:focus-visible + .track { outline: 2px solid #ff8c00; outline-offset: 2px; }
    .gridbar { flex: 1 1 100%; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid #444; }
    .gridbar[hidden] { display: none; }
    .selinfo { color: #ccc; margin-right: 4px; }
    .tagform { display: flex; gap: 6px; flex: 1 1 300px; margin: 0; }
    .tagfield { position: relative; flex: 1 1 auto; min-width: 0; display: flex; }
    .taginput {
      flex: 1 1 auto; min-width: 0; padding: 6px 10px; border-radius: 6px; border: 1px solid #555;
      background: #1f1f1f; color: #fff; font: inherit;
    }
    .sugg {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 20; max-height: 40vh; overflow-y: auto;
      padding: 8px 0; border-radius: 4px; background-color: #424242; color: #fff;
      box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
      font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .sugg[hidden] { display: none; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 6px; border: 1px solid #555; background: #3a3a3a; color: #eee; font: inherit; cursor: pointer; }
    .btn:hover { background: #454545; }
    .sopt { position: relative; display: flex; align-items: center; box-sizing: border-box; cursor: pointer; }
    .sopt:hover, .sopt.active { background-color: rgba(255,255,255,.08); }
    .sinner { width: 100%; min-width: 0; }
    .schipcol { display: flex !important; align-items: center; min-width: 0; }
    .schip { min-width: 0; }
    .shist { flex: none; width: 18px; height: 18px; margin-right: 8px; fill: currentColor; opacity: .55; }
    .sname { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sextra { margin-left: auto; flex: none; color: #aaa; font-size: 12px; }
    .sforget {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px;
      border: 0; border-radius: 50%; background: rgba(0,0,0,.55); color: #fff; font-size: 11px; line-height: 22px;
      cursor: pointer; opacity: 0; transition: opacity .1s;
    }
    .sopt.hist:hover .sforget, .sopt.hist.active .sforget { opacity: 1; }
    .sforget:hover { background: #b3261e; }
    .snote { padding: 10px 16px; color: rgba(255,255,255,.7); font-size: 14px; }
    .taginput:focus { outline: 2px solid #ff8c00; outline-offset: 0; border-color: transparent; }
    .drop {
      display: block; border: 2px dashed #666; border-radius: 10px; padding: 36px 16px; margin-bottom: 16px;
      text-align: center; color: #aaa; cursor: pointer; transition: border-color .15s, color .15s;
    }
    .drop:hover { border-color: #ff8c00; color: #ddd; }
    .drop.compact { padding: 14px 16px; }
    .list { position: relative; display: flex; flex-direction: column; gap: 16px; }
    /* перетаскивание плиток */
    .pic { -webkit-user-drag: none; }
    .item.dragged { z-index: 10; transition: none !important; box-shadow: 0 14px 30px rgba(0,0,0,.6); }
    .item.dropping { z-index: 10; transition: transform .15s ease !important; }
    .list.sorting, .list.sorting .tile { cursor: grabbing !important; }
    .list.sorting .tremove { visibility: hidden; }
    .item { background: #3a3a3a; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.3); transition: opacity .25s, transform .25s; }
    .item.leaving { opacity: 0; transform: translateX(40px); }
    .head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #444; }
    .thumb { width: 40px; height: 40px; flex: none; object-fit: cover; border-radius: 4px; background: #262626; }
    .name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .size { color: #999; font-size: 12px; margin-left: 6px; }
    .badge, .tbadge { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; padding: 3px 10px; border-radius: 12px; background: #555; }
    .badge { flex: none; max-width: 45%; }
    .badge.ready, .tbadge.ready { background: #2e7d32; }
    .badge.creating, .tbadge.creating { background: #ff8c00; }
    .badge.error, .badge.failed, .tbadge.error, .tbadge.failed { background: #b3261e; }
    .body { height: 720px; min-height: 360px; resize: vertical; overflow: hidden; }
    .body iframe { display: block; width: 100%; height: 100%; border: 0; background: #303030; }
    .item.is-pending .body { height: auto; min-height: 0; resize: none; }
    .pending { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 18px; color: #aaa; }

    .tile { display: none; }
    .list.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
    .list.grid .head { display: none; }
    /* формы продолжают работать за пределами экрана */
    .list.grid .body { position: fixed; left: -30000px; top: 0; width: 1100px; height: 720px; min-height: 0; resize: none; }
    .list.grid .item.is-pending .body { display: none; }
    .list.grid .item { outline: 3px solid transparent; outline-offset: -3px; transition: outline-color .1s, opacity .25s, transform .25s; }
    .list.grid .item:hover { outline-color: #666; }
    .list.grid .item.selected { outline-color: #ff8c00; }
    .list.grid .tile { display: block; position: relative; cursor: pointer; user-select: none; }
    .pic { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: contain; background: #262626; }
    .check {
      position: absolute; top: 8px; left: 8px; width: 24px; height: 24px; border-radius: 50%;
      border: 2px solid #fff; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center;
      font-size: 14px; line-height: 1; color: transparent; pointer-events: none;
    }
    .item.selected .check { background: #ff8c00; border-color: #ff8c00; color: #fff; }
    .tremove {
      position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border: 0;
      background: rgba(0,0,0,.55); color: #fff; font-size: 13px; cursor: pointer; opacity: 0; transition: opacity .15s;
    }
    .tile:hover .tremove, .tremove:focus-visible { opacity: 1; }
    .tremove:hover { background: #b3261e; }
    .meta { padding: 6px 8px 8px; font-size: 12px; }
    .tname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ddd; }
    .tline { display: flex; align-items: center; gap: 6px; margin-top: 4px; min-width: 0; }
    .tbadge { padding: 1px 8px; font-size: 11px; min-width: 0; }
    .tcount { flex: none; color: #999; }
    .ttags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .ttags:empty { display: none; }
    .tag { padding: 1px 7px; border-radius: 9px; background: #555; color: #eee; font-size: 11px; }
    .tag.applied, .tag.exists { background: #8a6d00; }
    .tag.error { background: #b3261e; }
    .tag.removing { opacity: .5; text-decoration: line-through; }

    a.btn { text-decoration: none; }
    a.btn[hidden] { display: none; }
    /* опубликованный пост: свёрнутая карточка */
    .pubactions { display: none; align-items: center; gap: 6px; flex: none; }
    .item.created .pubactions { display: flex; }
    .badge.created, .tbadge.created { background: #2e7d32; }
    .item.created .head { cursor: pointer; }
    .item.created .body { height: auto; min-height: 0; resize: none; }
    .item.created:not(.expanded) .body { display: none; }
    .toggle { display: inline-block; transition: transform .15s; }
    .item.expanded .toggle { transform: rotate(180deg); }
    .summary { display: flex; gap: 18px; padding: 16px; align-items: flex-start; flex-wrap: wrap; }
    .summary .big { width: 240px; max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 6px; background: #262626; flex: none; }
    .facts { display: grid; grid-template-columns: max-content 1fr; gap: 10px 14px; align-items: center; margin: 0; min-width: 0; flex: 1 1 280px; }
    .facts dt { color: #aaa; }
    .facts dd { margin: 0; min-width: 0; }
    .idline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .postid { font-family: ui-monospace, Consolas, monospace; font-size: 15px; user-select: all; }
    .sumtags { display: flex; flex-wrap: wrap; gap: 6px; }
    .sumtag { padding: 4px 12px; border-radius: 16px; font-size: 13px; font-weight: 700; background: #616161; color: #fff; }
    .sumrating { display: inline-block; min-width: 48px; text-align: center; padding: 2px 12px; border-radius: 14px; font-weight: 700; color: #fff; background: #555; }
    .muted { color: #888; }
    .tpub { display: none; }
    .list.grid .item.created .tile { cursor: default; }
    /* телефон: одна колонка фактов, плитки помельче, кнопки покрупнее.
       Сенсорный экран учитываем до 1000px — планшет тоже, ноутбук нет. */
    @media (max-width: 700px), (hover: none) and (max-width: 1000px) {
      .page { padding: 0 10px 40px; }
      .top { gap: 8px; padding: 10px 0; }
      .title { font-size: 17px; }
      .btn { padding: 10px 14px; }
      .drop { padding: 22px 14px; }
      .head { flex-wrap: wrap; gap: 6px; padding: 8px; }
      .body { height: 75vh; }
      .facts { grid-template-columns: 1fr; gap: 6px; }
      .list.grid { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; }
    }
    .list.grid .item.created .pic { opacity: .35; }
    .list.grid .item.created .check { display: none; }
    .list.grid .item.created .tpub {
      position: absolute; left: 0; right: 0; top: 0; z-index: 1; aspect-ratio: 1 / 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 8px; padding: 10px; text-align: center;
    }
    .tremove { z-index: 2; }
    .tpubtitle { font-weight: 600; color: #7ee07e; }
    .tpub .postid { font-size: 13px; word-break: break-all; }
    .tpub .btn { width: 100%; justify-content: center; white-space: normal; }
    .tag.field { background: #1565c0; }
    .tag.field.pending { background: #555; }
    .tag.field.error { background: #b3261e; }
    .dragover {
      position: fixed; inset: 0; z-index: 10; display: none; align-items: center; justify-content: center;
      background: rgba(255,140,0,.12); border: 3px dashed #ff8c00; font: 500 22px/1.3 Roboto, Arial, sans-serif; color: #fff;
    }
    .dragging .dragover { display: flex; }
    .dragging iframe { pointer-events: none; }
  `;

  const mq = (sel) => mass.root.querySelector(sel);

  function buildMass() {
    const host = document.createElement('div');
    host.id = 'skq-mass';
    host.style.cssText = 'position:fixed;left:0;right:0;bottom:0;top:0;z-index:1050;background:#303030;overflow:auto;display:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${MASS_CSS}</style>
      <div class="wrap">
        <div class="page">
          <div class="top">
            <div class="title">${T('Массовая загрузка')}</div>
            <div class="stats"></div>
            <label class="switch"><input type="checkbox" class="gridtoggle"><span class="track"></span><span>${T('Показать сеткой')}</span></label>
            <button type="button" class="btn clearpub" hidden>${T('Убрать опубликованные')}</button>
            <button type="button" class="btn clear" hidden>${T('Очистить очередь')}</button>
            <button type="button" class="btn primary add">${T('Добавить файлы')}</button>
            <input type="file" class="files" multiple accept="image/*,video/*" hidden>
            <div class="gridbar" hidden>
              <span class="selinfo"></span>
              <button type="button" class="btn small selall">${T('Выделить все')}</button>
              <button type="button" class="btn small selnone">${T('Снять выделение')}</button>
              <form class="tagform" autocomplete="off">
                <div class="tagfield">
                  <input class="taginput" type="text" spellcheck="false" role="combobox"
                    aria-autocomplete="list" aria-expanded="false" aria-controls="skq-sugg"
                    placeholder="${T('Тег для выделенных (несколько — через запятую)')}">
                  <div class="sugg" id="skq-sugg" role="listbox" hidden></div>
                </div>
                <button type="submit" class="btn small addtag">${T('Добавить тег')}</button>
              </form>
              <button type="button" class="btn small undo" disabled>${T('Отменить')}</button>
              <button type="button" class="btn small autotag" hidden>Autotag</button>
              <button type="button" class="btn small book" hidden>${T('ID книги для выделенных')}</button>
              <button type="button" class="btn primary publish" hidden></button>
            </div>
          </div>
          <div class="drop" role="button" tabindex="0">${T('Перетащите сюда изображения и видео или нажмите, чтобы выбрать несколько файлов')}</div>
          <div class="list"></div>
        </div>
        <div class="dragover">${T('Отпустите, чтобы добавить файлы в очередь')}</div>
      </div>`;
    document.body.appendChild(host);
    mass.host = host;
    mass.root = root;

    const input = mq('.files');
    const pick = () => input.click();
    mq('.add').addEventListener('click', pick);
    const drop = mq('.drop');
    drop.addEventListener('click', pick);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    input.addEventListener('change', () => {
      addFiles(input.files);
      input.value = '';
    });
    mq('.clear').addEventListener('click', () => {
      const queue = queuedItems();
      const n = queue.length;
      if (!n) return;
      if (!confirm(t('Убрать из очереди все неопубликованные файлы ({n})? Заполненные формы будут потеряны.', { n }))) return;
      queue.forEach((it) => removeItem(it, true));
    });
    mq('.clearpub').addEventListener('click', () => {
      mass.items.filter((it) => it.created).forEach((it) => removeItem(it, true));
    });

    mq('.gridtoggle').addEventListener('change', (e) => setGrid(e.target.checked));
    mq('.selall').addEventListener('click', () => selectAll(true));
    mq('.selnone').addEventListener('click', () => selectAll(false));
    mq('.tagform').addEventListener('submit', (e) => {
      e.preventDefault();
      const tagInput = mq('.taginput');
      hideSugg();
      releaseProbe();
      if (addTagToSelected(tagInput.value)) {
        tagInput.value = '';
        showRecent();
      }
    });
    initTagSuggestions();
    mq('.undo').addEventListener('click', undoLast);
    mq('.autotag').addEventListener('click', autotagSelected);
    mq('.book').addEventListener('click', askBookForSelected);
    mq('.publish').addEventListener('click', publishSelected);

    setGrid(mass.grid);
  }

  function showMass() {
    if (!document.body) return;
    if (!mass.host) buildMass();
    mass.visible = true;
    mass.host.style.display = 'block';
    placeMass();
    setMassTitle();
    updateMassStats();
  }

  function hideMass() {
    mass.visible = false;
    if (mass.host) mass.host.style.display = 'none';
    hideDrag();
    restoreTitle();
  }

  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' ' + t('МБ') : Math.max(1, Math.round(n / 1024)) + ' ' + t('КБ'));
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };

  function updateMassStats() {
    if (!mass.root) return;
    const n = queuedItems().length;
    const published = mass.items.length - n;
    mq('.stats').textContent = t('В очереди: {n} · Создано: {created}', { n, created: mass.created });
    mq('.clear').hidden = n === 0;
    mq('.clearpub').hidden = published === 0;
    mq('.drop').classList.toggle('compact', mass.items.length > 0);
    updateGridBar();
  }

  function addFiles(fileList) {
    if (!mass.root) return;
    const files = [...(fileList || [])];
    let skipped = 0, dupes = 0, published = 0, added = 0;
    for (const file of files) {
      if (!/^(image|video)\//.test(file.type)) { skipped++; continue; }
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      const same = mass.items.find((it) => it.key === key);
      if (same) { if (same.created) published++; else dupes++; continue; }
      createItem(file, key);
      added++;
    }
    const notes = [];
    if (added) notes.push(t('Добавлено файлов: {n}', { n: added }));
    if (skipped) notes.push(t('пропущено (не изображение/видео): {n}', { n: skipped }));
    if (dupes) notes.push(t('уже в очереди: {n}', { n: dupes }));
    if (published) notes.push(t('уже опубликованы: {n}', { n: published }));
    if (notes.length) toast(notes.join(', '), !added);
    pumpForms();
    updateMassStats();
  }

  function createItem(file, key) {
    const item = {
      id: ++mass.seq, key, file, url: URL.createObjectURL(file),
      el: null, body: null, badge: null, tbadge: null, iframe: null, state: 'pending', armTimer: 0,
      selected: false, formReady: false, settled: null, waiter: null, wantAutotag: false,
      tags: new Map(), syncQueued: false, syncPromise: null, autotagging: false,
      parentId: null, parentState: '', bookId: null, bookState: '', snapshot: null, created: null,
    };
    const media = (cls) => mediaFor(item, cls);

    const el = document.createElement('div');
    el.className = 'item is-pending';
    el.innerHTML = `
      <div class="head">
        <div class="name"></div>
        <span class="badge"></span>
        <span class="pubactions">
          <button type="button" class="btn small copyid">${T('Скопировать ID')}</button>
          <a class="btn small openpost" target="_blank" rel="noopener">${T('Открыть пост ↗')}</a>
          <button type="button" class="btn small expand" title="${T('Развернуть / свернуть')}"><span class="toggle">▾</span></button>
        </span>
        <button type="button" class="btn small reload" title="${T('Подставить файл в форму заново')}" hidden>↻</button>
        <button type="button" class="btn small remove" title="${T('Убрать из очереди')}">✕</button>
      </div>
      <div class="tile" title="${T('Клик — выделить, Shift+клик — диапазон, перетаскивание — изменить порядок, двойной клик — открыть форму')}">
        <div class="check">✓</div>
        <button type="button" class="tremove" title="${T('Убрать из очереди')}">✕</button>
        <div class="tpub">
          <div class="tpubtitle">✓ ${T('Опубликован')}</div>
          <div class="postid"></div>
          <button type="button" class="btn small copyid">${T('Скопировать ID')}</button>
          <button type="button" class="btn small asparent" title="${T('Вписать этот ID в поле «ID родителя» выделенных файлов')}">${T('Родитель для выделенных')}</button>
        </div>
        <div class="meta">
          <div class="tname"></div>
          <div class="tline"><span class="tbadge"></span><span class="tcount"></span></div>
          <div class="ttags"></div>
        </div>
      </div>
      <div class="body"></div>`;
    el.querySelector('.head').prepend(media('thumb'));
    const tile = el.querySelector('.tile');
    const pic = media('pic');
    pic.draggable = false;
    tile.insertBefore(pic, el.querySelector('.meta'));

    const name = el.querySelector('.name');
    name.textContent = file.name;
    name.title = file.name;
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = fmtSize(file.size);
    name.appendChild(size);
    const tname = el.querySelector('.tname');
    tname.textContent = file.name;
    tname.title = `${file.name} · ${fmtSize(file.size)}`;

    item.el = el;
    item.body = el.querySelector('.body');
    item.badge = el.querySelector('.badge');
    item.tbadge = el.querySelector('.tbadge');

    const askRemove = () => {
      if (item.iframe && !confirm(t('Убрать «{name}» из очереди? Заполненная форма будет потеряна.', { name: file.name }))) return;
      removeItem(item, true);
    };
    el.querySelector('.remove').addEventListener('click', askRemove);
    el.querySelector('.tremove').addEventListener('click', (e) => { e.stopPropagation(); askRemove(); });
    el.querySelector('.reload').addEventListener('click', () => {
      if (item.iframe) item.iframe.src = uploadPath() + '#skq-frame';
    });
    tile.addEventListener('click', (e) => onTileClick(item, e));
    tile.addEventListener('dblclick', (e) => {
      if (e.target.closest('button') || justDropped()) return;
      setGrid(false);
      if (item.created) item.el.classList.add('expanded');
      else openForm(item);
      item.el.scrollIntoView({ block: 'start' });
    });
    el.querySelectorAll('.copyid').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      copyPostId(item);
    }));
    el.querySelector('.asparent').addEventListener('click', (e) => {
      e.stopPropagation();
      setParentForSelected(item);
    });
    el.querySelector('.openpost').addEventListener('click', (e) => e.stopPropagation());
    el.querySelector('.expand').addEventListener('click', (e) => {
      e.stopPropagation();
      item.el.classList.toggle('expanded');
    });
    el.querySelector('.head').addEventListener('click', (e) => {
      if (item.created && !e.target.closest('button, a')) item.el.classList.toggle('expanded');
    });

    renderPending(item);
    initTileDrag(item, tile);
    mass.items.push(item);
    el.style.order = String(mass.items.length - 1);
    mq('.list').appendChild(el);
    return item;
  }

  function renderPending(item) {
    const box = document.createElement('div');
    box.className = 'pending';
    box.textContent = t('Форма откроется, когда освободится место');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = t('Открыть сейчас');
    btn.addEventListener('click', () => openForm(item));
    box.appendChild(btn);
    item.body.replaceChildren(box);
    setItemState(item, 'pending');
  }

  const STATE_TEXT = {
    pending: 'В очереди',
    loading: 'Открываю форму…',
    ready: 'Заполните и нажмите «Создать пост»',
    creating: 'Создаю пост…',
    failed: 'Ошибка',
    error: 'Ошибка',
    created: 'Опубликован',
  };
  const TILE_STATE_TEXT = { ready: 'Готов' };

  function setItemState(item, state, message) {
    item.state = state;
    const base = STATE_TEXT[state] ? t(STATE_TEXT[state]) : state;
    const text = message ? `${base}: ${message}` : base;
    item.badge.textContent = text;
    item.badge.title = text;
    item.badge.className = 'badge ' + state;
    const tbase = TILE_STATE_TEXT[state] ? t(TILE_STATE_TEXT[state]) : base;
    item.tbadge.textContent = message ? `${tbase}: ${message}` : tbase;
    item.tbadge.title = text;
    item.tbadge.className = 'tbadge ' + state;
    item.el.classList.toggle('is-pending', state === 'pending');
    item.el.querySelector('.reload').hidden = !item.iframe;
  }

  // Сайт жалуется, если автотег дёргают часто, а он запускается сам при
  // вставке файла. Поэтому формы открываем по одной с паузой.
  const MASS_GAP = 1500;
  let lastFormOpenAt = 0;
  let pumpTimer = 0;

  const openForms = () => mass.items.filter((it) => it.iframe).length;
  const nextForForm = () => mass.items.find((it) => !it.iframe && !it.created) || null;

  // на телефоне каждая форма — целая копия страницы сайта, больше двух не тянет
  const formLimit = () => {
    const limit = Math.max(1, settings.massMaxForms | 0);
    return TOUCH() ? Math.min(2, limit) : limit;
  };

  function pumpForms() {
    if (pumpTimer) return;
    if (openForms() >= formLimit() || !nextForForm()) return;
    const wait = Math.max(0, MASS_GAP - (Date.now() - lastFormOpenAt));
    pumpTimer = setTimeout(() => {
      pumpTimer = 0;
      const item = nextForForm();
      // за время паузы файл могли убрать, а место — занять
      if (item && openForms() < formLimit()) {
        lastFormOpenAt = Date.now();
        openForm(item);
      }
      pumpForms();
    }, wait);
  }

  function openForm(item) {
    if (item.iframe) return;
    const f = document.createElement('iframe');
    f.name = FRAME_PREFIX + item.id;
    f.title = item.file.name;
    f.addEventListener('load', () => injectFile(item, f));
    f.src = uploadPath() + '#skq-frame';
    item.iframe = f;
    item.formReady = false;
    item.body.replaceChildren(f);
    setItemState(item, 'loading');
  }

  function pickFileInput(doc) {
    let best = null, bestScore = -Infinity;
    for (const input of doc.querySelectorAll('input[type="file"]')) {
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      let score = 0;
      if (accept.includes('image')) score += 3;
      if (accept.includes('video')) score += 1;
      if (/audio|vtt|srt|ass|subtit/.test(accept)) score -= 6;
      if (input.closest('[class*="MuiAccordion"], [class*="MuiExpansionPanel"]')) score -= 4;
      if (score > bestScore) { best = input; bestScore = score; }
    }
    return best;
  }

  async function injectFile(item, frame) {
    if (item.iframe !== frame) return;
    item.formReady = false;
    // форма открылась заново — всё добавленное скриптом нужно подставить ещё раз
    for (const [key, entry] of item.tags) {
      if (entry.state === 'removing') item.tags.delete(key);
      else entry.state = 'pending';
    }
    for (const f of FIELD_LIST) if (item[f.key] != null) item[f.state] = 'pending';
    renderTileTags(item);

    let w, doc;
    try {
      w = frame.contentWindow;
      doc = w.document;
      void doc.body;
    } catch {
      setItemState(item, 'error', t('сайт не разрешает встраивать страницу загрузки'));
      return;
    }
    setItemState(item, 'loading');
    let input = null;
    for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
      if (item.iframe !== frame || frame.contentWindow !== w) return;
      input = pickFileInput(doc);
      if (input) break;
      await sleep(300);
    }
    if (!input) {
      setItemState(item, 'error', t('на странице нет поля выбора файла (вы вошли в аккаунт?)'));
      return;
    }
    await sleep(150); // даём React навесить обработчики
    try {
      const dt = new w.DataTransfer();
      dt.items.add(item.file);
      try {
        input.files = dt.files;
        input.dispatchEvent(new w.Event('input', { bubbles: true }));
        input.dispatchEvent(new w.Event('change', { bubbles: true }));
      } catch (e) {
        // запасной путь — «бросаем» файл в зону загрузки
        const zone = input.parentElement || doc.body;
        for (const type of ['dragenter', 'dragover', 'drop']) {
          zone.dispatchEvent(new w.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
      }
      item.formReady = true;
      setItemState(item, 'ready');
      item.settled = afterFormReady(item, frame);
    } catch (e) {
      console.warn('[skq] file injection failed', e);
      setItemState(item, 'error', t('не удалось подставить файл'));
    }
  }

  // Элемент в очереди и ещё не опубликован
  const alive = (item) => !item.created && mass.items.includes(item);
  const queuedItems = () => mass.items.filter((it) => !it.created);

  function mediaFor(item, cls) {
    const isVideo = item.file.type.startsWith('video/');
    const m = document.createElement(isVideo ? 'video' : 'img');
    m.className = cls;
    if (isVideo) { m.muted = true; m.preload = 'metadata'; } else { m.alt = ''; m.decoding = 'async'; }
    m.src = item.url;
    return m;
  }

  function removeItem(item, instant) {
    const idx = mass.items.indexOf(item);
    if (idx < 0) return;
    mass.items.splice(idx, 1);
    clearTimeout(item.armTimer);
    if (item.waiter) item.waiter.resolve(false);
    if (mass.lastClicked === item) mass.lastClicked = null;
    const drop = () => {
      item.el.remove();
      URL.revokeObjectURL(item.url);
    };
    item.iframe = null;
    item.formReady = false;
    if (drag.item === item) cancelDrag();
    if (instant) drop();
    else {
      item.el.classList.add('leaving');
      setTimeout(drop, 260);
    }
    applyOrder();
    pumpForms();
    updateMassStats();
  }

  // Пост опубликован: карточка остаётся свёрнутой, форма закрывается
  function onPostCreated(item, id) {
    mass.created++;
    toast(`✓ ${t('Пост создан')}${id ? ' #' + id : ''}: ${item.file.name}`);
    clearTimeout(item.armTimer);
    const snap = item.snapshot || snapshotForm(item) || {};
    item.created = {
      id: id || null, tags: snap.tags || [], rating: snap.rating || null,
      parent: snap.parent || '', book: snap.book || '', at: Date.now(),
    };
    setSelected(item, false);
    if (mass.lastClicked === item) mass.lastClicked = null;
    // форма больше не нужна — освобождаем место для следующей
    item.iframe = null;
    item.formReady = false;
    item.el.classList.add('created');
    renderCreated(item);
    setItemState(item, 'created', id ? `#${id}` : (t('ID неизвестен')));
    if (item.waiter) item.waiter.resolve(true);
    pumpForms();
    updateMassStats();
  }

  // Что было в форме в момент нажатия «Создать пост»
  function snapshotForm(item) {
    const doc = formDoc(item);
    if (!doc) return null;
    const w = doc.defaultView;
    const tags = [...tagChips(doc).values()].map((chip) => {
      const cs = w.getComputedStyle(chip);
      const label = (chip.querySelector('[class*="MuiChip-label"]') || chip).textContent.replace(/\s+/g, ' ').trim();
      return { label, bg: cs.backgroundColor, color: cs.color };
    });
    const ratingBtn = [...doc.querySelectorAll('button')].find((b) => RATING_RE.test(b.textContent.trim()) && b.style.backgroundColor);
    const value = (field) => {
      const input = findFieldInput(doc, field);
      return input ? input.value.trim() : '';
    };
    return {
      tags,
      rating: ratingBtn ? { text: ratingBtn.textContent.trim(), bg: ratingBtn.style.backgroundColor } : null,
      parent: value(FIELDS.parent),
      book: value(FIELDS.book),
    };
  }

  const postUrl = (id) => `${langPrefix()}/posts/${encodeURIComponent(id)}`;

  // Свёрнутая карточка опубликованного поста и её развёрнутая часть
  function renderCreated(item) {
    const { id, tags, rating, parent, book } = item.created;
    item.el.querySelectorAll('.copyid, .asparent').forEach((b) => { b.disabled = !id; });
    const open = item.el.querySelector('.openpost');
    open.hidden = !id;
    if (id) open.href = postUrl(id);
    item.el.querySelector('.tpub .postid').textContent = id ? `#${id}` : (t('ID неизвестен'));

    const facts = make('dl', 'facts');
    const row = (label, ...content) => {
      facts.appendChild(make('dt', '', null, label));
      const dd = make('dd');
      dd.append(...content);
      facts.appendChild(dd);
    };

    const idLine = make('div', 'idline');
    if (id) {
      const copy = make('button', 'btn small', null, t('Скопировать ID'));
      copy.type = 'button';
      copy.addEventListener('click', () => copyPostId(item));
      const link = make('a', 'btn small', null, t('Открыть пост ↗'));
      link.href = postUrl(id);
      link.target = '_blank';
      link.rel = 'noopener';
      idLine.append(make('span', 'postid', null, id), copy, link);
    } else {
      idLine.appendChild(make('span', 'muted', null,
        t('сайт не сообщил ID — пост можно найти в «Мои посты»')));
    }
    row('ID', idLine);

    if (rating) {
      const r = make('span', 'sumrating', null, rating.text);
      if (rating.bg) r.style.backgroundColor = rating.bg;
      row(t('Рейтинг'), r);
    }
    if (parent) row(t('Родитель'), make('span', 'postid', null, parent));
    if (book) row(t('Книга'), make('span', 'postid', null, book));

    const tagBox = make('div', 'sumtags');
    for (const t of tags) {
      const chip = make('span', 'sumtag', null, t.label);
      if (t.bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(t.bg)) chip.style.backgroundColor = t.bg;
      if (t.color) chip.style.color = t.color;
      tagBox.appendChild(chip);
    }
    if (!tags.length) tagBox.appendChild(make('span', 'muted', null, '—'));
      row(t('Теги ({n})', { n: tags.length }), tagBox);
    row(t('Файл'), make('span', '', null, `${item.file.name} · ${fmtSize(item.file.size)}`));

    const summary = make('div', 'summary');
    summary.append(mediaFor(item, 'big'), facts);
    item.body.replaceChildren(summary);
  }

  async function copyText(text) {
    try {
      // браузер может «зависнуть» на запросе разрешения — не ждём дольше секунды
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ]);
      return true;
    } catch { /* ниже — запасной способ */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }

  function copyPostId(item) {
    const id = item.created && item.created.id;
    if (!id) return;
    copyText(String(id)).then((ok) => toast(ok ? t('ID скопирован: {id}', { id }) : t('Не удалось скопировать ID'), !ok));
  }

  // ---- Поля «ID родителя» и «ID книги» у выделенных файлов ----
  const FIELDS = {
    parent: {
      key: 'parentId', state: 'parentState', input: 'input[name="parent"]',
      label: 'ID родителя', chip: (v) => `↳ #${v}`,
    },
    book: {
      key: 'bookId', state: 'bookState', input: 'input[name="pool_id"]',
      label: 'ID книги', chip: (v) => `📕 #${v}`,
    },
  };
  const FIELD_LIST = Object.values(FIELDS);
  const FIELD_STATE_TEXT = {
    pending: 'ожидает вписывания в форму',
    applied: 'вписан в форму',
    error: 'не нашёл это поле в форме',
  };
  const fieldLabel = (field) => t(field.label);

  const findFieldInput = (doc, field) => doc.querySelector(field.input);

  async function ensureFieldInput(doc, field) {
    let input = findFieldInput(doc, field);
    if (input) return input;
    // поле может появиться только в раскрытом разделе «Продвинутый»
    const header = [...doc.querySelectorAll('p, span, h6, div')].find((el) =>
      el.children.length === 0 && /^(продвинутый|advanced)$/i.test(el.textContent.trim()));
    const toggle = header && (header.closest('[role="button"], button, [class*="MuiAccordionSummary"], [class*="MuiExpansionPanelSummary"]') || header);
    if (!toggle) return null;
    toggle.click();
    for (let i = 0; i < 10 && !input; i++) {
      await sleep(100);
      input = findFieldInput(doc, field);
    }
    return input;
  }

  function syncField(item, field) {
    return queueTagJob(async () => {
      const value = item[field.key];
      if (!alive(item) || value == null) return;
      const doc = formDoc(item);
      if (!doc) return;
      const input = await ensureFieldInput(doc, field);
      if (!input) {
        item[field.state] = 'error';
        renderTileTags(item);
        return;
      }
      const w = doc.defaultView;
      const v = String(value);
      if (input.value !== v) {
        setNativeValue(input, v);
        input.dispatchEvent(new w.Event('change', { bubbles: true }));
        input.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true }));
        await sleep(50);
      }
      item[field.state] = input.value === v ? 'applied' : 'error';
      renderTileTags(item);
    });
  }

  const syncFields = (item) => Promise.all(FIELD_LIST.filter((f) => item[f.key] != null).map((f) => syncField(item, f)));

  function setFieldForSelected(field, value) {
    const items = selectedItems();
    if (!items.length) {
      toast(t('Выделите файлы, которым нужно вписать: {field}', { field: fieldLabel(field) }), true);
      return;
    }
    const action = {
      kind: 'field', field, prev: new Map(),
      label: value ? `${fieldLabel(field)} #${value}` : t('{field}: очистка', { field: fieldLabel(field) }),
    };
    for (const it of items) {
      const doc = formDoc(it);
      const input = doc && findFieldInput(doc, field);
      action.prev.set(it, it[field.key] != null ? it[field.key] : input ? input.value : '');
      it[field.key] = String(value);
      it[field.state] = 'pending';
      renderTileTags(it);
      syncField(it, field);
    }
    pushUndo(action);
    const n = items.length;
    toast(value
      ? t('{field} #{value} → файлов: {n}. Отменить: Ctrl+Z', { field: fieldLabel(field), value, n })
      : t('{field} очищен у файлов: {n}. Отменить: Ctrl+Z', { field: fieldLabel(field), n }));
  }

  function setParentForSelected(source) {
    const id = source.created && source.created.id;
    if (id) setFieldForSelected(FIELDS.parent, id);
  }

  // ID книги вводится вручную: сайт выдаёт его после «Новая книга»
  function askBookForSelected() {
    if (!selectedItems().length) {
      toast(t('Сначала выделите файлы'), true);
      return;
    }
    const fromForm = mass.items.map((it) => {
      const doc = formDoc(it);
      const input = doc && findFieldInput(doc, FIELDS.book);
      return input && input.value.trim();
    }).find(Boolean);
    const value = prompt(t('ID книги для выделенных файлов (пусто — очистить поле)'), fromForm || loadJSON('skq:lastBook', '') || '');
    if (value === null) return;
    const id = value.trim();
    if (id) saveJSON('skq:lastBook', id);
    setFieldForSelected(FIELDS.book, id);
  }

  function pushUndo(action) {
    mass.undo.push(action);
    if (mass.undo.length > 50) mass.undo.shift();
    updateGridBar();
  }

  const undoLabel = (a) => (a.kind === 'field' ? a.label : `«${a.tags.join(', ')}»`);


  // ---- Перетаскивание плиток ----
  // Узлы в DOM не переставляются: перенос iframe перезагрузил бы форму.
  // Порядок задаётся массивом очереди и CSS-свойством order.
  const drag = {
    item: null, pointerId: null, active: false, startX: 0, startY: 0, grabX: 0, grabY: 0,
    x: 0, y: 0, tx: 0, ty: 0, raf: 0, origin: null, droppedAt: 0,
  };
  const justDropped = () => Date.now() - drag.droppedAt < 350;

  function applyOrder() {
    mass.items.forEach((it, i) => { it.el.style.order = String(i); });
  }

  function initTileDrag(item, tile) {
    tile.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch' || !mass.grid || drag.item) return;
      if (e.target.closest('button, a, input')) return;
      const r = item.el.getBoundingClientRect();
      Object.assign(drag, {
        item, pointerId: e.pointerId, active: false,
        startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
        grabX: e.clientX - r.left, grabY: e.clientY - r.top, tx: 0, ty: 0,
      });
      try { tile.setPointerCapture(e.pointerId); } catch { /* без захвата тоже работает, пока курсор над плиткой */ }
    });
    tile.addEventListener('pointermove', (e) => {
      if (drag.item !== item || e.pointerId !== drag.pointerId) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
        startDrag();
      }
      e.preventDefault();
      followPointer();
      reorderAt(e.clientX, e.clientY);
    });
    const finish = (e) => {
      if (drag.item !== item || e.pointerId !== drag.pointerId) return;
      try { if (tile.hasPointerCapture(e.pointerId)) tile.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      endDrag();
    };
    tile.addEventListener('pointerup', finish);
    tile.addEventListener('pointercancel', finish);
  }

  function startDrag() {
    drag.active = true;
    drag.origin = [...mass.items];
    drag.item.el.classList.add('dragged');
    mq('.list').classList.add('sorting');
    drag.raf = requestAnimationFrame(autoScroll);
  }

  // Плитка следует за курсором; положение считаем от её места в раскладке
  function followPointer() {
    const el = drag.item.el;
    const r = el.getBoundingClientRect();
    const baseLeft = r.left - drag.tx;
    const baseTop = r.top - drag.ty;
    drag.tx = drag.x - drag.grabX - baseLeft;
    drag.ty = drag.y - drag.grabY - baseTop;
    el.style.transform = `translate(${drag.tx}px, ${drag.ty}px) scale(1.03)`;
  }

  // Плитка под курсором (по положению в раскладке, без учёта анимаций)
  function itemAt(x, y) {
    const lr = mq('.list').getBoundingClientRect();
    const px = x - lr.left;
    const py = y - lr.top;
    return mass.items.find((it) => {
      const el = it.el;
      return px >= el.offsetLeft && px < el.offsetLeft + el.offsetWidth &&
        py >= el.offsetTop && py < el.offsetTop + el.offsetHeight;
    }) || null;
  }

  function reorderAt(x, y) {
    const target = itemAt(x, y);
    if (!target || target === drag.item) return;
    moveItem(mass.items.indexOf(drag.item), mass.items.indexOf(target));
    followPointer();
  }

  // Перестановка с плавным сдвигом остальных плиток
  function moveItem(from, to) {
    if (from === to || from < 0 || to < 0) return;
    const before = new Map(mass.items.map((it) => [it, [it.el.offsetLeft, it.el.offsetTop]]));
    const [moved] = mass.items.splice(from, 1);
    mass.items.splice(to, 0, moved);
    applyOrder();
    for (const it of mass.items) {
      if (it === drag.item) continue;
      const [ox, oy] = before.get(it);
      const dx = ox - it.el.offsetLeft;
      const dy = oy - it.el.offsetTop;
      if (!dx && !dy) continue;
      const el = it.el;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = 'transform .18s ease';
      el.style.transform = '';
      clearTimeout(el.skqFlip);
      el.skqFlip = setTimeout(() => { el.style.transition = ''; }, 200);
    }
  }

  // Прокрутка, когда плитку подводят к краю
  function autoScroll() {
    if (!drag.active) return;
    const host = mass.host;
    const hr = host.getBoundingClientRect();
    const top = Math.max(hr.top, mq('.top').getBoundingClientRect().bottom);
    const zone = 60;
    let dy = 0;
    if (drag.y < top + zone) dy = -Math.min(24, Math.ceil((top + zone - drag.y) / 3));
    else if (drag.y > hr.bottom - zone) dy = Math.min(24, Math.ceil((drag.y - (hr.bottom - zone)) / 3));
    if (dy) {
      const was = host.scrollTop;
      host.scrollTop += dy;
      if (host.scrollTop !== was) {
        followPointer();
        reorderAt(drag.x, drag.y);
      }
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    const item = drag.item;
    const wasActive = drag.active;
    drag.item = null;
    drag.active = false;
    cancelAnimationFrame(drag.raf);
    if (!item || !wasActive) return;
    drag.droppedAt = Date.now();
    mq('.list').classList.remove('sorting');
    // плавно «кладём» плитку на её новое место
    const el = item.el;
    el.classList.replace('dragged', 'dropping');
    el.style.transform = '';
    setTimeout(() => el.classList.remove('dropping'), 170);
    const from = drag.origin ? drag.origin.indexOf(item) : -1;
    const to = mass.items.indexOf(item);
    drag.origin = null;
    if (from !== to) mass.lastClicked = null;
  }

  function cancelDrag() {
    if (!drag.active) {
      drag.item = null;
      return;
    }
    const origin = drag.origin;
    endDrag();
    if (origin) {
      // возвращаем исходный порядок; удалённые за это время пропускаем, добавленные — в конец
      const keep = origin.filter((it) => mass.items.includes(it));
      const added = mass.items.filter((it) => !origin.includes(it));
      mass.items.splice(0, mass.items.length, ...keep, ...added);
      applyOrder();
    }
  }

  // ---- Сетка и выделение ----
  const selectedItems = () => mass.items.filter((it) => it.selected && !it.created);

  function setGrid(on) {
    mass.grid = !!on;
    try { localStorage.setItem('skq:massGrid', on ? '1' : '0'); } catch { /* ignore */ }
    if (!mass.root) return;
    mq('.list').classList.toggle('grid', mass.grid);
    mq('.gridbar').hidden = !mass.grid;
    mq('.gridtoggle').checked = mass.grid;
    updateGridBar();
    refreshTiles();
  }

  function setSelected(item, value) {
    item.selected = value;
    item.el.classList.toggle('selected', value);
  }

  function selectAll(value) {
    mass.items.forEach((it) => setSelected(it, value && !it.created));
    if (!value) mass.lastClicked = null;
    updateGridBar();
  }

  function onTileClick(item, e) {
    if (justDropped()) return;
    if (item.created) return; // опубликованные не выделяются
    if (e.shiftKey && mass.lastClicked && alive(mass.lastClicked)) {
      const a = mass.items.indexOf(mass.lastClicked);
      const b = mass.items.indexOf(item);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        if (!mass.items[i].created) setSelected(mass.items[i], true);
      }
    } else {
      setSelected(item, !item.selected);
      mass.lastClicked = item;
    }
    updateGridBar();
  }

  const pub = { running: false, stop: false, progress: '' };

  function updateGridBar() {
    if (!mass.root) return;
    const total = queuedItems().length;
    const sel = selectedItems().length;
    mq('.selinfo').textContent = t('Выделено: {sel} из {total}', { sel, total });
    mq('.selall').disabled = total === 0 || sel === total;
    mq('.selnone').disabled = sel === 0;
    mq('.autotag').hidden = sel === 0;
    mq('.book').hidden = sel === 0;
    const last = mass.undo[mass.undo.length - 1];
    const undo = mq('.undo');
    undo.disabled = !last;
    undo.textContent = last ? `${t('Отменить')} ${undoLabel(last)}` : t('Отменить');
    undo.title = last ? 'Ctrl+Z' : '';
    const btn = mq('.publish');
    btn.hidden = sel === 0 && !pub.running;
    btn.classList.toggle('primary', !pub.running);
    btn.classList.toggle('danger', pub.running);
    btn.textContent = pub.running
      ? t('Остановить публикацию ({progress})', { progress: pub.progress })
      : t('Опубликовать выделенные ({n})', { n: sel });
  }

  const TAG_STATE_TEXT = {
    pending: 'ожидает добавления в форму',
    applied: 'добавлен в форму',
    exists: 'уже был в форме',
    error: 'не удалось добавить',
    removing: 'удаляется из формы',
  };

  function renderTileTags(item) {
    const box = item.el.querySelector('.ttags');
    const chips = [...item.tags.values()].map((tg) => {
      const s = document.createElement('span');
      s.className = 'tag ' + tg.state;
      s.textContent = tg.tag;
      s.title = t(TAG_STATE_TEXT[tg.state] || '') + (tg.error ? `: ${tg.error}` : '');
      return s;
    });
    for (const f of FIELD_LIST) {
      const value = item[f.key];
      if (!value) continue;
      const s = document.createElement('span');
      s.className = 'tag field ' + (item[f.state] || 'pending');
      s.textContent = f.chip(value);
      s.title = `${fieldLabel(f)}: ${item[f.state] ? t(FIELD_STATE_TEXT[item[f.state]] || '') : ''}`;
      chips.unshift(s);
    }
    box.replaceChildren(...chips);
  }

  function refreshTiles() {
    if (!mass.root || !mass.grid) return;
    for (const it of mass.items) {
      const doc = formDoc(it);
      const n = doc ? tagChips(doc).size : null;
      it.el.querySelector('.tcount').textContent = n == null ? '' : t('тегов: {n}', { n });
    }
  }

  // ---- Теги в формах сайта ----
  const normTag = (s) => String(s || '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
  // Сайт хранит теги с подчёркиванием, поэтому пробел внутри тега — сразу «_»,
  // а рядом с запятой он вообще не часть тега
  const underscoreTags = (s) => String(s).replace(/\s+/g, '_').replace(/_*([,;])_*/g, '$1').replace(/^_+/, '');

  // Правит уже набранное, сохраняя каретку: длина префикса считается тем же преобразованием
  function forceUnderscores(input) {
    const v = input.value;
    const fixed = underscoreTags(v);
    if (fixed === v) return;
    const pos = input.selectionStart;
    const caret = typeof pos === 'number' ? underscoreTags(v.slice(0, pos)).length : null;
    input.value = fixed;
    if (caret !== null) input.setSelectionRange(caret, caret);
  }

  function formDoc(item) {
    try {
      return item.iframe && item.formReady ? item.iframe.contentWindow.document : null;
    } catch { return null; }
  }

  function findTagInput(doc) {
    const inputs = [...doc.querySelectorAll('input[class*="MuiAutocomplete-input"], input#autocomplete')];
    return inputs.find((i) => /тег|tag/i.test(i.placeholder || '')) || doc.querySelector('input#autocomplete') || inputs[0] || null;
  }

  function tagChips(doc) {
    const map = new Map();
    for (const chip of doc.querySelectorAll('[class*="MuiChip-root"]')) {
      if (chip.closest('[role="listbox"], [role="option"], [class*="MuiAutocomplete-popper"], [class*="MuiAutocomplete-paper"]')) continue;
      const label = chip.querySelector('[class*="MuiChip-label"]') || chip;
      const key = normTag(label.textContent);
      if (key && !map.has(key)) map.set(key, chip);
    }
    return map;
  }

  function setNativeValue(input, value) {
    const w = input.ownerDocument.defaultView;
    Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
  }

  function pressKey(el, key, code, keyCode) {
    const w = el.ownerDocument.defaultView;
    el.dispatchEvent(new w.KeyboardEvent('keydown', { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }));
  }

  function optionMatches(option, key) {
    const full = normTag(option.textContent);
    if (full === key) return true;
    if (option.firstElementChild && normTag(option.firstElementChild.textContent) === key) return true;
    if (normTag(describeOption(option).label) === key) return true;
    // «tag (123)», «tag 1.2k» — отбрасываем счётчик постов
    return full.replace(/\s*[([]?\d[\d\s.,]*[kкm]?[)\]]?$/i, '') === key;
  }

  const isCountText = (text) => /^[\s([]*[\d\s.,]+[kкmмbб]?[\s)\]]*$/i.test(text);
  const RATING_RE = /^(?:g|pg(?:-?13)?|r\d{0,2}\+?|e|q|s|nsfw)$/i;

  // Снимок вычисленных стилей — чтобы нарисовать подсказку так же, как сайт
  const STYLE_GROUPS = {
    box: ['box-sizing', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    border: ['top', 'right', 'bottom', 'left'].flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`])
      .concat(['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius']),
    text: ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
      'text-transform', 'text-align', 'white-space', 'overflow', 'text-overflow'],
    flex: ['display', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content',
      'flex-grow', 'flex-shrink', 'flex-basis', 'max-width', 'min-width'],
  };

  function snapStyle(el, groups, extra = []) {
    if (!el) return null;
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    const out = {};
    for (const p of [...groups.flatMap((g) => STYLE_GROUPS[g]), ...extra]) {
      const v = cs.getPropertyValue(p);
      if (v !== '') out[p] = v;
    }
    return out;
  }

  function applyStyle(el, style) {
    if (style) for (const p in style) el.style.setProperty(p, style[p]);
    return el;
  }

  // Поднимается от el, пока родитель не удовлетворит условию
  function childUnder(el, isStop) {
    while (el.parentElement && !isStop(el.parentElement)) el = el.parentElement;
    return el;
  }

  function textLeaves(root) {
    const leaves = [];
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue.trim();
      if (text) leaves.push({ t: text, el: n.parentElement });
    }
    return leaves;
  }

  // Разбирает подсказку сайта: тег (чип), рейтинг, счётчик постов и их оформление
  function describeOption(option) {
    const chip = option.querySelector('[data-testid="tag-chip"], [class*="MuiChip-root"]');
    return chip ? describeChipOption(option, chip) : describePlainOption(option);
  }

  function describeChipOption(option, chip) {
    const w = option.ownerDocument.defaultView;
    const chipLabel = chip.querySelector('[class*="MuiChip-label"]') || chip;
    const label = chipLabel.textContent.replace(/\s+/g, ' ').trim();
    const outside = textLeaves(option).filter((l) => !chip.contains(l.el));
    const countLeaf = [...outside].reverse().find((l) => isCountText(l.t)) || null;
    const ratingLeaf = outside.find((l) => l !== countLeaf && RATING_RE.test(l.t)) ||
      outside.find((l) => l !== countLeaf) || null;

    // значок рейтинга — ближайший предок текста с рамкой
    let ratingBox = null;
    if (ratingLeaf) {
      for (let n = ratingLeaf.el; n && n !== option; n = n.parentElement) {
        if (parseFloat(w.getComputedStyle(n).borderTopWidth) > 0) { ratingBox = n; break; }
      }
      ratingBox = ratingBox || ratingLeaf.el;
    }
    const metaAnchor = ratingBox || (countLeaf && countLeaf.el);
    const chipCol = childUnder(chip, (p) => p === option || (metaAnchor && p.contains(metaAnchor)));
    const metaCol = metaAnchor ? childUnder(metaAnchor, (p) => p === option || p.contains(chip)) : null;
    const ratingCol = ratingBox && countLeaf ? childUnder(ratingBox, (p) => p === option || p.contains(countLeaf.el)) : ratingBox;
    const countCol = countLeaf && ratingBox ? childUnder(countLeaf.el, (p) => p === option || p.contains(ratingBox)) : countLeaf && countLeaf.el;
    const metaInner = ratingCol && countCol && ratingCol.parentElement === countCol.parentElement &&
      ratingCol.parentElement !== metaCol ? ratingCol.parentElement : null;

    const styles = {
      row: snapStyle(option, ['box', 'text'], ['min-height', 'display', 'align-items']),
      rowInner: chipCol.parentElement && chipCol.parentElement !== option ? snapStyle(chipCol.parentElement, ['flex', 'box']) : null,
      chipCol: snapStyle(chipCol, ['flex', 'box']),
      chip: snapStyle(chip, ['box', 'border', 'text', 'flex'], ['background-color', 'height']),
      chipLabel: chipLabel !== chip ? snapStyle(chipLabel, ['box', 'text']) : null,
      metaCol: snapStyle(metaCol, ['flex', 'box']),
      metaInner: snapStyle(metaInner, ['flex', 'box']),
      ratingCol: ratingCol !== ratingBox ? snapStyle(ratingCol, ['flex', 'box']) : null,
      ratingBox: snapStyle(ratingBox, ['box', 'border', 'flex', 'text'], ['background-color', 'width', 'height']),
      ratingText: ratingLeaf && ratingLeaf.el !== ratingBox ? snapStyle(ratingLeaf.el, ['text'], ['margin-top', 'margin-bottom']) : null,
      countCol: countCol !== (countLeaf && countLeaf.el) ? snapStyle(countCol, ['flex', 'box']) : null,
      count: countLeaf ? snapStyle(countLeaf.el, ['text']) : null,
    };
    return {
      label,
      rating: ratingLeaf ? ratingLeaf.t : '',
      count: countLeaf ? countLeaf.t : '',
      extra: [ratingLeaf && ratingLeaf.t, countLeaf && countLeaf.t].filter(Boolean).join(' '),
      color: styles.chip['background-color'] || '',
      styles,
    };
  }

  function describePlainOption(option) {
    const w = option.ownerDocument.defaultView;
    const leaves = textLeaves(option);
    const first = leaves.find((l) => !isCountText(l.t));
    if (!first) return { label: option.textContent.trim(), extra: '', color: '' };
    // элемент стоит в строке внутри родителя (как подсветка совпадения <b>ca</b>t)
    const inlineIn = (el, parent) =>
      /^inline/.test(w.getComputedStyle(el).display) && !/flex|grid/.test(w.getComputedStyle(parent).display);
    let el = first.el;
    while (el !== option && el.parentElement && el.parentElement !== option && inlineIn(el, el.parentElement)) {
      el = el.parentElement;
    }
    let label, extra, colorEl;
    if (el === option || (el.parentElement === option && inlineIn(el, option))) {
      // весь текст варианта идёт одной строкой — убираем из него только счётчики
      const counts = leaves.filter((l) => isCountText(l.t));
      label = counts.reduce((acc, l) => acc.replace(l.t, ''), option.textContent).replace(/\s+/g, ' ').trim();
      extra = counts.map((l) => l.t).join(' ');
      colorEl = first.el;
    } else {
      label = el.textContent.replace(/\s+/g, ' ').trim();
      extra = leaves.filter((l) => !el.contains(l.el)).map((l) => l.t).join(' ');
      colorEl = el;
    }
    // «tag 1,234» одним текстом — счётчик отделяем
    const tail = /\s+([([]?\d[\d\s.,]*[kкmмbб]?[)\]]?)$/i.exec(label);
    if (tail && tail.index > 0) {
      label = label.slice(0, tail.index);
      extra = [tail[1], extra].filter(Boolean).join(' ');
    }
    let color = '';
    try { color = w.getComputedStyle(colorEl).color; } catch { /* ignore */ }
    return { label, extra, color, row: snapStyle(option, ['box', 'text'], ['min-height']) };
  }

  // Подсказки, которые сайт показал для поля тегов
  function readOptions(doc, input) {
    const id = input.getAttribute('aria-controls') || (input.id ? input.id + '-popup' : '');
    const listbox = (id && doc.getElementById(id)) || null;
    const scope = (listbox && (listbox.closest('[class*="MuiAutocomplete-popper"]') || listbox.parentElement)) || doc;
    const options = [...(listbox || doc).querySelectorAll('[role="option"], li[class*="MuiAutocomplete-option"]')];
    return {
      listbox: listbox || (options[0] && options[0].closest('[role="listbox"], ul')) || null,
      options,
      loading: !!scope.querySelector('[class*="MuiAutocomplete-loading"]'),
      empty: !!scope.querySelector('[class*="MuiAutocomplete-noOptions"]'),
    };
  }

  function removeChip(chip) {
    const del = chip && (chip.querySelector('[class*="MuiChip-deleteIcon"]') || chip.querySelector('svg'));
    if (!del) return false;
    const w = chip.ownerDocument.defaultView;
    del.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  // Enter по тексту в поле формы. Пробел сайт считает концом тега, поэтому
  // многословные теги вводятся только с «_»
  async function enterTag(input, text) {
    if (input.value !== text) setNativeValue(input, text);
    pressKey(input, 'Enter', 'Enter', 13);
    await sleep(400);
  }

  // Убирает всё, что появилось в форме после нашего ввода
  function dropAdded(doc, before) {
    for (const [k, chip] of tagChips(doc)) if (!before.has(k)) removeChip(chip);
  }

  function closeSuggestions(input) {
    if (input.value) setNativeValue(input, '');
    pressKey(input, 'Escape', 'Escape', 27);
  }

  async function addTagInForm(item, tag) {
    const doc = formDoc(item);
    if (!doc) throw new Error(t('форма не готова'));
    const key = normTag(tag);
    const before = tagChips(doc);
    if (before.has(key)) return { state: 'exists' };
    const input = findTagInput(doc);
    if (!input) throw new Error(t('не нашёл поле тегов'));

    // Сайт хранит теги с «_» и ищет подсказки по этому написанию, а показывает
    // их с пробелами. Начинаем с «_», иначе для составного тега подсказок не будет
    const spaced = tag.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    const underscored = spaced.replace(/ /g, '_');
    const variants = [...new Set([underscored, spaced, tag])];
    let res = { opened: false, options: [], option: null };
    let similar = [];
    // сначала без фокуса (чтобы не отбирать ввод у пользователя), затем с фокусом
    for (const withFocus of [false, true]) {
      let opened = false;
      for (const text of variants) {
        res = await suggest(doc, input, text, key, withFocus);
        opened = opened || res.opened;
        if (res.options.length && !similar.length) similar = res.options;
        if (res.option) break; // остальные написания перебираем: по одному сайт молчит
      }
      if (res.option || opened) break;
    }
    const option = res.option;

    const parted = /[\s_]/.test(spaced);
    if (option) {
      try { refreshHistoryStyles([describeOption(option)]); } catch { /* ignore */ }
      option.click();
      await sleep(400);
    } else if (!parted) {
      // тег из одного слова сайт создаёт по Enter — делить там нечего
      await enterTag(input, underscored);
    } else {
      // «alisa_(everlasting_summer)» по Enter превратится в три тега: и пробел,
      // и «_» в поле сайта разделители, составной тег берётся только из подсказок
      closeSuggestions(input);
      if (doc.activeElement === input) input.blur();
      dropAdded(doc, before);
      const near = similar.slice(0, 3).map((o) => o.textContent.trim()).filter(Boolean);
      throw new Error(t('составной тег сайт принимает только из своих подсказок, а такой не предложил')
        + (near.length ? '; ' + t('похожие: {list}', { list: near.join(', ') }) : ''));
    }

    const after = tagChips(doc);
    const added = [...after.keys()].filter((k) => !before.has(k));
    closeSuggestions(input);
    if (doc.activeElement === input) input.blur();

    if (added.includes(key)) {
      // если сайт всё же разбил ввод — лишние теги убираем
      for (const k of added) if (k !== key) removeChip(after.get(k));
      return { state: 'applied', label: key };
    }
    if (option && added.length === 1) return { state: 'applied', label: added[0] }; // сайт подставил своё написание
    if (option && !added.length) return { state: 'exists' };
    // Enter выбрал что-то другое — откатываем
    for (const k of added) removeChip(after.get(k));
    const hint = similar.slice(0, 3).map((o) => o.textContent.trim()).filter(Boolean);
    throw new Error(hint.length ? t('нет такого тега; похожие: {list}', { list: hint.join(', ') }) : t('нет такого тега'));
  }

  // ---- Правый щелчок: тег из формы в буфер и обратно ----
  const CHIP_SEL = '[data-testid="tag-chip"], [class*="MuiChip-root"]';
  // буфер живёт в верхнем окне: у каждой встроенной формы свой экземпляр скрипта
  function tagClip(value) {
    try {
      const top = W.top || W;
      if (value !== undefined) top.__skqTagClip = value;
      return top.__skqTagClip || '';
    } catch { return value === undefined ? '' : value; }
  }

  const chipTag = (chip) => {
    const label = chip.querySelector('[class*="MuiChip-label"]') || chip;
    return normTag(label.textContent).replace(/\s+/g, '_');
  };

  function frameToast(text, isErr) {
    if (!FRAME_MODE) { toast(text, isErr); return; }
    notifyParent({ type: 'toast', message: text, error: !!isErr });
  }

  function onTagContextMenu(e) {
    if (!FRAME_MODE && !mass.visible) return;
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const chip = el.closest(CHIP_SEL);
    if (chip && !chip.closest('[role="option"]')) {
      const tag = chipTag(chip);
      if (!tag) return;
      e.preventDefault();
      tagClip(tag);
      copyText(tag).then((ok) => frameToast(ok ? t('Тег скопирован: {tag}', { tag }) : t('Не удалось скопировать'), !ok));
      return;
    }
    const input = el.closest('input');
    if (!input || input !== findTagInput(input.ownerDocument)) return;
    e.preventDefault();
    pasteTag(input);
  }

  async function pasteTag(input) {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* доступа нет — свой буфер */ }
    const tag = underscoreTags(String(text || '').trim()) || tagClip();
    if (!tag) { frameToast(t('Сначала скопируйте тег правым щелчком'), true); return; }
    input.focus({ preventScroll: true });
    setNativeValue(input, tag);
  }

  document.addEventListener('contextmenu', onTagContextMenu, true);

  // Вводит текст в поле тегов и ждёт подсказки сайта
  async function suggest(doc, input, text, key, withFocus) {
    if (withFocus) input.focus({ preventScroll: true });
    setNativeValue(input, '');
    setNativeValue(input, text);
    let sig = null, since = Date.now(), opened = false, options = [];
    for (const end = Date.now() + (withFocus ? 5000 : 3000); Date.now() < end;) {
      await sleep(150);
      const r = readOptions(doc, input);
      options = r.options;
      const option = options.find((o) => optionMatches(o, key));
      if (option) return { opened: true, options, option };
      const { loading, empty } = r;
      if (options.length || empty) opened = true;
      const s = loading ? null : options.map((o) => o.textContent).join('|') + (empty ? '#empty' : '');
      if (s !== sig) { sig = s; since = Date.now(); }
      else if (opened && s !== null && Date.now() - since > 900) break; // подсказки пришли, точного совпадения нет
    }
    return { opened, options, option: null };
  }

  async function removeTagInForm(item, entry) {
    const doc = formDoc(item);
    if (!doc) return;
    const chip = tagChips(doc).get(normTag(entry.label || entry.tag));
    if (chip && removeChip(chip)) await sleep(250);
  }

  // Все действия с формами выполняются по одному
  let tagChain = Promise.resolve();
  function queueTagJob(fn) {
    const p = tagChain.then(fn);
    tagChain = p.catch(() => {});
    return p;
  }

  function syncTags(item) {
    if (item.syncQueued) return item.syncPromise;
    item.syncQueued = true;
    item.syncPromise = queueTagJob(async () => {
      item.syncQueued = false;
      // во время Autotag не трогаем форму; по его окончании синхронизация запустится снова
      if (!alive(item) || !formDoc(item) || item.autotagging) return;
      const focused = mass.root && mass.root.activeElement;
      try {
        for (const [key, entry] of [...item.tags]) {
          if (!alive(item) || !formDoc(item)) break;
          if (entry.state !== 'pending' && entry.state !== 'removing') continue;
          // форма нужна нам — подсказки для поля ввода берём у другой
          yieldProbe(item);
          item.tagBusy = true;
          try {
            if (entry.state === 'pending') {
              try {
                const r = await addTagInForm(item, entry.tag);
                entry.state = r.state;
                entry.label = r.label || null;
                entry.error = '';
                rememberAccepted(entry.tag);
              } catch (e) {
                entry.state = 'error';
                entry.error = e.message;
              }
              // пока добавляли, действие успели отменить
              if (item.tags.get(key) !== entry && entry.state === 'applied') await removeTagInForm(item, entry);
            } else if (entry.state === 'removing') {
              await removeTagInForm(item, entry);
              if (item.tags.get(key) === entry) item.tags.delete(key);
            }
          } finally {
            item.tagBusy = false;
          }
          renderTileTags(item);
        }
      } finally {
        if (focused && focused.isConnected && focused !== mass.root.activeElement) focused.focus({ preventScroll: true });
        refreshTiles();
      }
    });
    return item.syncPromise;
  }

  async function waitIdle(item, quiet = 1200, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let net = null;
      try { net = item.iframe && item.iframe.contentWindow.__skqNet; } catch { /* ignore */ }
      if (!net) return;
      if (net.inflight === 0 && Date.now() - net.last >= quiet) return;
      await sleep(200);
    }
  }

  async function afterFormReady(item, frame) {
    await waitIdle(item); // загрузка файла, авто-теги сайта
    if (!alive(item) || item.iframe !== frame || !item.formReady) return;
    if (item.wantAutotag) {
      item.wantAutotag = false;
      await runAutotag(item);
    }
    if (item.tags.size) await syncTags(item);
    await syncFields(item);
    refreshTiles();
  }

  // ---- Autotag ----
  const AUTOTAG_RE = /auto\s*-?\s*tag|авто\s*-?\s*тег/i;

  function findAutotagButton(doc) {
    return [...doc.querySelectorAll('button, [role="button"]')].find((b) =>
      AUTOTAG_RE.test(`${b.textContent} ${b.getAttribute('aria-label') || ''} ${b.title || ''}`)) || null;
  }

  // очередь: между запусками автотега выдерживаем ту же паузу
  let autotagQueue = Promise.resolve();
  let lastAutotagAt = 0;

  function autotagTurn() {
    const turn = autotagQueue.then(async () => {
      const wait = MASS_GAP - (Date.now() - lastAutotagAt);
      if (wait > 0) await sleep(wait);
      lastAutotagAt = Date.now();
    });
    autotagQueue = turn.catch(() => {});
    return turn;
  }

  async function runAutotag(item) {
    if (!formDoc(item) || !findAutotagButton(formDoc(item))) return false;
    await autotagTurn();
    const doc = formDoc(item);
    const btn = doc && findAutotagButton(doc);
    if (!btn || isDisabled(btn) || !alive(item)) return false;
    // авто-теги могут заменить список — добавленные нами теги потом проверим заново
    for (const e of item.tags.values()) if (e.state === 'applied' || e.state === 'exists') e.state = 'pending';
    renderTileTags(item);
    item.autotagging = true;
    try {
      btn.click();
      await sleep(300);
      await waitIdle(item, 1500, 60000);
    } finally {
      item.autotagging = false;
    }
    return true;
  }

  function autotagSelected() {
    const items = selectedItems();
    let now = 0, later = 0, missing = 0;
    for (const it of items) {
      const doc = formDoc(it);
      if (!doc) { it.wantAutotag = true; later++; continue; }
      if (!findAutotagButton(doc)) { missing++; continue; }
      now++;
      runAutotag(it).then(() => syncTags(it));
    }
    const parts = [];
    if (now) parts.push(t('запущен для {n}', { n: now }));
    if (later) parts.push(t('{n} — когда откроются формы', { n: later }));
    if (missing) parts.push(t('кнопка не найдена: {n}', { n: missing }));
    toast('Autotag: ' + (parts.join(', ') || t('нечего запускать')), !now && !later);
  }

  // ---- Подсказки для поля «Тег для выделенных» ----
  // Текст вводится в поле тегов одной из скрытых форм, а подсказки сайта
  // показываются под нашим полем в том же оформлении. Недавние теги — сразу, без сервера.
  const sugg = { token: 0, item: null, timer: 0, options: [], active: -1, server: [], query: '', navIntent: 0, enterIntent: false };

  const lastSegment = (v) => v.slice(Math.max(v.lastIndexOf(','), v.lastIndexOf(';')) + 1).trim();

  // ---- История введённых тегов ----
  const HISTORY_KEY = 'skq:tagHistory';
  const LOOK_KEY = 'skq:suggLook';
  const HISTORY_LIMIT = 100;

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  const loadHistory = () => {
    const list = loadJSON(HISTORY_KEY, []);
    return Array.isArray(list) ? list.filter((h) => h && h.key && h.label) : [];
  };
  const saveHistory = (list) => saveJSON(HISTORY_KEY, list.slice(0, HISTORY_LIMIT));
  const bareDesc = (d) => ({ label: d.label, rating: d.rating || '', count: d.count || '', extra: d.extra || '', color: d.color || '', styles: d.styles || null, row: d.row || null });

  function knownDesc(key) {
    return [...sugg.server, ...sugg.options].find((d) => d && d.styles && normTag(d.label) === key) || null;
  }

  function rememberTags(tags, picked) {
    const list = loadHistory();
    for (const tag of [...tags].reverse()) {
      const key = normTag(tag);
      const idx = list.findIndex((h) => h.key === key);
      const prev = idx >= 0 ? list.splice(idx, 1)[0] : null;
      const found = picked && normTag(picked.label) === key ? picked : knownDesc(key);
      const desc = found ? bareDesc(found) : prev ? prev.desc : null;
      list.unshift({ key, label: desc ? desc.label : tag, desc: desc || null, ts: Date.now() });
    }
    saveHistory(list);
  }

  // Тег выбран из подсказок, был в них или уже есть в истории
  function isKnownTag(tag, picked) {
    const key = normTag(tag);
    return (picked && normTag(picked.label) === key) || !!knownDesc(key) || loadHistory().some((h) => h.key === key);
  }

  // Введённый вручную тег попадает в историю, когда сайт его принял
  function rememberAccepted(tag) {
    const list = loadHistory();
    if (list[0] && list[0].key === normTag(tag)) return;
    rememberTags([tag], null);
  }

  // Обновляет оформление (цвет чипа, счётчик) у тегов из истории по свежим подсказкам
  function refreshHistoryStyles(descs) {
    const fresh = descs.filter((d) => d && d.styles);
    if (!fresh.length) return;
    const list = loadHistory();
    let changed = false;
    for (const d of fresh) {
      const h = list.find((x) => x.key === normTag(d.label));
      if (h) { h.desc = bareDesc(d); h.label = d.label; changed = true; }
    }
    if (changed) saveHistory(list);
  }

  function forgetTag(key) {
    saveHistory(loadHistory().filter((h) => h.key !== key));
  }

  // Теги, которые уже есть в поле ввода (кроме последнего, набираемого)
  function usedKeys() {
    const parts = mq('.taginput').value.split(/[,;]/);
    parts.pop();
    return new Set(parts.map(normTag).filter(Boolean));
  }

  function historyMatches(query) {
    const used = usedKeys();
    const list = loadHistory().filter((h) => !used.has(h.key));
    if (!query) return list.slice(0, 15);
    const k = normTag(query);
    const starts = [], contains = [];
    for (const h of list) {
      const n = normTag(h.label);
      if (n.startsWith(k) || h.key.startsWith(k)) starts.push(h);
      else if (k.length > 1 && n.includes(k)) contains.push(h); // по одной букве — только с начала
    }
    return [...starts, ...contains].slice(0, 6);
  }

  // Недавние теги сверху, затем подсказки сервера без повторов
  function composeSugg(query, server) {
    const byKey = new Map((server || []).map((d) => [normTag(d.label), d]));
    const top = historyMatches(query).map((h) => ({ ...(byKey.get(h.key) || h.desc || { label: h.label }), history: true, key: h.key }));
    const seen = new Set(top.map((item) => item.key));
    const rest = (server || []).filter((d) => !seen.has(normTag(d.label)));
    return [...top, ...rest];
  }

  // Внешний вид списка сайта (фон, скругление, тень, отступы) — запоминаем между сессиями
  let suggLook = loadJSON(LOOK_KEY, null);

  function captureLook(listbox, firstOption) {
    if (!listbox) return;
    const paper = listbox.closest('[class*="MuiPaper-root"]') || listbox.parentElement;
    const look = {
      paper: snapStyle(paper, ['border'], ['background-color', 'box-shadow', 'color']),
      listbox: snapStyle(listbox, [], ['padding-top', 'padding-bottom', 'max-height']),
      row: firstOption ? snapStyle(firstOption, ['box', 'text'], ['min-height', 'display', 'align-items']) : null,
      width: paper.getBoundingClientRect().width,
    };
    if (JSON.stringify(look) !== JSON.stringify(suggLook)) {
      suggLook = look;
      saveJSON(LOOK_KEY, look);
    }
  }

  // ---- Опрос скрытой формы ----
  function suggestionSource() {
    const usable = (it) => {
      if (!alive(it) || it.tagBusy || it.autotagging) return false;
      const doc = formDoc(it);
      return !!(doc && findTagInput(doc));
    };
    if (sugg.item && usable(sugg.item)) return sugg.item;
    return mass.items.find(usable) || null;
  }

  // Прекращает опрос и очищает поле в форме-источнике
  function releaseProbe() {
    sugg.token++;
    clearTimeout(sugg.timer);
    const it = sugg.item;
    sugg.item = null;
    if (!it || it.tagBusy) return;
    const doc = formDoc(it);
    const input = doc && findTagInput(doc);
    if (input && input.value) closeSuggestions(input);
  }

  // Форма-источник понадобилась для добавления тегов — продолжаем подсказки на другой
  function yieldProbe(item) {
    if (sugg.item !== item) return;
    releaseProbe();
    const input = mass.root && mq('.taginput');
    const q = input && lastSegment(input.value);
    if (q && mass.root.activeElement === input) sugg.timer = setTimeout(() => probe(q), 60);
  }

  // ---- Отрисовка списка ----
  const HISTORY_ICON = 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z';
  const PLAIN_CHIP = {
    display: 'inline-flex', 'align-items': 'center', height: '32px', 'max-width': '100%', 'box-sizing': 'border-box',
    'border-radius': '16px', 'background-color': '#616161', color: '#fff', 'font-size': '13px', 'font-weight': '500',
    'padding-left': '12px', 'padding-right': '12px', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis',
  };
  const PLAIN_ROW = { 'min-height': '44px', 'padding-top': '6px', 'padding-bottom': '6px', 'padding-left': '16px', 'padding-right': '16px', 'font-size': '16px' };

  const make = (tag, cls, style, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    applyStyle(el, style);
    if (text != null) el.textContent = text;
    return el;
  };

  function historyIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'shist');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', HISTORY_ICON);
    svg.appendChild(path);
    return svg;
  }

  // Строка в оформлении сайта: чип тега | рейтинг | счётчик
  function buildRichRow(row, o) {
    const s = o.styles;
    applyStyle(row, s.row);
    const inner = make('div', 'sinner', s.rowInner);
    const chipCol = make('div', 'schipcol', s.chipCol);
    if (o.history) chipCol.appendChild(historyIcon());
    const chip = make('span', 'schip', s.chip);
    chip.appendChild(make('span', 'schiplabel', s.chipLabel, o.label));
    chipCol.appendChild(chip);
    inner.appendChild(chipCol);
    if (s.metaCol && (o.rating || o.count)) {
      const meta = make('div', 'smeta', s.metaCol);
      const holder = s.metaInner ? meta.appendChild(make('div', 'smetainner', s.metaInner)) : meta;
      if (o.rating && s.ratingBox) {
        const box = make('div', '', s.ratingBox);
        box.appendChild(make('span', '', s.ratingText, o.rating));
        const col = s.ratingCol ? make('div', '', s.ratingCol) : null;
        holder.appendChild(col ? (col.appendChild(box), col) : box);
      }
      if (o.count && s.count) {
        const cnt = make('span', '', s.count, o.count);
        const col = s.countCol ? make('div', '', s.countCol) : null;
        holder.appendChild(col ? (col.appendChild(cnt), col) : cnt);
      }
      inner.appendChild(meta);
    }
    row.appendChild(inner);
  }

  // Тег из истории, для которого сайт ещё не показывал подсказку
  function buildPlainChipRow(row, o) {
    applyStyle(row, (suggLook && suggLook.row) || PLAIN_ROW);
    const col = make('div', 'schipcol');
    col.appendChild(historyIcon());
    col.appendChild(make('span', 'schip', PLAIN_CHIP, o.label));
    row.appendChild(col);
  }

  // Подсказка без чипа (другая разметка сайта)
  function buildTextRow(row, o) {
    applyStyle(row, o.row || PLAIN_ROW);
    if (o.history) row.appendChild(historyIcon());
    const name = make('span', 'sname', null, o.label);
    if (o.color) name.style.color = o.color;
    row.appendChild(name);
    if (o.extra) row.appendChild(make('span', 'sextra', null, o.extra));
  }

  function hideSugg() {
    if (!mass.root) return;
    resetIntents();
    sugg.options = [];
    sugg.active = -1;
    mq('.sugg').hidden = true;
    mq('.sugg').replaceChildren();
    mq('.taginput').setAttribute('aria-expanded', 'false');
  }

  function renderSugg(list, note) {
    const input = mq('.taginput');
    const box = mq('.sugg');
    if (mass.root.activeElement !== input) { hideSugg(); return; }
    const prevLabel = sugg.active >= 0 && sugg.options[sugg.active] ? sugg.options[sugg.active].label : null;
    sugg.options = list;
    sugg.active = prevLabel ? list.findIndex((o) => o.label === prevLabel) : -1;

    if (suggLook) {
      applyStyle(box, suggLook.paper);
      applyStyle(box, suggLook.listbox);
      // колонки считаются в процентах — список не уже, чем на сайте
      box.style.minWidth = suggLook.width ? Math.round(suggLook.width) + 'px' : '';
    }
    const rows = list.map((o, i) => {
      const row = document.createElement('div');
      row.className = 'sopt' + (i === sugg.active ? ' active' : '') + (o.history ? ' hist' : '');
      row.setAttribute('role', 'option');
      row.id = 'skq-sopt-' + i;
      if (o.styles) buildRichRow(row, o);
      else if (o.history && !o.color) buildPlainChipRow(row, o);
      else buildTextRow(row, o);
      if (o.history) {
        const forget = make('button', 'sforget', null, '✕');
        forget.type = 'button';
        forget.tabIndex = -1;
        forget.title = t('Убрать из недавних');
        forget.addEventListener('mousedown', (e) => e.preventDefault());
        forget.addEventListener('click', (e) => {
          e.stopPropagation();
          forgetTag(o.key);
          renderSugg(composeSugg(sugg.query, sugg.server), '');
        });
        row.appendChild(forget);
      }
      row.addEventListener('mousedown', (e) => e.preventDefault()); // фокус остаётся в поле
      row.addEventListener('click', () => pickSuggestion(i));
      return row;
    });
    if (note) rows.push(make('div', 'snote', null, note));
    box.replaceChildren(...rows);
    box.hidden = rows.length === 0;
    input.setAttribute('aria-expanded', String(!box.hidden));
    if (list.length && sugg.navIntent) {
      const n = sugg.navIntent;
      sugg.navIntent = 0;
      highlightSugg(Math.min(n, list.length) - 1);
      if (sugg.enterIntent) {
        sugg.enterIntent = false;
        const index = sugg.active;
        setTimeout(() => pickSuggestion(index), 0);
      }
    }
  }

  function resetIntents() {
    sugg.navIntent = 0;
    sugg.enterIntent = false;
  }

  function highlightSugg(index) {
    const n = sugg.options.length;
    if (!n) return;
    sugg.active = (index + n) % n;
    const rows = mq('.sugg').querySelectorAll('.sopt');
    rows.forEach((r, i) => r.classList.toggle('active', i === sugg.active));
    const row = rows[sugg.active];
    if (row) {
      row.scrollIntoView({ block: 'nearest' });
      mq('.taginput').setAttribute('aria-activedescendant', row.id);
    }
  }

  function pickSuggestion(index) {
    const opt = sugg.options[index];
    if (!opt) return;
    const input = mq('.taginput');
    const v = input.value;
    const cut = Math.max(v.lastIndexOf(','), v.lastIndexOf(';'));
    input.value = underscoreTags((cut >= 0 ? v.slice(0, cut + 1) + ' ' : '') + opt.label);
    hideSugg();
    releaseProbe();
    input.focus();
    if (opt.history) {
      // недавний тег подставляем в поле — его ещё можно поправить
      sugg.query = lastSegment(input.value);
      probe(sugg.query);
      return;
    }
    // подсказка сайта: как на сайте, выбор сразу добавляет тег
    if (addTagToSelected(input.value, opt)) {
      input.value = '';
      showRecent();
    }
  }

  // Пустое поле — показываем недавние теги
  function showRecent() {
    const input = mq('.taginput');
    if (lastSegment(input.value) || mass.root.activeElement !== input) return;
    sugg.query = '';
    sugg.server = [];
    renderSugg(composeSugg('', null), '');
  }

  async function probe(query) {
    const token = ++sugg.token;
    const loadingNote = t('Загрузка…');
    // недавние теги и подходящие прошлые подсказки — сразу, до ответа сервера
    const k = normTag(query);
    const carry = sugg.server.filter((d) => normTag(d.label).includes(k));
    sugg.query = query;
    sugg.server = carry;

    const it = suggestionSource();
    if (!it && mass.items.some((x) => formDoc(x))) {
      // все открытые формы сейчас заняты — пробуем чуть позже
      renderSugg(composeSugg(query, carry), loadingNote);
      sugg.timer = setTimeout(() => { if (token === sugg.token) probe(query); }, 400);
      return;
    }
    if (!it) {
      renderSugg(composeSugg(query, carry), queuedItems().length
        ? (t('Подсказки сайта появятся, когда загрузится хотя бы одна форма'))
        : '');
      return;
    }
    renderSugg(composeSugg(query, carry), loadingNote);

    if (sugg.item && sugg.item !== it) {
      const old = sugg.item;
      sugg.item = null;
      const d = formDoc(old);
      const i = d && findTagInput(d);
      if (i && i.value && !old.tagBusy) closeSuggestions(i);
    }
    sugg.item = it;
    const doc = formDoc(it);
    const input = findTagInput(doc);
    setNativeValue(input, query);

    let sig = null, since = Date.now(), opened = false;
    for (const end = Date.now() + 6000; Date.now() < end;) {
      await sleep(120);
      if (token !== sugg.token) return;
      if (it.tagBusy || !formDoc(it) || input.value !== query) return; // форму заняли — следующий ввод повторит запрос
      const { listbox, options, loading, empty } = readOptions(doc, input);
      if (options.length || empty) opened = true;
      const s = options.map((o) => o.textContent).join('|') + (empty ? '#e' : '') + (loading ? '#l' : '');
      if (s !== sig) {
        sig = s;
        since = Date.now();
        if (opened) {
          captureLook(listbox, options[0]);
          const descs = options.map(describeOption);
          sugg.server = descs;
          refreshHistoryStyles(descs);
          const list = composeSugg(query, descs);
          const note = loading ? loadingNote : list.length ? '' : (t('Нет вариантов'));
          renderSugg(list, note);
        }
      } else if (!loading && opened && Date.now() - since > 1500) {
        break;
      }
    }
    if (token !== sugg.token) return;
    if (!sugg.options.length) resetIntents(); // выбирать нечего
    // сайт так и не показал подсказки — оставляем только недавние
    if (!opened) renderSugg(composeSugg(query, sugg.server), '');
  }

  function initTagSuggestions() {
    const input = mq('.taginput');
    input.addEventListener('input', () => {
      forceUnderscores(input);
      clearTimeout(sugg.timer);
      resetIntents();
      const q = lastSegment(input.value);
      if (!q) {
        releaseProbe();
        showRecent();
        return;
      }
      // недавние — мгновенно, запрос к сайту — после паузы в наборе
      sugg.query = q;
      renderSugg(composeSugg(q, sugg.server.filter((d) => normTag(d.label).includes(normTag(q)))), t('Загрузка…'));
      sugg.timer = setTimeout(() => probe(q), 200);
    });
    input.addEventListener('keydown', (e) => {
      const open = !mq('.sugg').hidden && sugg.options.length > 0;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!open) {
          // подсказки ещё грузятся — запомним, куда пользователь хотел перейти
          if (!mq('.sugg').hidden) { if (e.key === 'ArrowDown') sugg.navIntent++; return; }
          if (lastSegment(input.value)) probe(lastSegment(input.value));
          else showRecent();
          return;
        }
        const step = e.key === 'ArrowDown' ? 1 : -1;
        highlightSugg(sugg.active < 0 ? (step > 0 ? 0 : -1) : sugg.active + step);
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        if (open && sugg.active >= 0) pickSuggestion(sugg.active);
        else if (!open && sugg.navIntent > 0 && !mq('.sugg').hidden) sugg.enterIntent = true; // выберем, когда придут подсказки
        else mq('.tagform').requestSubmit();
      } else if (e.key === 'Escape' && !mq('.sugg').hidden) {
        e.preventDefault();
        e.stopPropagation();
        hideSugg();
        releaseProbe();
      }
    });
    const reopen = () => {
      if (!mq('.sugg').hidden) return;
      if (lastSegment(input.value)) probe(lastSegment(input.value));
      else showRecent();
    };
    input.addEventListener('focus', reopen);
    input.addEventListener('mousedown', () => setTimeout(reopen, 0));
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (mass.root.activeElement === input) return;
        hideSugg();
        releaseProbe();
      }, 150);
    });
  }

  // ---- Общий тег для выделенных и отмена ----
  function addTagToSelected(raw, picked) {
    const tags = [...new Set(String(raw).split(/[,;]/)
      .map((s) => underscoreTags(s.trim()).replace(/^_+|_+$/g, '')).filter(Boolean))];
    if (!tags.length) return false;
    const items = selectedItems();
    if (!items.length) { toast(t('Сначала выделите файлы'), true); return false; }
    const action = { kind: 'tags', tags, added: new Map() };
    for (const it of items) {
      const keys = [];
      for (const tag of tags) {
        const key = normTag(tag);
        const cur = it.tags.get(key);
        if (cur && cur.state !== 'removing' && cur.state !== 'error') continue;
        it.tags.set(key, { tag, state: 'pending', label: null, error: '' });
        keys.push(key);
      }
      if (!keys.length) continue;
      action.added.set(it, keys);
      renderTileTags(it);
      syncTags(it);
    }
    rememberTags(tags.filter((tag) => isKnownTag(tag, picked)), picked);
    if (!action.added.size) {
      toast(t('Эти теги уже добавлены выделенным файлам'));
      return true;
    }
    pushUndo(action);
    const n = action.added.size;
    toast(t('«{tags}» → файлов: {n}. Отменить: Ctrl+Z', { tags: tags.join(', '), n }));
    return true;
  }

  function undoLast() {
    const action = mass.undo.pop();
    if (!action) return;
    let changed = 0, gone = 0;
    if (action.kind === 'field') {
      const field = action.field;
      for (const [it, prev] of action.prev) {
        if (!alive(it)) { gone++; continue; }
        it[field.key] = prev;
        it[field.state] = 'pending';
        renderTileTags(it);
        syncField(it, field).then(() => {
          if (!it[field.key]) { it[field.key] = null; renderTileTags(it); }
        });
      }
      toast(t('Отменено: {label}', { label: action.label }) + (gone ? t('. Уже опубликованные ({n}) не изменены', { n: gone }) : ''));
      updateGridBar();
      return;
    }
    for (const [it, keys] of action.added) {
      if (!alive(it)) { gone++; continue; }
      for (const key of keys) {
        const entry = it.tags.get(key);
        if (!entry) continue;
        if (entry.state === 'applied') entry.state = 'removing';
        else it.tags.delete(key);
      }
      changed++;
      renderTileTags(it);
      syncTags(it);
    }
    toast(t('Отменено: «{tags}»', { tags: action.tags.join(', ') }) +
      (gone ? t('. Уже опубликованные ({n}) не изменены', { n: gone }) : ''));
    updateGridBar();
  }

  // ---- Публикация выделенных ----
  const isDisabled = (b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || /\bMui-disabled\b/.test(b.className);

  async function waitFor(cond, timeout, step = 200) {
    for (const end = Date.now() + timeout; Date.now() < end;) {
      if (cond()) return true;
      await sleep(step);
    }
    return cond();
  }

  function findCreateButton(doc) {
    const all = [...doc.querySelectorAll('button, [role="button"], input[type="submit"]')];
    // сначала по названию из словаря самого сайта — оно точное на любом языке;
    // ключи перебираем по порядку: «создать пост» важнее, чем «создать новый пост»
    for (const key of CREATE_KEYS) {
      const word = siteWord(key, doc.defaultView).toLowerCase();
      const hit = word && all.filter((b) => btnText(b).toLowerCase() === word);
      if (hit && hit.length) return hit[hit.length - 1];
    }
    const named = all.filter((b) => CREATE_RE.test(btnText(b)));
    const exact = named.find((b) => /^(создать пост|create post)$/i.test(btnText(b)));
    if (exact || named.length) return exact || named[0];
    // словаря нет и слова не те — ищем кнопку отправки формы
    const submit = all.find((b) => b.type === 'submit' && !isDisabled(b));
    if (submit) return submit;
    const filled = all.filter((b) => /MuiButton-contained/i.test(typeof b.className === 'string' ? b.className : ''));
    if (filled.length) return filled[filled.length - 1];
    log('create button not found', all.map(btnText));
    return null;
  }

  async function publishOne(item) {
    try {
      if (!item.iframe) openForm(item);
      await waitFor(() => !alive(item) || item.formReady || item.state === 'error', 60000);
      if (!alive(item)) return false;
      if (!item.formReady) throw new Error(item.state === 'error' ? item.badge.title : t('форма не загрузилась'));
      await item.settled;
      await waitFor(() => !item.autotagging, 65000);
      await syncTags(item);
      await syncFields(item);
      await waitIdle(item);
      if (!alive(item)) return false;
      const doc = formDoc(item);
      const btn = doc && findCreateButton(doc);
      if (!btn) throw new Error(t('не нашёл кнопку «Создать пост»'));
      if (isDisabled(btn)) throw new Error(t('кнопка «Создать пост» недоступна — проверьте обязательные поля'));

      const result = new Promise((resolve, reject) => { item.waiter = { resolve, reject }; });
      const waiter = item.waiter;
      const clickedAt = Date.now();
      btn.click();
      (async () => {
        await sleep(6000);
        let net = null;
        try { net = item.iframe && item.iframe.contentWindow.__skqNet; } catch { /* ignore */ }
        if (item.waiter === waiter && net && net.inflight === 0 && net.last < clickedAt) {
          waiter.reject(new Error(t('форма не отправилась — проверьте обязательные поля')));
        }
        await sleep(84000);
        if (item.waiter === waiter) waiter.reject(new Error(t('сайт не ответил за 90 секунд')));
      })();
      return await result;
    } catch (e) {
      if (alive(item)) setItemState(item, 'failed', e.message);
      return false;
    } finally {
      item.waiter = null;
    }
  }

  async function publishSelected() {
    if (pub.running) {
      pub.stop = true;
      toast(t('Остановлю после текущего поста'));
      return;
    }
    const queue = selectedItems();
    if (!queue.length) return;
    pub.running = true;
    pub.stop = false;
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < queue.length && !pub.stop; i++) {
        const item = queue[i];
        if (!alive(item)) continue;
        pub.progress = `${i + 1}/${queue.length}`;
        updateGridBar();
        if (await publishOne(item)) ok++;
        else fail++;
        if (i < queue.length - 1 && !pub.stop) await sleep(2000);
      }
    } finally {
      const stopped = pub.stop;
      pub.running = false;
      pub.stop = false;
      pub.progress = '';
      updateGridBar();
      toast(t('Опубликовано: {ok}', { ok }) + (fail ? t(', с ошибкой: {fail}', { fail }) : '') + (stopped ? t(' (остановлено)') : ''), fail > 0 && ok === 0);
    }
  }

  // ---- Перетаскивание ----
  function showDrag() {
    if (!mass.visible || !mass.root) return;
    mq('.wrap').classList.add('dragging');
    clearTimeout(mass.dragTimer);
    mass.dragTimer = setTimeout(hideDrag, 400);
  }

  function hideDrag() {
    clearTimeout(mass.dragTimer);
    if (mass.root) mq('.wrap').classList.remove('dragging');
  }

  const hasFiles = (e) => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');

  function initMassPage() {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !isObj(e.data) || e.data.skq !== true) return;
      if (e.data.type === 'dragenter') { showDrag(); return; }
      if (e.data.type === 'toast') { toast(String(e.data.message || ''), !!e.data.error); return; }
      const item = mass.items.find((it) => it.iframe && it.iframe.contentWindow === e.source);
      if (!item) return;
      if (e.data.type === 'armed') {
        item.snapshot = snapshotForm(item);
        setItemState(item, 'creating');
        // если сайт не отправил запрос (например, не заполнено обязательное поле) — возвращаем статус
        clearTimeout(item.armTimer);
        item.armTimer = setTimeout(() => { if (item.state === 'creating') setItemState(item, 'ready'); }, 30000);
      } else if (e.data.type === 'failed') {
        const msg = e.data.message || `HTTP ${e.data.status}`;
        setItemState(item, 'failed', msg);
        if (item.waiter) item.waiter.reject(new Error(msg));
      } else if (e.data.type === 'created') {
        onPostCreated(item, e.data.id);
      }
    });

    for (const type of ['dragenter', 'dragover']) {
      window.addEventListener(type, (e) => {
        if (!mass.visible || !hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        showDrag();
      }, true);
    }
    window.addEventListener('drop', (e) => {
      if (!mass.visible || !hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      hideDrag();
      addFiles(e.dataTransfer.files);
    }, true);

    // Горячие клавиши сетки: Ctrl+Z — отмена, Ctrl+A — выделить все, Esc — снять выделение
    window.addEventListener('keydown', (e) => {
      if (!mass.visible || !mass.grid || settingsOpen) return;
      const node = e.composedPath()[0];
      const editable = node instanceof Element && (node.matches('input, textarea, select') || node.isContentEditable);
      const emptyTagInput = node instanceof Element && node.classList.contains('taginput') && !node.value;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyZ' && (!editable || emptyTagInput)) {
        e.preventDefault();
        e.stopPropagation();
        undoLast();
      } else if (mod && !e.altKey && e.code === 'KeyA' && !editable) {
        e.preventDefault();
        e.stopPropagation();
        selectAll(true);
      } else if (e.key === 'Escape' && drag.active) {
        e.preventDefault();
        e.stopPropagation();
        cancelDrag();
      } else if (e.key === 'Escape' && !editable) {
        selectAll(false);
      }
    }, true);

    window.addEventListener('popstate', () => setTimeout(syncMassRoute, 0));
    window.addEventListener('hashchange', syncMassRoute);
    window.addEventListener('resize', () => { if (mass.visible) placeMass(); });
    window.addEventListener('beforeunload', (e) => {
      if (mass.items.some((it) => it.iframe)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  if (FRAME_MODE) initFrameMode();
  else initMassPage();

  // ---------------------------------------------------------------------------
  // Счётчик репутации рядом с кнопкой очков
  // ---------------------------------------------------------------------------
  const POINTS_PATH_RE = /^m12\.5 4-8 13\.177/i;
  const DIAMOND_PATH_RE = /^M9\.686 8\.25/i;
  const REP_KEY_RE = /reput|karma/i;
  // точные имена полей важнее — «reputation_rank» или «reputation_week» это не то
  const REP_EXACT_KEY_RE = /^(?:reputation|reputation_points?|reputation_total|reputation_score|karma)$/i;
  const REP_BAD_KEY_RE = /rank|level|position|place|tier|percent|week|month|day|delta|change|diff|goal|max|next|prev|required/i;
  const ME_MARK_RE = /^(?:вы|you|я|me)$/i;
  const REP_CACHE_KEY = 'skq:reputation';
  const REP_TTL = 5 * 60 * 1000;

  const rep = { value: null, at: 0, userId: null, name: null, source: '', loading: false, debug: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(REP_CACHE_KEY));
    if (saved && typeof saved.value === 'number') {
      Object.assign(rep, { value: saved.value, at: saved.at || 0, userId: saved.userId ?? null, name: saved.name ?? null, source: saved.source || '' });
    }
  } catch { /* ignore */ }

  function setReputation(value, source, force) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    // то, что показано на странице рейтинга, надёжнее любых догадок по ответам,
    // но обновление по кнопке или при открытии панели важнее всего
    if (!force && rep.source === 'dom' && source !== 'dom' && Date.now() - rep.at < REP_TTL) return;
    if (value === rep.value && source === rep.source) return;
    Object.assign(rep, { value, at: Date.now(), source });
    try {
      localStorage.setItem(REP_CACHE_KEY, JSON.stringify({ value, at: rep.at, userId: rep.userId, name: rep.name, source }));
    } catch { /* ignore */ }
    mountReputation();
  }

  // Поле репутации в объекте: сначала точные имена, потом похожие, но без рангов и приростов
  function repFieldValue(obj) {
    const nums = Object.entries(obj).filter(([, v]) => typeof v === 'number');
    const exact = nums.find(([k]) => REP_EXACT_KEY_RE.test(k));
    if (exact) return { key: exact[0], value: exact[1] };
    const loose = nums.find(([k]) => REP_KEY_RE.test(k) && !REP_BAD_KEY_RE.test(k));
    return loose ? { key: loose[0], value: loose[1] } : null;
  }

  const userName = (o) => (typeof o.name === 'string' && o.name) || (typeof o.username === 'string' && o.username) || '';

  function isMe(obj) {
    const name = userName(obj);
    if (rep.name && name && name.toLowerCase() === String(rep.name).toLowerCase()) return true;
    if (rep.userId == null) return false;
    if (obj.user_id != null && String(obj.user_id) === String(rep.userId)) return true;
    // просто «id» бывает номером строки рейтинга — принимаем, только если объект похож на пользователя
    return !!name && String(obj.id) === String(rep.userId);
  }

  // Репутация в ответе про нас самих (/users/me и т. п.)
  function findReputation(data, depth = 0) {
    if (!isObj(data) || depth > 4) return null;
    if (Array.isArray(data)) return null;
    const found = repFieldValue(data);
    if (found) return found.value;
    for (const key of ['user', 'profile', 'stats', 'statistics', 'data', 'result', 'reputation']) {
      if (isObj(data[key])) { const v = findReputation(data[key], depth + 1); if (v != null) return v; }
    }
    return null;
  }

  // Сайт кладёт нашу репутацию в user_reputation — объектом или сразу числом
  function myRepField(node) {
    if (typeof node === 'number' && Number.isFinite(node)) return { key: 'user_reputation', value: node };
    return isObj(node) && !Array.isArray(node) ? repFieldValue(node) : null;
  }

  // Наша запись в любом ответе сайта (например, в списке рейтинга)
  function sniffReputation(data, depth = 0) {
    if (!isObj(data) || depth > 6) return;
    // ответ страницы рейтинга: эта запись про нас, сверять имя и id не нужно
    if (depth === 0 && data.user_reputation !== undefined) {
      const mine = myRepField(data.user_reputation);
      noteRepDebug({
        where: harvestUrl || 'ответ сайта', key: mine ? 'user_reputation.' + mine.key : 'user_reputation: поля нет',
        value: mine ? mine.value : undefined, keys: repKeys(data.user_reputation), mine: true,
      });
      // это прямой ответ сайта про нас — надёжнее, чем число, считанное со страницы
      if (mine) { setReputation(mine.value, 'api', true); return; }
    }
    if (rep.userId == null && !rep.name) return;
    if (Array.isArray(data)) { for (const x of data) sniffReputation(x, depth + 1); return; }
    const found = repFieldValue(data);
    if (found) {
      noteRepDebug({ where: harvestUrl || 'ответ сайта', key: found.key, value: found.value, name: userName(data), id: data.id, userId: data.user_id, mine: isMe(data) });
      if (isMe(data)) { setReputation(found.value, 'api'); return; }
    }
    for (const v of Object.values(data)) if (isObj(v)) sniffReputation(v, depth + 1);
  }

  // Одинаковые записи не копим: иначе повторные осмотры страницы вытесняют ответы сайта
  const repKeys = (o) => (isObj(o) && !Array.isArray(o) ? Object.keys(o).join(', ').slice(0, 300) : typeof o);

  function noteRepDebug(entry) {
    const same = rep.debug.find((d) => d.where === entry.where && d.key === entry.key && d.value === entry.value);
    if (same) {
      same.at = new Date().toISOString();
      same.times = (same.times || 1) + 1;
      return;
    }
    rep.debug.unshift({ ...entry, at: new Date().toISOString() });
    rep.debug.length = Math.min(rep.debug.length, 20);
  }

  // ---- Число со страницы рейтинга ----
  const parseCount = (text) => {
    const m = /(\d[\d\s.,]*)\s*([kкmм])?/i.exec(String(text).replace(/ /g, ' '));
    if (!m) return null;
    const n = parseFloat(m[1].replace(/[\s,]/g, '').replace(/\.(?=\d{3}\b)/g, ''));
    if (!Number.isFinite(n)) return null;
    return /[kк]/i.test(m[2] || '') ? n * 1000 : /[mм]/i.test(m[2] || '') ? n * 1e6 : n;
  };

  const isDiamond = (svg) => {
    const path = svg.querySelector('path');
    return !!path && DIAMOND_PATH_RE.test(path.getAttribute('d') || '');
  };
  const diamondsIn = (el) => [...el.querySelectorAll('svg')].filter(isDiamond).length;

  const rowText = (row) => (row.textContent || '').replace(/\s+/g, ' ').trim();

  // Что последний раз показывала страница: пока это число не изменилось,
  // более свежий ответ сайта важнее — страница могла просто не перерисоваться
  let lastDom = { value: null, at: 0 };

  // Строка рейтинга с пометкой «Вы» или с нашим именем
  function scanReputationDom() {
    if (FRAME_MODE || !document.body) return;
    for (const svg of document.querySelectorAll('svg')) {
      if (!isDiamond(svg)) continue;
      const holder = svg.parentElement;
      if (!holder) continue;
      const value = parseCount(holder.textContent);
      if (value == null) continue;
      let row = holder;
      for (let i = 0; i < 6 && row.parentElement; i++) {
        // поднимаемся только в пределах своей строки
        if (diamondsIn(row.parentElement) > 1) break;
        row = row.parentElement;
        if (!rowIsMine(row)) continue;
        noteRepDebug({ where: 'страница рейтинга', key: 'DOM', value, mine: true, row: rowText(row).slice(0, 120) });
        if (value !== lastDom.value) {
          // первая встреча числа ничего не доказывает: страница могла отрисоваться до ответа сайта
          const first = lastDom.value === null && rep.source === 'api';
          lastDom = { value, at: first ? rep.at : Date.now() };
        }
        if (rep.source === 'api' && rep.at >= lastDom.at) return; // страница ещё со старым числом
        setReputation(value, 'dom');
        return;
      }
    }
  }

  function rowIsMine(row) {
    const text = rowText(row);
    if (!text || text.length > 400) return false;
    if (rep.name && new RegExp(`(^|[^\\w])${escapeRe(rep.name)}([^\\w]|$)`, 'i').test(text)) return true;
    return [...row.querySelectorAll('span, p, div, button')].some((el) =>
      el.children.length === 0 && ME_MARK_RE.test((el.textContent || '').trim()));
  }

  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  async function refreshReputation(force) {
    if (rep.loading || FRAME_MODE) return;
    if (!force && rep.value != null && Date.now() - rep.at < REP_TTL) return;
    rep.loading = true;
    try {
      // /reputation/ranking — тот же запрос, что делает страница рейтинга сайта;
      // репутация в профиле не приходит, поэтому это единственный точный источник
      for (const path of ['/reputation/ranking', '/users/me', '/user/me', '/users/me/reputation']) {
        let data = null;
        try { data = await api('GET', path); } catch (e) {
          log('reputation', path, e.message);
          noteRepDebug({ where: path, key: 'запрос не удался', error: e.message });
          continue;
        }
        if (isObj(data) && data.user_reputation !== undefined) {
          const mine = myRepField(data.user_reputation);
          noteRepDebug({
            where: path, key: mine ? 'user_reputation.' + mine.key : 'user_reputation: поля нет',
            value: mine ? mine.value : undefined, keys: repKeys(data.user_reputation), mine: true,
          });
          if (mine) { setReputation(mine.value, 'api', force); return mine.value; }
          continue;
        }
        const me = isObj(data) && isObj(data.user) ? data.user : data;
        if (isObj(me)) {
          if (me.id != null) rep.userId = me.id;
          if (userName(me)) rep.name = userName(me);
        }
        const found = isObj(me) ? repFieldValue(me) : null;
        if (found) noteRepDebug({ where: path, key: found.key, value: found.value, name: userName(me), id: me.id, mine: true });
        const value = findReputation(data);
        if (value != null) { setReputation(value, 'api', force); return value; }
        noteRepDebug({ where: path, key: '(поля репутации нет)', keys: Object.keys(isObj(me) ? me : {}).slice(0, 40).join(', ') });
      }
    } finally {
      rep.loading = false;
      mountReputation();
    }
    return null;
  }

  // Обновление по кнопке: спрашиваем сайт заново и говорим, что получилось
  async function reloadReputation() {
    if (rep.loading) return;
    const before = rep.value;
    document.querySelectorAll('.skq-rep').forEach((el) => el.classList.add('skq-rep-busy'));
    try {
      await refreshReputation(true);
      scanReputationDom();
    } finally {
      document.querySelectorAll('.skq-rep').forEach((el) => el.classList.remove('skq-rep-busy'));
    }
    if (rep.value == null) {
      toast(t('Репутация: пока не удалось получить — значение появится, когда сайт её пришлёт'), true);
    } else {
      toast(rep.value === before
        ? t('Репутация не изменилась: {n}', { n: rep.value })
        : t('Репутация: {n}', { n: rep.value }));
    }
  }

  // Панель с счётчиком открыли — значение могло устареть, спрашиваем заново
  const REP_OPEN_TTL = 30000;
  let repShownAt = 0;
  let repWatcher = null;

  function watchRepVisibility(badge) {
    if (typeof IntersectionObserver !== 'function') return;
    if (repWatcher) repWatcher.disconnect();
    repWatcher = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (Date.now() - repShownAt < REP_OPEN_TTL) return;
      repShownAt = Date.now();
      refreshReputation(true);
    });
    repWatcher.observe(badge);
  }

  // Данные для разбора, если число всё равно неверное
  function copyReputationDebug() {
    const info = {
      show: rep.value, source: rep.source, at: new Date(rep.at || Date.now()).toISOString(),
      me: { id: rep.userId, name: rep.name }, api: auth.base || null, found: rep.debug,
    };
    const text = JSON.stringify(info, null, 2);
    copyText(text).then((ok) => {
      if (!ok) console.log('[skq] данные о репутации:', text);
      toast(ok ? t('Данные о репутации скопированы — пришлите их мне') : t('Не удалось скопировать — данные выведены в консоль (F12)'), !ok);
    });
  }

  function pointsButton() {
    for (const svg of document.querySelectorAll('button svg, [role="button"] svg')) {
      const d = (svg.querySelector('path') && svg.querySelector('path').getAttribute('d')) || '';
      if (!POINTS_PATH_RE.test(d)) continue;
      const btn = svg.closest('button, [role="button"]');
      if (btn && /\d/.test(btn.textContent || '')) return btn;
    }
    return null;
  }

  function createRepBadge() {
    const badge = document.createElement('span');
    badge.className = 'skq-rep';
    badge.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" fill="none" viewBox="0 0 25 24" aria-hidden="true">
        <path fill="url(#skqDiamond)" d="M9.686 8.25 12.336 3h.3l2.65 5.25zm2.05 11.85L3.111 9.75h8.625zm1.5 0V9.75h8.625zm3.7-11.85L14.336 3h5.15l2.625 5.25zm-14.075 0L5.486 3h5.15l-2.6 5.25z"></path>
        <defs><linearGradient id="skqDiamond" x1="12.486" x2="12.486" y1="3" y2="20.1" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFBCFF"></stop><stop offset=".115" stop-color="#FFB9FF"></stop><stop offset=".36" stop-color="#FFA5FF"></stop>
          <stop offset=".563" stop-color="#FF8BFF"></stop><stop offset=".765" stop-color="#FF9FFF"></stop><stop offset="1" stop-color="#fff"></stop>
        </linearGradient></defs>
      </svg><span class="skq-rep-value"></span>
      <button type="button" class="skq-rep-refresh" tabindex="-1" title="${T('Обновить репутацию')}" aria-label="${T('Обновить репутацию')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"></path></svg>
      </button>`;
    badge.querySelector('.skq-rep-refresh').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      reloadReputation();
    });
    return badge;
  }

  function mountReputation() {
    if (FRAME_MODE || !document.body) return;
    const btn = pointsButton();
    if (btn) btn.classList.toggle('skq-off', !settings.showPoints);
    if (!settings.showReputation) {
      document.querySelectorAll('.skq-rep').forEach((el) => el.remove());
      return;
    }
    if (!btn || !btn.parentElement) return;
    // если кнопка занимает отдельную колонку сетки MUI, встаём соседней колонкой
    const slot = btn.parentElement.matches('[class*="MuiGrid-item"]') && btn.parentElement.children.length === 1
      ? btn.parentElement
      : btn;
    const holder = btn.closest('li') || slot.parentElement;
    let badge = holder.querySelector('.skq-rep');
    if (!badge) {
      badge = createRepBadge();
      slot.after(badge);
      watchRepVisibility(badge);
    }
    const known = rep.value != null;
    badge.querySelector('.skq-rep-value').textContent = known ? String(rep.value) : '—';
    badge.title = known
      ? t('Репутация: {n}', { n: rep.value })
      : t('Репутация: пока не удалось получить — значение появится, когда сайт её пришлёт');
  }

  // ---------------------------------------------------------------------------
  // Окно настроек
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Боковое меню сайта: свои названия, скрытие, счётчики и клавиши перехода.
  // Пункты рендерятся с data-test = ключ пункта из конфигурации сайта, поэтому
  // на них можно опереться на любом языке. Названия берём из словаря сайта.
  // ---------------------------------------------------------------------------
  const SITE_MENU = [
    { key: 'home_page', word: '', fallback: 'Home Page', path: '/homepage' },
    { key: 'post-indexes', word: 'common-title__posts', path: '/', mod: 'ctrl', children: [
      { key: 'upload_post', word: 'common-title__upload_post', path: '/posts/upload' },
      { key: 'menu_browse_all', word: 'common-title__browse_posts', path: '/' },
      { key: 'menu_favorites-posts', word: 'common-title__posts_favorited', path: '/', query: 'tags=fav:{me}', count: 'favPosts' },
      { key: 'my_posts', word: 'common-title__my-posts', path: '/', query: 'tags=user:{me}', count: 'myPosts' },
      { key: 'menu_popular_post', word: 'common-title__popular_posts', path: '/', query: 'tags=order:popularity' },
      { key: 'menu_top_post', word: 'common-title__top_posts', path: '/', query: 'tags=order:quality' },
    ] },
    { key: 'book-indexes', word: 'common-title__books', path: '/books', mod: 'alt', children: [
      { key: 'upload_book', word: 'common-title__upload_book', path: '/books/upload' },
      { key: 'menu_books', word: 'common-title__browse_books', path: '/books' },
      { key: 'menu_favorites-book', word: 'common-title__books_favorited', path: '/books', query: 'tags=fav:{me}', count: 'favBooks' },
      { key: 'my_books', word: 'common-title__my-books', path: '/books', query: 'tags=user:{me}', count: 'myBooks' },
      { key: 'menu_popular_book', word: 'common-title__popular_books', path: '/books', query: 'tags=order:popularity' },
      { key: 'menu_top_book', word: 'common-title__top_books', path: '/books', query: 'tags=order:quality' },
    ] },
    { key: 'ai_companion', word: 'common-title__ai-companion', path: '/ai_companion', children: [
      { key: 'companion_chats', word: 'ai-companion__chats', path: '/ai_companion/empty/empty' },
      { key: 'create_companion', word: ['common-title__add-companion', 'common-title__create'], path: '/companions/add' },
      { key: 'browse_companions', word: 'ai-companion__browse-companions', path: '/ai_companion' },
      { key: 'discover_companions', word: 'common-title__discover', path: '/ai_companion' },
      { key: 'companions_favorited', word: 'common-title__companions_favorited', path: '/ai_companion', query: 'tags=fav:{me}&tab=explore', count: 'favCompanions' },
      { key: 'my_companions', word: 'ai-companion__my-companions', path: '/ai_companion', query: 'tags=user:{me}&tab=explore', count: 'myCompanions' },
      { key: 'companion_library', word: 'common-title__library', path: '/ai_companion', query: 'tags=user:{me}&tab=explore' },
      { key: 'upgraded_companions', word: 'ai-companion__upgraded-companions', path: '/ai_companion', query: 'enabled_feature=true&tab=explore' },
      { key: 'popular_companions', word: 'common-title__popular-companions', path: '/ai_companion', query: 'tags=order:popularity' },
      { key: 'top_companions', word: 'common-title__top-companions', path: '/ai_companion', query: 'tags=order:quality' },
    ] },
    { key: 'ai_art', word: 'common-title__sankaku-ai-creator', path: '/ai/create' },
    { key: 'menu_readings', word: 'common-title__readings-books', path: '/books/reading' },
    { key: 'menu_series', word: 'common-title__series', path: '/series' },
    { key: 'menu_favorite_series', word: 'common-title__series_favorited', path: '/series', query: 'tags=favoritedBy:{me}' },
    { key: 'creators', word: 'common-title__creators', path: '/creators/posts', children: [
      { key: 'creator_dashboard', word: 'common-title__dashboard', path: '/creators/posts' },
      { key: 'creator_memberships', word: 'common-title__memberships', path: '/creators/memberships' },
    ] },
    { key: 'menu_reputation', word: 'common-title__reputation', children: [
      { key: 'reputation_rankings', word: 'common-title__rankings', path: '/reputation', count: 'reputation' },
      { key: 'reputation_achievements', word: 'common-title__achievements', path: '/achievements' },
      { key: 'reputation_privileges', word: 'common-title__privileges', path: '/privileges' },
    ] },
    { key: 'gifts', word: 'common-title__gifts', path: '/gifts' },
    { key: 'collections', word: 'collection__title', path: '/collections', children: [
      { key: 'collections_browse', word: 'collection__browse', path: '/collections' },
      { key: 'collections_favorited', word: 'collection__favorited', path: '/collections/favorited' },
      { key: 'collections_my', word: 'collection__my', path: '/collections/my' },
      { key: 'popular_collections', word: 'common-title__popular-collections', path: '/collections', query: 'tags=order:popularity' },
      { key: 'top_collections', word: 'common-title__top-collections', path: '/collections', query: 'tags=order:quality' },
    ] },
    { key: 'menu_games', word: 'common-title__games', path: '/games' },
    { key: 'menu_ranking', word: 'common-title__ranking', path: '/rankings/books' },
    { key: 'wiki', word: 'common-title__wiki', path: '/wiki', children: [
      { key: 'wiki_create', word: 'common-title__wiki-create' },
      { key: 'wiki_lists', word: 'common-title__tags-listing', path: '/wiki' },
      { key: 'wiki_help', word: 'common-title__help' },
    ] },
    { key: 'history-indexes', word: 'common-title__history', children: [
      { key: 'history-indexes-post-tag', word: 'common-title__post', path: '/posts/changes' },
      { key: 'history-indexes-book', word: 'common-title__book', path: '/books/changes' },
      { key: 'history-indexes-note', word: 'common-title__note' },
      { key: 'history-indexes-tags', word: 'common-title__tag', path: '/tags/changes' },
      { key: 'history-indexes-wiki', word: 'common-title__wiki-history', path: '/wiki/changes' },
    ] },
    { key: 'tag', word: 'common-title__tags', children: [
      { key: 'tag-list', word: 'common-title__tags-listing', path: '/tags' },
      { key: 'tags-translation', word: 'common-title__tags-translation', path: '/tags/translations' },
      { key: 'tags-alias', word: 'common-title__tags-alias', path: '/tags/aliases' },
      { key: 'tags-implication', word: 'common-title__tags-implication', path: '/tags/implications' },
      { key: 'mass-tag-edit', word: 'common-title__mass-tag', path: '/tags/mass_edits' },
    ] },
    { key: 'menu_users', word: 'common-title__users', path: '/users' },
    { key: 'menu_comments', word: 'common-title__comments', path: '/comments' },
    { key: 'referrals', word: 'common-title__referrals', path: '/referrals' },
    { key: 'menu_inbox', word: 'common-title__inbox', path: '/inbox' },
    { key: 'menu_settings', word: 'common-title__settings', path: '/settings' },
  ];

  const MENU_ITEMS = [];
  const MENU_BY_KEY = new Map();
  for (const top of SITE_MENU) {
    MENU_ITEMS.push(top);
    MENU_BY_KEY.set(top.key, top);
    (top.children || []).forEach((child, i) => {
      // по умолчанию подменю «Посты» — Ctrl+n, «Книги» — Alt+n; включать вручную
      child.parentKey = top.key;
      child.defHk = top.mod ? `${top.mod}+Digit${i + 1}` : '';
      MENU_ITEMS.push(child);
      MENU_BY_KEY.set(child.key, child);
    });
  }

  // у некоторых пунктов сайт держит два названия — какое покажет, зависит от режима
  const menuWord = (item) => {
    for (const w of (Array.isArray(item.word) ? item.word : [item.word])) {
      const value = w && siteWord(w);
      if (value) return value;
    }
    return '';
  };

  const menuState = (key) => (isObj(settings.menu) && isObj(settings.menu[key]) ? settings.menu[key] : {});
  const menuName = (key) => String(menuState(key).name || '').trim();
  const menuHidden = (key) => !!menuState(key).off;
  const menuCountOn = (key) => menuState(key).count !== false;
  const menuDefHk = (key) => (MENU_BY_KEY.get(key) || {}).defHk || '';

  function menuHotkey(key) {
    const st = menuState(key);
    if (!st.hkOn) return '';
    return String(st.hk || menuDefHk(key) || '');
  }

  // Счётчики: избранное и загруженное берём из профиля, репутацию — из своего запроса
  const COUNT_FIELDS = {
    favPosts: 'post_favorite_count', myPosts: 'post_upload_count',
    favBooks: 'pool_favorite_count', myBooks: 'pool_upload_count',
    favCompanions: 'companion_favorite_count', myCompanions: 'companion_upload_count',
  };
  const counts = { values: {}, at: 0, loading: false };

  async function refreshCounts(force) {
    if (FRAME_MODE || counts.loading) return;
    if (!force && Date.now() - counts.at < REP_TTL) return;
    counts.loading = true;
    try {
      const data = await api('GET', '/users/me');
      const me = isObj(data) && isObj(data.user) ? data.user : data;
      const next = {};
      for (const id in COUNT_FIELDS) {
        const v = isObj(me) ? me[COUNT_FIELDS[id]] : null;
        if (typeof v === 'number' && Number.isFinite(v)) next[id] = v;
      }
      counts.values = next;
      counts.at = Date.now();
      applySiteMenu();
    } catch (e) {
      log('counters', e.message);
    } finally {
      counts.loading = false;
    }
  }

  const countValue = (id) => (id === 'reputation' ? rep.value : counts.values[id]);

  // Меню открыли — счётчики могли устареть
  let menuVisible = false;
  let menuOpenedAt = 0;
  let menuHeldOpen = false; // меню открыли мы, пока держат Ctrl или Alt

  // Закрытое меню сайт либо убирает из разметки, либо прячет стилями
  function isShown(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.right <= 0 || r.left >= (window.innerWidth || 0)) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity || '1') > 0.05;
  }

  const menuButton = () =>
    document.querySelector('[data-test="hamburger-menu"], [aria-label="Open menu"], header button');

  function toggleSiteMenu() {
    const btn = menuButton();
    if (!btn) return false;
    btn.click();
    return true;
  }

  function setSiteMenu(open) {
    if (!!menuVisible === !!open) return true;
    return toggleSiteMenu(); // у сайта одна кнопка-переключатель
  }

  function onMenuOpened() {
    if (Date.now() - menuOpenedAt < REP_OPEN_TTL) return;
    menuOpenedAt = Date.now();
    refreshCounts(true);
    refreshReputation(true);
  }

  const menuTextEl = (el) =>
    el.querySelector('[class*="MuiListItemText-primary"]')
    || el.querySelector('[class*="MuiListItemText"] p, [class*="MuiListItemText"] span')
    || null;

  function menuCounterEl(el) {
    let badge = el.querySelector(':scope > .skq-mcount');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'skq-mcount';
      el.appendChild(badge);
    }
    return badge;
  }

  function applySiteMenu() {
    if (FRAME_MODE || !document.body) return;
    let seen = 0;
    let shownItems = 0;
    for (const el of document.querySelectorAll('[data-test]')) {
      const key = el.getAttribute('data-test');
      const cfg = MENU_BY_KEY.get(key);
      if (!cfg) continue;
      if (!el.closest('nav, [class*="MuiDrawer"], [class*="MuiList-root"]')) continue;
      seen++;
      if (!shownItems && isShown(el)) shownItems++;
      el.classList.toggle('skq-menu-off', menuHidden(key));
      const textEl = menuTextEl(el);
      if (textEl) {
        if (!textEl.dataset.skqOrig) textEl.dataset.skqOrig = (textEl.textContent || '').trim();
        const want = menuName(key) || textEl.dataset.skqOrig;
        if ((textEl.textContent || '').trim() !== want) textEl.textContent = want;
      }
      if (cfg.count) {
        const value = menuCountOn(key) ? countValue(cfg.count) : null;
        const badge = menuCounterEl(el);
        const text = typeof value === 'number' ? shortCount(value) : '';
        if (badge.textContent !== text) badge.textContent = text;
      }
    }
    const open = seen > 0 && shownItems > 0;
    if (open && !menuVisible) onMenuOpened();
    menuVisible = open;
    applyMenuTitles();
  }

  // Переименованный пункт меняет и заголовок своей страницы
  function renamedTitles() {
    const map = new Map();
    for (const item of MENU_ITEMS) {
      const name = menuName(item.key);
      if (!name || !item.word) continue;
      const orig = menuWord(item);
      if (orig && orig !== name) map.set(orig, name);
    }
    return map;
  }

  function applyMenuTitles() {
    const holder = document.getElementById('portal-title');
    if (!holder || titleEdit.on) return;
    const renamed = renamedTitles();
    const own = isObj(settings.titles) ? settings.titles : {};
    for (const el of holder.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span')) {
      if (el.children.length) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      // Исходное название запоминаем: по нему ищется пункт меню и к нему же
      // возвращаемся. Заодно помним, что написали сами, — если текст сменил
      // сайт (открыли другую страницу), наши пометки больше не про него
      const saved = el.dataset.skqTitle;
      const ours = !!saved && el.dataset.skqShown === text;
      const orig = ours ? saved : text;
      const want = renamed.get(orig) || own[orig] || '';
      if (want) {
        if (text !== want) el.textContent = want;
        el.dataset.skqTitle = orig;
        el.dataset.skqShown = want;
      } else {
        if (ours && text !== orig) el.textContent = orig;
        if (saved) { delete el.dataset.skqTitle; delete el.dataset.skqShown; }
      }
    }
  }

  // ---- Правка заголовка прямо на странице ----
  const titleEdit = { on: false, box: null, el: null, orig: '' };

  const titleNodes = () => {
    const holder = document.getElementById('portal-title');
    return holder ? [...holder.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((el) => !el.children.length) : [];
  };

  function titleKeyFor(orig) {
    for (const item of MENU_ITEMS) if (menuWord(item) === orig) return item.key;
    return '';
  }

  function markTitles() {
    if (FRAME_MODE) return;
    for (const el of titleNodes()) {
      if (!el.classList.contains('skq-title')) {
        el.classList.add('skq-title');
        el.title = t('Редактировать');
        el.addEventListener('click', () => startTitleEdit(el));
      }
      el.classList.toggle('skq-hidden-title', titleEdit.on && titleEdit.el === el);
    }
    if (titleEdit.on && titleEdit.box && !titleEdit.box.isConnected) stopTitleEdit();
  }

  function stopTitleEdit() {
    if (titleEdit.box) titleEdit.box.remove();
    if (titleEdit.el) titleEdit.el.classList.remove('skq-hidden-title');
    Object.assign(titleEdit, { on: false, box: null, el: null, orig: '' });
    scheduleScan();
  }

  function startTitleEdit(el) {
    if (titleEdit.on) return;
    const shown = (el.textContent || '').trim();
    const orig = el.dataset.skqTitle || shown;
    const box = document.createElement('span');
    box.className = 'skq-title-edit';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = shown;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'skq-title-btn skq-title-ok';
    ok.title = t('Сохранить');
    ok.textContent = '✓';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'skq-title-btn skq-title-cancel';
    no.title = t('Отмена');
    no.textContent = '✕';
    box.append(input, ok, no);
    el.after(box);
    Object.assign(titleEdit, { on: true, box, el, orig });
    el.classList.add('skq-hidden-title');

    const sync = () => box.classList.toggle('changed', input.value.trim() !== shown);
    input.addEventListener('input', sync);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { e.preventDefault(); stopTitleEdit(); }
    });
    ok.addEventListener('click', save);
    no.addEventListener('click', stopTitleEdit);
    input.focus();
    input.select();
    sync();

    function save() {
      const value = input.value.trim();
      stopTitleEdit();
      saveTitleName(orig, value);
    }
  }

  // Сохранение: у пункта меню меняется название, у прочих заголовков — своя запись
  function saveTitleName(orig, value) {
    const key = titleKeyFor(orig);
    if (key) {
      const menu = { ...(isObj(settings.menu) ? settings.menu : {}) };
      const item = { ...(isObj(menu[key]) ? menu[key] : {}) };
      if (value && value !== orig) item.name = value;
      else delete item.name;
      if (Object.keys(item).length) menu[key] = item;
      else delete menu[key];
      saveSettings({ menu });
    } else {
      const titles = { ...(isObj(settings.titles) ? settings.titles : {}) };
      if (value && value !== orig) titles[orig] = value;
      else delete titles[orig];
      saveSettings({ titles });
    }
    toast(value && value !== orig ? t('Заголовок изменён: {name}', { name: value }) : t('Название вернулось к исходному'));
  }

  // ---- Клавиши перехода ----
  const comboOf = (e) => `${e.ctrlKey ? 'ctrl+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${e.metaKey ? 'meta+' : ''}${e.code}`;
  const comboLabel = (combo) => {
    if (!combo) return '—';
    const parts = String(combo).split('+');
    const code = parts.pop();
    const mods = parts.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
    return [...mods, keyLabel(code)].join('+');
  };

  function menuUrl(cfg) {
    if (!cfg || !cfg.path) return '';
    let query = cfg.query || '';
    if (query.includes('{me}')) {
      if (!rep.name) return '';
      query = query.replace('{me}', encodeURIComponent(rep.name));
    }
    return location.origin + langPrefix() + cfg.path + (query ? '?' + query : '');
  }

  function goToMenuItem(key) {
    menuHeldOpen = false;
    const link = [...document.querySelectorAll('[data-test]')].find((el) =>
      el.getAttribute('data-test') === key && el.closest('nav, [class*="MuiDrawer"], [class*="MuiList-root"]'));
    if (link) { link.click(); return true; } // меню открыто — пусть сайт сам переходит
    const url = menuUrl(MENU_BY_KEY.get(key));
    if (!url) return false;
    location.assign(url);
    return true;
  }

  const HOLD_KEYS = { Control: 1, Alt: 1 };

  document.addEventListener('keydown', (e) => {
    if (FRAME_MODE || settingsOpen) return;
    const node = e.composedPath ? e.composedPath()[0] : e.target;
    if (node instanceof Element && (node.closest('input, textarea, select') || node.isContentEditable)) return;

    // меню показывается, пока держат Ctrl или Alt — чтобы видеть, что под какой цифрой
    if (settings.menuHoldMod && HOLD_KEYS[e.key] && !e.repeat && !menuVisible && !menuHeldOpen) {
      menuHeldOpen = toggleSiteMenu();
      return;
    }

    const combo = comboOf(e);
    if (settings.menuKeyOn && combo && combo === (settings.menuKey || DEFAULTS.menuKey)) {
      e.preventDefault();
      e.stopPropagation();
      menuHeldOpen = false;
      toggleSiteMenu();
      return;
    }
    if (!(e.ctrlKey || e.altKey || e.metaKey)) return;
    const item = MENU_ITEMS.find((it) => menuHotkey(it.key) === combo);
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    if (!goToMenuItem(item.key)) toast(t('Не знаю, куда вести этот пункт — откройте меню'), true);
  }, true);

  function releaseHeldMenu() {
    if (!menuHeldOpen) return;
    menuHeldOpen = false;
    setSiteMenu(false);
  }

  document.addEventListener('keyup', (e) => {
    if (HOLD_KEYS[e.key]) releaseHeldMenu();
  }, true);
  // Alt+Tab и переход по клавише уводят фокус, а клавишу отпускают уже не здесь
  window.addEventListener('blur', releaseHeldMenu);

  const HOTKEYS = [
    { id: 'favKey', label: 'Добавить в избранное / убрать' },
    { id: 'commentKey', label: 'Комментарии (на странице поста)' },
    { id: 'emotionKey', label: 'Эмоция (на странице поста), затем 1–6' },
  ];
  const hotkeyLabel = (h) => t(h.label);
  const RESERVED_KEY_RE = /^(?:Arrow\w+|Digit[1-5]|Numpad[1-5]|Enter|NumpadEnter|Escape|Tab|Space|(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?|CapsLock|ContextMenu)$/;
  let settingsOpen = false;

  function keyLabel(code) {
    if (!code) return '—';
    return code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num ')
      .replace(/^Bracket(Left|Right)$/, (_, s) => (s === 'Left' ? '[' : ']'))
      .replace(/^Semicolon$/, ';').replace(/^Quote$/, "'").replace(/^Comma$/, ',')
      .replace(/^Period$/, '.').replace(/^Slash$/, '/').replace(/^Backslash$/, '\\')
      .replace(/^Minus$/, '-').replace(/^Equal$/, '=').replace(/^Backquote$/, '`');
  }

  const SETTINGS_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Roboto, "Segoe UI", Arial, sans-serif; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); }
    .dlg {
      position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
      background: #2b2b2b; color: #eee; border-radius: 12px; padding: 20px 20px 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,.6); font-size: 14px; line-height: 1.4; outline: none;
    }
    h2 { margin: 0 0 14px; font-size: 18px; font-weight: 500; color: #fff; }
    fieldset { border: 1px solid #444; border-radius: 8px; margin: 0 0 12px; padding: 8px 12px 10px; }
    legend { padding: 0 6px; color: #ff8c00; font-weight: 500; }
    .row { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
    .num { display: flex; align-items: center; gap: 8px; padding: 5px 0; flex-wrap: wrap; }
    .num span.grow { flex: 1 1 auto; }
    .sub { padding-left: 26px; }
    .sub.off { opacity: .45; }
    input[type=checkbox] { width: 16px; height: 16px; accent-color: #ff8c00; margin: 0; }
    input[type=number] {
      width: 90px; padding: 5px 8px; border-radius: 6px; border: 1px solid #555;
      background: #1f1f1f; color: #fff; font-size: 14px; text-align: right;
    }
    input[type=number]:focus, button:focus-visible { outline: 2px solid #ff8c00; outline-offset: 1px; }
    button {
      padding: 7px 14px; border-radius: 6px; border: 1px solid #555; background: #3a3a3a;
      color: #eee; font-size: 14px; cursor: pointer;
    }
    button:hover { background: #454545; }
    .key { min-width: 90px; font-weight: 600; letter-spacing: .5px; }
    .key.wait { border-color: #ff8c00; color: #ff8c00; }
    .hint { margin: 4px 0 0; color: #999; font-size: 12px; }
    .hint.err { color: #ff6b6b; }
    .tabs { display: flex; gap: 6px; margin: 0 0 12px; }
    .tab { flex: 1 1 0; padding: 7px 10px; font-weight: 500; }
    .tab.on { background: #ff8c00; border-color: #ff8c00; color: #fff; }
    .mlist { display: flex; flex-direction: column; gap: 1px; margin-bottom: 12px; }
    .mrow { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
    .mrow.child { padding-left: 16px; }
    .mrow.top { margin-top: 6px; }
    .mrow .mname {
      flex: 1 1 auto; min-width: 40px; padding: 5px 8px; border-radius: 6px; border: 1px solid #555;
      background: #1f1f1f; color: #fff; font-size: 13px;
    }
    .mrow.top .mname { font-weight: 600; }
    .mrow.hidden .mname { opacity: .45; text-decoration: line-through; }
    .mrow .mhk { min-width: 82px; padding: 4px 6px; font-size: 12px; }
    .mrow .mhk.wait { border-color: #ff8c00; color: #ff8c00; }
    .mrow .mhk[disabled] { opacity: .4; cursor: default; }
    .mcell { display: inline-flex; align-items: center; justify-content: center; width: 20px; flex: none; cursor: pointer; }
    .mcell.empty { cursor: default; }
    .actions { display: flex; gap: 8px; margin-top: 4px; align-items: center; }
    .ver { background: none; border: 0; padding: 7px 2px; color: #999; font-size: 12px; }
    .ver:hover { background: none; color: #ddd; }
    .actions .spacer { flex: 1; }
    .save { background: #ff8c00; border-color: #ff8c00; color: #fff; font-weight: 500; }
    .save:hover { background: #ff9d26; }
    .dlg.touch .keys-only { display: none; }
    /* телефон: окно во весь экран и цели покрупнее */
    @media (max-width: 600px), (hover: none) {
      .dlg {
        left: 0; top: 0; transform: none; width: 100vw; max-width: none;
        height: 100vh; max-height: none; border-radius: 0; padding: 16px 16px 24px;
      }
      .row, .num { padding: 9px 0; }
      input[type=checkbox] { width: 20px; height: 20px; }
      input[type=number] { width: 104px; padding: 8px; font-size: 16px; }
      button { padding: 10px 16px; font-size: 15px; }
      .actions { position: sticky; bottom: 0; background: #2b2b2b; padding: 10px 0 2px; }
    }
  `;

  function openSettings() {
    if (settingsOpen || !document.body) return null;
    settingsOpen = true;
    return buildSettingsUI(false);
  }

  // Та же форма: модальным окном или встроенной во вкладку «Плагин»
  function buildSettingsUI(embedded) {
    const host = document.createElement('div');
    host.className = 'skq-settings';
    if (!embedded) host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${SETTINGS_CSS}${embedded ? EMBEDDED_CSS : ''}</style>
      ${embedded ? '' : '<div class="backdrop"></div>'}
      <form class="dlg" tabindex="-1" ${embedded ? '' : 'role="dialog" aria-modal="true"'} aria-label="${T('Настройки скрипта')}">
        <h2>Sankaku: ${T('настройки скрипта')}</h2>
        <div class="tabs" role="tablist">
          <button type="button" class="tab on" data-page="main" role="tab">${T('Основное')}</button>
          <button type="button" class="tab" data-page="menu" role="tab">${T('Меню сайта')}</button>
        </div>
        <div class="page" data-page="main">
        <fieldset>
          <legend>${T('Реклама')}</legend>
          <label class="row"><input type="checkbox" name="hideAds"> ${T('Скрывать рекламу')}</label>
          <label class="row"><input type="checkbox" name="hidePromo"> ${T('Скрывать напоминания о Sankaku Plus / Infinite')}</label>
        </fieldset>
        <fieldset>
          <legend>${T('Счётчики в меню')}</legend>
          <label class="row"><input type="checkbox" name="showPoints"> ${T('Показывать очки сайта')}</label>
          <label class="row"><input type="checkbox" name="showReputation"> ${T('Показывать репутацию')}</label>
          <div class="num"><span class="grow">${T('Если число неверное')}</span>
            <button type="button" class="btn repdebug">${T('Скопировать данные')}</button></div>
        </fieldset>
        <fieldset>
          <legend>${T('Карточки в сетке')}</legend>
          <label class="row"><input type="checkbox" name="showMyVote"> ${T('Показывать мою оценку (1–5) на карточке')}</label>
          <label class="row"><input type="checkbox" name="showFavCount"> ${T('Показывать количество лайков на карточке')}</label>
          <p class="hint">${T('Метка появляется у постов, чья оценка уже известна скрипту: вы поставили её здесь или сайт прислал её вместе с постами.')}</p>
        </fieldset>
        <fieldset>
          <legend>${T('Скрытые превью')}</legend>
          <label class="num"><span class="grow">${T('Показывать при наведении мышью через')}</span>
            <input type="number" name="revealHoverMs" min="0" max="60000" step="50"> ${T('мс')}</label>
          <label class="num keys-only"><span class="grow">${T('Показывать при выборе стрелками через')}</span>
            <input type="number" name="revealKeyboardMs" min="0" max="60000" step="50"> ${T('мс')}</label>
          <label class="row"><input type="checkbox" name="rehideOnBlur"> ${T('Снова скрывать, когда карточка теряет фокус')}</label>
          <label class="num sub"><span class="grow">${T('через')}</span>
            <input type="number" name="rehideDelayMs" min="0" max="60000" step="50"> ${T('мс')}</label>
        </fieldset>
        <fieldset>
          <legend>${T('Массовая загрузка')}</legend>
          <label class="num"><span class="grow">${T('Одновременно открытых форм')}</span>
            <input type="number" name="massMaxForms" min="1" max="10" step="1"></label>
          <p class="hint">${T('Каждая форма — отдельная копия страницы «Создать пост»; много форм сразу нагружают браузер.')}</p>
        </fieldset>
        <fieldset class="keys-only">
          <legend>${T('Клавиши')}</legend>
          ${HOTKEYS.map((h) => `<div class="num"><span class="grow">${esc(hotkeyLabel(h))}</span>
            <button type="button" class="key" data-setting="${h.id}"></button></div>`).join('')}
          <p class="hint keyhint">${T('Нажмите на кнопку и затем нужную клавишу. Стрелки, 1–5, Enter и Esc заняты.')}</p>
        </fieldset>
        </div>
        <div class="page" data-page="menu" hidden>
          <fieldset class="keys-only">
            <legend>${T('Клавиши')}</legend>
            <div class="num"><input type="checkbox" name="menuKeyOn">
              <span class="grow">${T('Открывать и закрывать меню клавишей')}</span>
              <button type="button" class="key menukey"></button></div>
            <label class="row"><input type="checkbox" name="menuHoldMod">
              ${T('Показывать меню, пока зажат Ctrl или Alt')}</label>
          </fieldset>
          <p class="hint">${T('Пункты бокового меню сайта: своё название, видимость, счётчик и клавиша перехода. Счётчики обновляются при открытии меню.')}</p>
          <div class="mlist"></div>
        </div>
        <div class="actions">
          <button type="button" class="ver" title="${T('Скопировать версию')}">v${esc(SKQ_VERSION)}</button>
          <button type="button" class="reset">${T('Сбросить')}</button>
          <span class="spacer"></span>
          <button type="button" class="cancel">${T('Отмена')}</button>
          <button type="submit" class="save">${T('Сохранить')}</button>
        </div>
      </form>`;
    if (!embedded) document.body.appendChild(host);

    const form = root.querySelector('form');
    // на сенсорном экране клавиш нет — эти настройки только мешают
    form.classList.toggle('touch', TOUCH());
    const f = (name) => form.elements.namedItem(name);
    const keyBtns = [...root.querySelectorAll('.key[data-setting]')];
    const hint = root.querySelector('.keyhint');
    const hintText = hint.textContent;
    const subRow = root.querySelector('.sub');
    const keys = {};
    let capturing = null; // какую клавишу сейчас назначаем
    let capturingMenu = null; // ... и то же для пункта меню
    let capturingToggle = false; // ... и для клавиши, открывающей меню
    let menuDraft = {};
    let menuKeyDraft = settings.menuKey || DEFAULTS.menuKey;
    const menuKeyBtn = root.querySelector('.menukey');

    function renderMenuKey() {
      menuKeyBtn.textContent = capturingToggle ? t('Нажмите клавишу…') : comboLabel(menuKeyDraft);
      menuKeyBtn.classList.toggle('wait', capturingToggle);
      menuKeyBtn.disabled = !f('menuKeyOn').checked;
    }

    menuKeyBtn.addEventListener('click', () => {
      capturingToggle = true;
      setCapturingMenu(null);
      renderMenuKey();
      setHint(t('Esc — отмена.'));
    });

    for (const tab of root.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        for (const other of root.querySelectorAll('.tab')) other.classList.toggle('on', other === tab);
        for (const page of root.querySelectorAll('.page')) page.hidden = page.dataset.page !== tab.dataset.page;
        setCapturingMenu(null);
      });
    }

    const draftOf = (key) => (menuDraft[key] = menuDraft[key] || {});

    function setCapturingMenu(key) {
      capturingMenu = key;
      if (key) capturingToggle = false;
      renderMenuRows();
    }

    function menuRowHk(key) {
      const st = menuDraft[key] || {};
      return String(st.hk || menuDefHk(key) || '');
    }

    function renderMenuRows() {
      const list = root.querySelector('.mlist');
      list.replaceChildren();
      for (const item of MENU_ITEMS) {
        const st = menuDraft[item.key] || {};
        const orig = menuWord(item) || item.fallback || item.key;
        const row = document.createElement('div');
        row.className = 'mrow ' + (item.parentKey ? 'child' : 'top') + (st.off ? ' hidden' : '');
        row.dataset.key = item.key;

        const show = document.createElement('label');
        show.className = 'mcell';
        show.title = t('Показывать пункт');
        const showBox = document.createElement('input');
        showBox.type = 'checkbox';
        showBox.className = 'mshow';
        showBox.checked = !st.off;
        showBox.addEventListener('change', () => { draftOf(item.key).off = !showBox.checked; renderMenuRows(); });
        show.appendChild(showBox);
        row.appendChild(show);

        const name = document.createElement('input');
        name.type = 'text';
        name.className = 'mname';
        name.placeholder = orig;
        name.title = t('Своё название');
        name.value = String(st.name || '');
        name.addEventListener('input', () => { draftOf(item.key).name = name.value; });
        row.appendChild(name);

        const cnt = document.createElement('label');
        cnt.className = 'mcell' + (item.count ? '' : ' empty');
        if (item.count) {
          cnt.title = t('Показывать счётчик');
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.className = 'mcount';
          box.checked = st.count !== false;
          box.addEventListener('change', () => { draftOf(item.key).count = box.checked; });
          cnt.appendChild(box);
        }
        row.appendChild(cnt);

        const hkCell = document.createElement('label');
        hkCell.className = 'mcell keys-only';
        hkCell.title = t('Переход по клавише');
        const hkBox = document.createElement('input');
        hkBox.type = 'checkbox';
        hkBox.className = 'mhkon';
        hkBox.checked = !!st.hkOn;
        hkBox.addEventListener('change', () => { draftOf(item.key).hkOn = hkBox.checked; renderMenuRows(); });
        hkCell.appendChild(hkBox);
        row.appendChild(hkCell);

        const hkBtn = document.createElement('button');
        hkBtn.type = 'button';
        hkBtn.className = 'mhk keys-only' + (capturingMenu === item.key ? ' wait' : '');
        hkBtn.textContent = capturingMenu === item.key ? t('Нажмите клавишу…') : comboLabel(menuRowHk(item.key));
        hkBtn.disabled = !st.hkOn;
        hkBtn.addEventListener('click', () => {
          setCapturingMenu(item.key);
          setHint(t('Esc — отмена.'));
        });
        row.appendChild(hkBtn);

        list.appendChild(row);
      }
    }

    function collectMenu() {
      const out = {};
      for (const key in menuDraft) {
        const st = menuDraft[key];
        const item = {};
        if (String(st.name || '').trim()) item.name = String(st.name).trim();
        if (st.off) item.off = true;
        if (st.count === false) item.count = false;
        if (st.hkOn) item.hkOn = true;
        if (st.hk && st.hk !== menuDefHk(key)) item.hk = st.hk;
        if (Object.keys(item).length) out[key] = item;
      }
      return out;
    }

    function fill(s) {
      menuDraft = {};
      if (isObj(s.menu)) for (const key in s.menu) if (isObj(s.menu[key])) menuDraft[key] = { ...s.menu[key] };
      capturingMenu = null;
      renderMenuRows();
      for (const k of ['hideAds', 'hidePromo', 'showPoints', 'showReputation', 'showMyVote', 'showFavCount',
        'rehideOnBlur', 'menuKeyOn', 'menuHoldMod']) f(k).checked = !!s[k];
      capturingToggle = false;
      menuKeyDraft = s.menuKey || DEFAULTS.menuKey;
      renderMenuKey();
      for (const k of ['revealHoverMs', 'revealKeyboardMs', 'rehideDelayMs', 'massMaxForms']) f(k).value = s[k];
      for (const h of HOTKEYS) keys[h.id] = s[h.id];
      capturing = null;
      renderKey();
      syncRehide();
    }
    function renderKey() {
      for (const btn of keyBtns) {
        const id = btn.dataset.setting;
        const waiting = capturing === id;
        btn.textContent = waiting ? t('Нажмите клавишу…') : keyLabel(keys[id]);
        btn.classList.toggle('wait', waiting);
      }
    }
    function syncRehide() {
      const on = f('rehideOnBlur').checked;
      f('rehideDelayMs').disabled = !on;
      subRow.classList.toggle('off', !on);
    }
    function setHint(text, isErr) {
      hint.textContent = text;
      hint.classList.toggle('err', !!isErr);
    }
    const ms = (name, def) => {
      const v = Math.round(Number(f(name).value));
      return Number.isFinite(v) ? Math.min(60000, Math.max(0, v)) : def;
    };

    // назначение клавиши временно выключает хоткеи скрипта
    const setCapturing = (value) => {
      capturing = value;
      if (embedded) settingsOpen = !!value;
      renderKey();
    };

    function close() {
      if (embedded) return; // встроенная форма остаётся на странице и продолжает работать
      document.removeEventListener('keydown', onKey, true);
      host.remove();
      settingsOpen = false;
    }

    function onKey(e) {
      if (capturing) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          setCapturing(null);
          setHint(hintText);
          return;
        }
        if (!e.code || RESERVED_KEY_RE.test(e.code)) {
          setHint(t('Клавиша «{key}» занята или не подходит. Выберите другую.', { key: e.key === ' ' ? t('Пробел') : e.key }), true);
          return;
        }
        const taken = HOTKEYS.find((h) => h.id !== capturing && keys[h.id] === e.code);
        if (taken) {
          setHint(t('«{key}» уже назначена: {action}.', { key: keyLabel(e.code), action: hotkeyLabel(taken) }), true);
          return;
        }
        keys[capturing] = e.code;
        setCapturing(null);
        setHint(hintText);
        return;
      }
      if (capturingToggle) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { capturingToggle = false; renderMenuKey(); setHint(hintText); return; }
        if (/^(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?$/.test(e.code)) return;
        menuKeyDraft = comboOf(e);
        capturingToggle = false;
        f('menuKeyOn').checked = true;
        renderMenuKey();
        setHint(hintText);
        return;
      }
      if (capturingMenu) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { setCapturingMenu(null); setHint(hintText); return; }
        if (/^(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?$/.test(e.code)) return;
        const st = draftOf(capturingMenu);
        st.hk = comboOf(e);
        st.hkOn = true;
        setCapturingMenu(null);
        setHint(hintText);
        return;
      }
      if (e.key === 'Escape' && !embedded) {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener('keydown', onKey, true);

    for (const btn of keyBtns) {
      btn.addEventListener('click', () => {
        setCapturing(btn.dataset.setting);
        setHint(t('Esc — отмена.'));
      });
    }
    root.querySelector('.repdebug').addEventListener('click', copyReputationDebug);
    root.querySelector('.ver').addEventListener('click', () => {
      copyText(SKQ_VERSION).then((ok) => toast(ok
        ? t('Версия скопирована: {v}', { v: SKQ_VERSION })
        : t('Не удалось скопировать'), !ok));
    });
    f('rehideOnBlur').addEventListener('change', syncRehide);
    f('menuKeyOn').addEventListener('change', renderMenuKey);
    const backdrop = root.querySelector('.backdrop');
    if (backdrop) backdrop.addEventListener('click', close);
    root.querySelector('.cancel').addEventListener('click', close);
    root.querySelector('.reset').addEventListener('click', () => fill(DEFAULTS));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings({
        hideAds: f('hideAds').checked,
        hidePromo: f('hidePromo').checked,
        showPoints: f('showPoints').checked,
        showReputation: f('showReputation').checked,
        showMyVote: f('showMyVote').checked,
        showFavCount: f('showFavCount').checked,
        revealHoverMs: ms('revealHoverMs', DEFAULTS.revealHoverMs),
        revealKeyboardMs: ms('revealKeyboardMs', DEFAULTS.revealKeyboardMs),
        rehideOnBlur: f('rehideOnBlur').checked,
        rehideDelayMs: ms('rehideDelayMs', DEFAULTS.rehideDelayMs),
        massMaxForms: Math.min(10, Math.max(1, ms('massMaxForms', DEFAULTS.massMaxForms) || DEFAULTS.massMaxForms)),
        menu: collectMenu(),
        menuKey: menuKeyDraft,
        menuKeyOn: f('menuKeyOn').checked,
        menuHoldMod: f('menuHoldMod').checked,
        ...keys,
      });
      setCapturing(null);
      setCapturingMenu(null);
      close();
      toast(t('Настройки сохранены'));
    });

    fill(settings);
    if (!embedded) form.focus();
    return { host, root, fill };
  }

  const EMBEDDED_CSS = `
    .dlg { position: static; transform: none; width: auto; max-width: none; height: auto; max-height: none; overflow: visible; padding: 0; }
    .cancel { display: none; }
    .actions { position: sticky; bottom: 0; background: #2b2b2b; padding: 10px 0 2px; }
  `;

  // ---- Вкладка «Плагин» на странице настроек сайта ----
  const TABLIST_SEL = '[role="tablist"][aria-label="User Settings"], [role="tablist"][aria-label*="settings" i]';
  const settingsTab = { tab: null, panel: null, ui: null, active: false };

  const sitePanels = () =>
    [...document.querySelectorAll('[role="tabpanel"], [id^="tabpanel-"]')].filter((el) => el.id !== 'skq-settings-panel');

  function mountSettingsTab() {
    if (FRAME_MODE || !document.body) return;
    const tablist = document.querySelector(TABLIST_SEL);
    if (!tablist) {
      if (settingsTab.panel) settingsTab.panel.remove();
      Object.assign(settingsTab, { tab: null, panel: null, ui: null, active: false });
      return;
    }
    if (!settingsTab.tab || !settingsTab.tab.isConnected) {
      const sample = [...tablist.querySelectorAll('button[role="tab"]')].pop();
      if (!sample) return;
      const tab = sample.cloneNode(true);
      tab.id = 'skq-settings-tab';
      tab.setAttribute('aria-controls', 'skq-settings-panel');
      tab.setAttribute('aria-selected', 'false');
      tab.classList.remove('Mui-selected');
      tab.tabIndex = -1;
      const label = tab.querySelector('[class*="MuiTab-wrapper"]') || tab;
      label.textContent = t('Плагин');
      tab.querySelectorAll('[class*="MuiTouchRipple"]').forEach((n) => n.replaceChildren());
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSettingsTab();
      }, true);
      // клик по родной вкладке возвращает страницу сайта
      tablist.addEventListener('click', (e) => {
        const native = e.target instanceof Element && e.target.closest('button[role="tab"]');
        if (native && native !== settingsTab.tab) hideSettingsTab();
      }, true);
      tablist.appendChild(tab);
      settingsTab.tab = tab;
    }
    if (settingsTab.active) applySettingsTab();
  }

  function ensureSettingsPanel() {
    if (settingsTab.panel && settingsTab.panel.isConnected) return settingsTab.panel;
    const anchor = sitePanels()[0];
    if (!anchor || !anchor.parentElement) return null;
    const panel = document.createElement('div');
    panel.id = 'skq-settings-panel';
    panel.className = 'skq-settings-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'skq-settings-tab');
    settingsTab.ui = buildSettingsUI(true);
    panel.appendChild(settingsTab.ui.host);
    anchor.parentElement.appendChild(panel);
    settingsTab.panel = panel;
    return panel;
  }

  function showSettingsTab() {
    const panel = ensureSettingsPanel();
    if (!panel) return;
    settingsTab.active = true;
    settingsTab.ui.fill(settings);
    applySettingsTab();
    panel.scrollIntoView({ block: 'nearest' });
  }

  function applySettingsTab() {
    const tab = settingsTab.tab;
    if (!tab || !tab.isConnected || !settingsTab.panel) return;
    for (const el of sitePanels()) el.classList.add('skq-off');
    settingsTab.panel.hidden = false;
    for (const other of tab.parentElement.querySelectorAll('button[role="tab"]')) {
      const mine = other === tab;
      other.setAttribute('aria-selected', String(mine));
      other.classList.toggle('Mui-selected', mine);
    }
    const tabs = tab.closest('[class*="MuiTabs-root"]') || tab.parentElement.parentElement;
    const indicator = tabs && tabs.querySelector('[class*="MuiTabs-indicator"]');
    if (indicator) {
      indicator.style.left = `${tab.offsetLeft}px`;
      indicator.style.width = `${tab.offsetWidth}px`;
    }
  }

  function hideSettingsTab() {
    if (!settingsTab.active) return;
    settingsTab.active = false;
    if (settingsTab.panel) settingsTab.panel.hidden = true;
    for (const el of sitePanels()) el.classList.remove('skq-off');
    const tab = settingsTab.tab;
    if (tab) {
      tab.setAttribute('aria-selected', 'false');
      tab.classList.remove('Mui-selected');
    }
  }

  function unhide(reasons) {
    for (const el of document.querySelectorAll('.skq-hidden')) {
      if (!reasons.includes(el.dataset.skqHidden)) continue;
      el.classList.remove('skq-hidden');
      delete el.dataset.skqHidden;
    }
  }

  function applySettings() {
    document.documentElement.classList.toggle('skq-noads', !!settings.hideAds);
    mountReputation();
    if (!settings.hideAds) unhide(['ad']);
    if (!settings.hidePromo) unhide(['banner', 'promo']);
    // пусть сетка перепроверится при повторном включении
    document.querySelectorAll('[data-skq-grid]').forEach((g) => delete g.dataset.skqGrid);
    if (!settings.rehideOnBlur) {
      for (const id of [...rehideTimers.keys()]) cancelRehide(id);
    }
    if (mass.root) pumpForms();
    if (document.body) scan();
  }

  function showSettings() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', showSettings, { once: true });
      return;
    }
    // на странице настроек сайта открываем вкладку «Плагин», иначе — окно
    mountSettingsTab();
    if (settingsTab.tab) showSettingsTab();
    else openSettings();
  }
  document.addEventListener('skq:open-settings', showSettings);

  // ---------------------------------------------------------------------------
  // Стили и запуск
  // ---------------------------------------------------------------------------
  const css = `
    .skq-hidden { display: none !important; }
    html.skq-noads ins.adsbygoogle, html.skq-noads ins[data-zoneid], html.skq-noads [id^="div-gpt-ad"] { display: none !important; }
    ${CARD_SEL}.skq-kb-active > * { outline: 3px solid #ff8c00; outline-offset: 3px; border-radius: 6px; }
    ${CARD_SEL}.skq-card-busy > * { opacity: .6; transition: opacity .15s; }
    ${CARD_SEL} > .skq-myvote, ${CARD_SEL} > .skq-favs {
      position: absolute; top: 6px; z-index: 3; pointer-events: none;
      padding: 1px 6px 2px; border-radius: 10px; background: rgba(0, 0, 0, .72);
      font: 700 12px/16px Roboto, "Helvetica Neue", Arial, sans-serif; white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0, 0, 0, .6);
    }
    ${CARD_SEL} > .skq-myvote { left: 6px; color: #ffb347; }
    ${CARD_SEL} > .skq-favs { right: 6px; color: #ff8fa3; }
    html.skq-frame header, html.skq-frame [class*="MuiAppBar-root"] { display: none !important; }
    ${CARD_SEL}.skq-revealed, ${CARD_SEL}.skq-revealed * { filter: none !important; backdrop-filter: none !important; }
    ${CARD_SEL}.skq-revealed .skq-eye { display: none !important; }
    ${CARD_SEL} img.skq-rev-img { object-fit: contain; opacity: 1 !important; animation: skq-fade .25s ease-out; }
    @keyframes skq-fade { from { opacity: 0; } to { opacity: 1; } }
    .skq-pop { pointer-events: auto !important; }
    .skq-rate .skq-star { cursor: pointer; pointer-events: auto !important; transition: transform .1s; }
    .skq-rate .skq-star:hover { transform: scale(1.2); }
    .skq-rate .skq-star path { transition: fill .1s; }
    .skq-rate .skq-star.skq-mine path { fill: #ff8c00 !important; }
    .skq-rate .skq-star.skq-hover path { fill: #ffb347 !important; }
    .skq-fav { cursor: pointer; pointer-events: auto !important; }
    .skq-fav .skq-heart { transition: transform .1s; }
    .skq-fav:hover .skq-heart { transform: scale(1.2); }
    .skq-fav .skq-heart.skq-faved path { fill: #ff4f70 !important; }
    .skq-busy { opacity: .5; pointer-events: none !important; }
    .skq-off { display: none !important; }
    .skq-menu-off { display: none !important; }
    .skq-hidden-title { display: none !important; }
    #portal-title .skq-title {
      display: inline-block; padding: 0 6px; margin: 0 -6px; border: 1px dashed transparent;
      border-radius: 6px; cursor: text;
    }
    #portal-title .skq-title:hover { border-color: rgba(255, 255, 255, .5); background: rgba(255, 255, 255, .08); }
    @media (hover: none) { #portal-title .skq-title { border-color: rgba(255, 255, 255, .25); } }
    .skq-title-edit { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
    .skq-title-edit input {
      font: inherit; color: inherit; min-width: 140px; padding: 1px 8px;
      background: rgba(0, 0, 0, .3); border: 1px solid #ff8c00; border-radius: 6px;
    }
    .skq-title-edit .skq-title-btn {
      display: none; align-items: center; justify-content: center; width: 26px; height: 26px;
      padding: 0; border: 0; border-radius: 50%; cursor: pointer;
      background: rgba(255, 255, 255, .16); color: #fff; font-size: 15px; line-height: 1;
    }
    .skq-title-edit .skq-title-btn:hover { background: rgba(255, 255, 255, .3); }
    .skq-title-edit.changed .skq-title-btn { display: inline-flex; }
    .skq-title-edit .skq-title-ok { background: #ff8c00; }
    .skq-title-edit .skq-title-ok:hover { background: #ff9d26; }
    .skq-mcount {
      margin-left: auto; padding-left: 8px; flex: none; color: #ff8c00;
      font: 500 13px/1.2 Roboto, "Helvetica Neue", Arial, sans-serif; white-space: nowrap;
    }
    .skq-mcount:empty { display: none; }
    .skq-settings-panel { padding: 8px 0 24px; }
    .skq-rep {
      display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; vertical-align: middle;
      font-family: Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; font-weight: 500; color: #fff; white-space: nowrap;
    }
    .skq-rep svg { width: 22px; height: 22px; flex: none; }
    .skq-rep-refresh {
      display: none; align-items: center; justify-content: center; flex: none;
      width: 20px; height: 20px; margin-left: 2px; padding: 0; border: 0; border-radius: 50%;
      background: rgba(255, 255, 255, .14); color: #fff; cursor: pointer;
    }
    .skq-rep-refresh:hover { background: rgba(255, 255, 255, .28); }
    .skq-rep:hover .skq-rep-refresh, .skq-rep-refresh:focus { display: inline-flex; }
    .skq-rep-refresh svg { width: 14px; height: 14px; }
    .skq-rep.skq-rep-busy .skq-rep-refresh { display: inline-flex; animation: skq-spin 1s linear infinite; }
    /* на телефоне наводить нечем — кнопка видна всегда */
    @media (hover: none) { .skq-rep-refresh { display: inline-flex; } }
    @keyframes skq-spin { to { transform: rotate(360deg); } }
    .skq-emo-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
    .skq-emo-badge {
      position: absolute; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; box-sizing: border-box;
      background: #ff8c00; color: #fff; font: 700 12px/18px Roboto, Arial, sans-serif; text-align: center;
      box-shadow: 0 1px 4px rgba(0,0,0,.5);
    }
    .skq-toast {
      position: fixed; left: 50%; bottom: 24px; z-index: 2147483647;
      transform: translate(-50%, 20px); opacity: 0; pointer-events: none;
      padding: 8px 16px; border-radius: 8px; background: #333; color: #fff;
      font: 14px/1.4 Roboto, Arial, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.4);
      transition: opacity .2s, transform .2s;
    }
    .skq-toast.skq-show { opacity: 1; transform: translate(-50%, 0); }
    .skq-toast.skq-err { background: #b3261e; }
  `;

  function start() {
    markTouch();
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.classList.toggle('skq-noads', !!settings.hideAds);
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(scan, 1000); // смена слайда в просмотрщике может не менять DOM
    scan();
    if (!FRAME_MODE) {
      setTimeout(() => refreshReputation(true), 3000); // ждём, пока сайт сходит в API и отдаст нам токен
      setInterval(() => refreshReputation(), REP_TTL);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
