# Что писать в форме «Опишите дополнение» на AMO

Поля формы идут в том же порядке, что ниже. Текст готов к вставке.

## Название

```
Quick Actions for Sankaku
```

## URL дополнения

```
quick-actions-for-sankaku
```

## Сводка (до 250 символов)

Поле сейчас в русской локали (`summary_ru`), поэтому и текст русский.

```
Оценки и избранное прямо в сетке Sankaku Complex: метки своей оценки и лайков, хоткеи, массовая загрузка, скрытие рекламы. Неофициальное дополнение, не связано с владельцами сайта.
```

## Описание

```
Quick Actions for Sankaku добавляет то, ради чего сайт заставляет открывать пост.

В сетке и в просмотрщике:
• оценка по клику по звёздам и избранное по клику по сердечку — пост открывать не нужно;
• выбор карточки стрелками, 1–5 — оценка, F — избранное;
• метка своей оценки и количество лайков прямо на карточке;
• скрытые превью открываются с задержкой, которую вы задаёте.

На странице поста: 1–5 — оценка, F — избранное, C — комментарии с курсором в поле ввода, E — выбор эмоции.

Массовая загрузка: отдельная страница, которая заполняет форму сайта сразу для нескольких файлов — теги для всех выделенных, перетаскивание плиток, ID родителя и книги, публикация постов один за другим.

По желанию: скрытие рекламы и напоминаний о Sankaku Plus, счётчики очков и репутации рядом с кнопкой меню.

На телефоне работает то, что имеет смысл без мыши и клавиатуры: оценки, избранное, метки, счётчики, массовая загрузка. Скрытое превью открывается долгим нажатием. Хоткеев и выбора стрелками там нет.

Язык интерфейса следует языку, выбранному в настройках сайта — включены 26 языков.

Дополнение ничего не собирает и никуда не отправляет: в браузере хранятся только ваши настройки.

Исходный код: https://github.com/MotoIlyuha/sankaku-quick-actions

Неофициальное дополнение. Оно не связано с владельцами Sankaku Complex, не спонсируется и не одобрено ими; название сайта используется только чтобы сказать, с чем дополнение работает.
```

## Галочки

- «Это дополнение экспериментальное» — не отмечать.
- «Требует оплаты» — не отмечать.
- «Это дополнение имеет политику приватности» — не отмечать: данные не передаются,
  в манифесте объявлено `data_collection_permissions: none`.

## Категории

«Фотографии, музыка и видео». Одной достаточно.

## Поддержка

- Сайт поддержки: `https://github.com/MotoIlyuha/sankaku-quick-actions/issues`
- Почта: только если готовы показать её публично — поле необязательное.

## Лицензия

«Лицензия MIT» — совпадает с `LICENSE` в репозитории.

## Примечания для проверяющих (до 3000 символов)

Вставить текст ниже, заменив `LOGIN / PASSWORD` на данные тестового аккаунта.

```
Unofficial add-on for sankakucomplex.com: it makes the rating stars and the favorite heart clickable in the post grid, shows badges (own rating, favorite count), adds shortcuts on the post page, a bulk upload page, optional hiding of ads and "Sankaku Plus" reminders, and points/reputation counters in the site menu.

DATA: nothing is collected or transmitted. The only storage is browser.storage.local for settings; the manifest declares data_collection_permissions {"required": ["none"]}. No analytics, no endpoints of our own, no remote code — everything that runs ships in the package.

PAGE CONTEXT: core-main.js is a content script with "world": "MAIN". It needs the page context because (1) the site is a React app and the add-on reads post data from React props to tell which post a card belongs to, and (2) it wraps the page's own fetch/XMLHttpRequest to read responses the site already requests and to reuse the site's own Authorization header when the user clicks a star or a heart. Those requests go to the site's own API (sankakuapi.com), the one the page itself calls. No credentials are read, stored or sent anywhere else. bridge.js (isolated world) only reads/writes settings and relays the toolbar click; background.js only forwards that click to the tab.

innerHTML WARNINGS: the three flagged assignments are template literals of literal markup plus strings from the add-on's own translation table. Nothing from the page, the network or the file system is interpolated — file names, tags and IDs are set with textContent afterwards, and every interpolated string goes through an escaper.

BUILD (Python 3.12, no dependencies, no network access):
1) unpack the source archive
2) python build.py --zip
3) dist/firefox-mv3/ is the submitted package; dist/sankaku-firefox-mv3-<version>.zip is that folder zipped.
core-main.js = src/core.js with the translation tables from src/i18n/*.json inlined in place of the {{I18N}} marker; bridge.js = src/ext/bridge.js with two placeholders replaced; manifest.json = src/ext/manifest.firefox.json with the version. Icons are drawn by build.py. Nothing is minified or obfuscated. Longer notes: docs/REVIEWER_NOTES.md inside the archive.

TESTING: an account is required for rating, favoriting and uploading. Test account: LOGIN / PASSWORD. Open the site, hover a post card and click a star — the rating is sent and the stars update. The settings open from the toolbar button, and on the site's own settings page they also appear as a "Plugin" tab.

The site hosts adult content; the add-on itself contains none and the listing shows none. The add-on is unofficial and not affiliated with the site operators.
Source: https://github.com/MotoIlyuha/sankaku-quick-actions
```

## После отправки

1. Если при загрузке файла AMO не спросил исходники — открыть версию в
   Developer Hub и приложить `sankaku-source-<версия>.zip` там же.
2. В «Edit Product Page» добавить английскую локаль для сводки и описания
   (переключатель языка рядом с полем) — иначе англоязычные увидят русский
   текст. Английские варианты лежат в `docs/amo-listing.md`.
3. Скриншоты: настройки, сетка с метками, страница массовой загрузки —
   без контента для взрослых.
