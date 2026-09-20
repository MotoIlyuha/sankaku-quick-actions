# API Sankaku: что удалось выяснить

Документации нет: `sankakuapi.com/docs`, `/swagger`, `/openapi.json` и
подобные адреса отвечают пустой страницей. Официального клиента и MCP-сервера
тоже нет. Всё, что ниже, собрано из кода самого сайта.

## Основное

- База: `https://sankakuapi.com` (раньше `capi-v2.sankakucomplex.com`).
- Чтение работает без входа: `GET https://sankakuapi.com/posts?limit=1`,
  `GET https://sankakuapi.com/reputation/current-round`.
- Личные данные и действия требуют заголовка `Authorization: Bearer <token>`.
  Расширение не хранит и не запрашивает токен: оно берёт заголовок из запросов,
  которые страница делает сама (см. `requestHeaders()` в `src/core.js`).
- Ответы — JSON. Ошибки приходят как `{success: false, code: "..."}`
  либо обычным HTTP-кодом.

## Адреса, на которых держится расширение

| Что | Запрос |
|---|---|
| Список постов сетки | `GET posts?lang=..&page=..&limit=..&tags=..` |
| Пост по ID | `GET posts/{id}` |
| Оценка | `POST posts/{id}/vote` с телом `{score: 1..5}`, `DELETE` — снять |
| Избранное | `POST posts/{id}/favorite`, `DELETE` — убрать |
| Подсказки тегов | через API не запрашиваются: расширение вводит текст в форму сайта и читает её выпадающий список — так теги совпадают с тем, что примет сам сайт |
| Профиль | `GET users/me` — репутации в нём нет |
| Счётчики меню | `GET users/me` → `post_favorite_count`, `post_upload_count`, `pool_favorite_count`, `pool_upload_count` |
| Репутация | `GET reputation/ranking` → `{list, user_reputation}` |

`user_reputation` — наша строка рейтинга: `rank`, `reputation`,
`reputation_week`. Это единственный точный источник числа: в профиле поля
репутации нет, а то, что нарисовано на странице рейтинга, относится к текущему
раунду и не обновляется само.

## Как собран список

Адреса вынуты из главного бандла сайта разбором вызовов api-клиента:

```bash
python tools/scan-api.py            # список в консоль
python tools/scan-api.py --md       # таблицы ниже
```

Скрипт сам находит адрес бандла на главной странице, так что список можно
пересобрать после любого обновления сайта. Имена вроде `${e}` — это переменные
в коде, обычно id. Адреса, целиком собранные из переменных, пропущены.

## Все найденные адреса
### age-verification

| Метод | Адрес |
|---|---|
| GET | `age-verification/filter-state` |

### app

| Метод | Адрес |
|---|---|
| GET | `app/version.json` |

### auth

| Метод | Адрес |
|---|---|
| POST | `/auth/logout` |
| POST | `/auth/request-validation` |
| POST | `/auth/verify-email` |

### collections

| Метод | Адрес |
|---|---|
| DELETE | `/collections/${e}/destroy` |
| POST | `/collections/${e}/flag` |
| GET | `/collections/${e}/flags` |
| PUT | `/collections/${e}/review` |
| DELETE,GET,PUT | `collections/${e}` |
| PUT | `collections/${e}/favorite` |
| GET | `collections/${e}/histories` |
| PUT | `collections/${e}/vote` |
| POST | `collections/history/${e}/votes` |
| POST | `collections/reaction` |
| GET | `collections/total-private` |

### comments

| Метод | Адрес |
|---|---|
| PUT | `/comments/${t}` |
| GET | `/comments/recent` |
| DELETE | `comments/${e}` |
| PUT | `comments/${e}/action` |
| PUT | `comments/${e}/vote` |

### companions

| Метод | Адрес |
|---|---|
| GET | `/companions/${e}/flags` |
| PUT | `/companions/chats/${e}/ai-model` |
| POST | `/companions/chats/${e}/feedback` |
| PUT | `/companions/chats/${e}/members/${t}/nickname` |
| POST,PUT | `/companions/chats/${e}/scenario` |
| DELETE,PUT | `/companions/chats/scenario/${e}` |
| POST | `/companions/features-feedback` |
| GET | `/companions/interactions` |
| POST | `/companions/messages/select/${e}` |
| POST | `/companions/suggest-messages` |
| DELETE,PUT | `companions/${e}` |
| PUT | `companions/${e}/favorite` |
| POST | `companions/${e}/flag` |
| GET | `companions/${e}/request-changes/latest` |
| PUT | `companions/${e}/review` |
| GET | `companions/${e}/voices/file` |
| PUT | `companions/${e}/vote` |
| GET | `companions/${n}/voices/sample` |
| GET | `companions/${t}` |
| POST | `companions/attributes/generate-all` |
| GET | `companions/autosuggest?name=${e}` |
| GET | `companions/chat-cost` |
| PUT | `companions/chat-summary/${e}` |
| POST | `companions/chats` |
| PUT | `companions/chats/${e}` |
| PUT | `companions/chats/${e}/auto-reply` |
| POST | `companions/chats/${e}/members` |
| DELETE | `companions/chats/${e}/members/${t}` |
| POST | `companions/chats/${e}/speech-to-text` |
| GET,PUT | `companions/chats/${e}/versions` |
| POST | `companions/chats/${n}/activate-features` |
| DELETE | `companions/chats/${t}/clear-messages` |
| PUT | `companions/chats/${t}/features` |
| GET | `companions/chats/detail` |
| DELETE | `companions/chats/groups/${e}` |
| GET | `companions/features-cost` |
| POST | `companions/generate-attribute` |
| POST | `companions/generate-avatar` |
| POST | `companions/generate-message` |
| POST | `companions/histories/${e}/votes` |
| GET | `companions/memories/${e}` |
| POST | `companions/memories/${t}/load-memory` |
| GET | `companions/messages` |
| PUT | `companions/messages/${e}` |
| PUT | `companions/messages/${e}/superlike` |
| PUT | `companions/messages/${e}/vote` |
| GET | `companions/messages/branch` |
| GET | `companions/recent-chats` |
| GET | `companions/recommended-features` |
| GET,PUT | `companions/request-changes` |
| PUT | `companions/request-changes/${e}` |
| POST | `companions/request-changes/${e}/votes` |
| GET | `companions/request-changes/${t}` |
| GET | `companions/total-private` |
| GET | `companions/universal-boundary` |
| GET | `companions/voices/${e}/sample` |
| POST | `companions/voices/messages/${e}` |
| GET | `companions/voices/presets` |
| POST | `companions/voices/preview-sample` |

### creators

| Метод | Адрес |
|---|---|
| GET | `creators/${e}/cstats` |
| GET | `creators/analytics` |
| GET | `creators/content` |
| GET | `creators/memberships` |
| GET,PUT | `creators/subscription-tags` |

### dmail

| Метод | Адрес |
|---|---|
| POST | `dmail/${e}/show` |
| POST | `dmail/mark-all-read` |

### first-purchase-offer

| Метод | Адрес |
|---|---|
| POST | `first-purchase-offer/trigger` |

### gifts

| Метод | Адрес |
|---|---|
| GET,PUT | `gifts/${e}` |
| POST | `gifts/${e}/resend` |
| POST | `gifts/${t}/${n}` |
| GET | `gifts/plans` |

### gifts-by-subs

| Метод | Адрес |
|---|---|
| GET | `gifts-by-subs/${e}` |

### notifications

| Метод | Адрес |
|---|---|
| GET | `notifications/events` |
| GET,POST | `notifications/settings` |
| POST | `notifications/settings/all` |
| POST | `notifications/subscribe` |
| POST | `notifications/unsubscribe` |

### payment

| Метод | Адрес |
|---|---|
| POST | `/payment/auth` |
| POST | `/payment/refresh` |

### pool_comments

| Метод | Адрес |
|---|---|
| DELETE | `pool_comments/${e}` |
| PUT | `pool_comments/${e}/vote` |
| PUT | `pool_comments/${t}` |

### pools

| Метод | Адрес |
|---|---|
| POST | `/pools/${e}/anonymize` |
| GET | `/pools/${e}/flags` |
| POST | `/pools/${t}/approve` |
| POST | `/pools/${t}/flag` |
| PUT | `/pools/${t}/rating-locked` |
| PUT | `/pools/${t}/reading` |
| PUT | `/pools/${t}/updates/${n}` |
| POST | `/pools/${t}/updates/${n}/undo` |
| POST | `/pools/reaction` |
| PATCH | `/pools/readings/destroy` |
| DELETE | `pools/${e}` |
| DELETE,POST | `pools/${e}/favorite` |
| GET | `pools/${e}/history` |
| POST | `pools/${e}/undelete` |
| DELETE,POST | `pools/${e}/vote` |
| GET,PUT | `pools/${n}` |
| GET | `pools/${t}/comments` |
| GET | `pools/keyset` |
| POST | `pools/many` |

### posts

| Метод | Адрес |
|---|---|
| POST | `/posts/${e}/approve` |
| GET | `/posts/${e}/flags` |
| DELETE,PUT | `posts/${e}` |
| GET | `posts/${e}/analytics` |
| POST | `posts/${e}/anonymize` |
| GET | `posts/${e}/comments` |
| GET | `posts/${e}/cstats` |
| DELETE,POST | `posts/${e}/favorite` |
| POST | `posts/${e}/flag` |
| GET | `posts/${e}/fu` |
| POST | `posts/${e}/regenerate-imagery` |
| PUT | `posts/${e}/restrict_anonymous` |
| GET | `posts/${e}/tags` |
| GET | `posts/${e}/total-views` |
| POST | `posts/${e}/undelete` |
| DELETE,PUT | `posts/${e}/vote` |
| POST | `posts/${t}/comments` |
| POST | `posts/reaction` |

### privileges

| Метод | Адрес |
|---|---|
| PUT | `privileges/claim` |

### pwa-install

| Метод | Адрес |
|---|---|
| GET | `pwa-install/journey` |
| POST | `pwa-install/journey/dismissal` |
| POST | `pwa-install/journey/impression` |
| POST | `pwa-install/journey/installed` |

### reputation

| Метод | Адрес |
|---|---|
| PUT | `reputation/claim-reward` |
| GET | `reputation/current-round` |
| GET | `reputation/daily-balance` |
| GET | `reputation/logs` |
| GET | `reputation/logs/${e}` |
| GET | `reputation/monitor` |
| GET | `reputation/monitor/contributors` |
| GET | `reputation/ranking` |
| PUT | `reputation/recalculate` |

### sso

| Метод | Адрес |
|---|---|
| POST | `/sso/finalize` |
| POST | `/sso/token-exchange` |

### tag-and-wiki

| Метод | Адрес |
|---|---|
| GET | `tag-and-wiki/name/${(0,p.h9)(encodeURIComponent(e))}` |

### tag-creators

| Метод | Адрес |
|---|---|
| PUT | `tag-creators/${e}` |
| POST | `tag-creators/kyc/create-session` |
| GET | `tag-creators/verifications/${e}` |
| GET | `tag-creators/verifications/kyc-status` |

### tags

| Метод | Адрес |
|---|---|
| PUT | `tags/${e.id}` |
| PUT | `tags/${encodeURIComponent(e)}/rating-locked` |
| PUT | `tags/${encodeURIComponent(e)}/type-locked` |
| GET | `tags/${e}/followers` |
| GET | `tags/${i}/history` |
| GET | `tags/autosuggest` |
| GET | `tags/autosuggestCreating` |
| GET | `tags/history` |
| GET | `tags/history/${e}` |

### user-achievements

| Метод | Адрес |
|---|---|
| GET | `user-achievements/${encodeURIComponent(e)}/favorites` |
| PUT | `user-achievements/${e}/favorite` |
| GET | `user-achievements/${e}/top` |
| GET | `user-achievements/config` |

### users

| Метод | Адрес |
|---|---|
| POST | `/users/claim-bonus` |
| GET | `/users/country` |
| POST | `/users/create-migration-wpf` |
| GET | `/users/payment-processor` |
| GET,PUT | `users/${e}` |
| PUT | `users/${e}/avatar` |
| PUT | `users/${e}/block` |
| DELETE,GET,POST | `users/${e}/suspensions` |
| DELETE | `users/${e}/unblock` |
| GET | `users/${t}/check-username-change` |
| POST | `users/abort-deletion` |
| GET | `users/autosuggest` |
| GET,POST | `users/blacklist` |
| DELETE | `users/blacklist/${e}` |
| PUT | `users/blacklist/${t}` |
| POST | `users/check-refresh-token` |
| POST | `users/event-tracking` |
| DELETE,GET,POST,PUT | `users/followings` |
| GET | `users/followings-count` |
| GET,PUT | `users/login-streak` |
| DELETE,GET | `users/me` |
| GET | `users/me/suspensions` |
| POST | `users/me/suspensions/${e}/appeal` |
| PUT | `users/mfa-method` |
| GET | `users/name/${encodeURIComponent(e)}` |
| POST | `users/passkeys` |
| DELETE | `users/passkeys/${e}` |
| GET | `users/passkeys/count` |
| POST | `users/passkeys/generate-authentication` |
| POST | `users/passkeys/generate-registration` |
| POST | `users/passkeys/list` |
| DELETE,POST | `users/sessions` |
| GET,PUT | `users/tutorials` |

### v2

| Метод | Адрес |
|---|---|
| PUT | `v2/collections/${e}/items` |
| GET | `v2/posts` |
| GET | `v2/posts/keyset` |

### video-generations

| Метод | Адрес |
|---|---|
| DELETE | `video-generations/${e}/cancel` |
| DELETE | `video-generations/${e}/delete` |
| POST | `video-generations/${e}/regenerate` |
| GET | `video-generations/history` |
