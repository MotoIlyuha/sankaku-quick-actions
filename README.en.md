[Русский](README.md) · **English**

# Sankaku: rate and favorite without opening a post

One source tree, four builds: a Tampermonkey userscript and extensions for
Chrome (MV3), Firefox (MV3) and Firefox (MV2).

## Build

```bash
python build.py          # build everything into dist/
python build.py --zip    # also pack the extensions into archives
```

The version is a single line at the top of `build.py` and goes into both the
userscript and every manifest.

## Layout

| Path | What it is |
|---|---|
| `src/core.js` | All of the behaviour. Shared by every build, runs in the page context |
| `src/loaders/userscript.js` | Tampermonkey loader: sandbox, `GM_*`, menu command |
| `src/ext/bridge.js` | Extension bridge: isolated world, storage, toolbar button |
| `src/ext/background.js` | Extension background: the button opens the settings |
| `src/ext/manifest.*.json` | Three manifests |
| `src/header.txt` | Userscript metadata |
| `src/i18n/` | Translations: `base.json` holds the string order and English, `lang_<code>.json` the other 24 languages |
| `dist/` | Build output (overwritten) |
| `sankaku-quick-actions.user.js` | Copy of the built userscript in the repo root — the file users install and update from |

## How the core reaches the page

The core needs the page's own context: it patches the site's `fetch`/XHR and
reads React data. Delivery is the only thing that differs between builds.

| Build | Core delivery | Settings |
|---|---|---|
| Tampermonkey | `GM_addElement('script')` | `GM_getValue` / `GM_setValue`, synchronous |
| Chrome MV3 | content script with `"world": "MAIN"` | `chrome.storage.local`, asynchronous |
| Firefox MV3 | same (needs Firefox 128+) | `browser.storage.local` |
| Firefox MV2 | the bridge injects the source inline; if CSP blocks it, as a file from `web_accessible_resources` | `browser.storage.local` |

Extension storage is asynchronous, while the core has to start before the
site's first requests. So it starts with default settings and receives the
saved ones through a separate event:

```
core   → skq:ready, skq:settings-request → bridge
bridge → skq:settings-load (JSON)        → core
core   → skq:settings-save (JSON)        → bridge → storage
toolbar button → background → bridge → skq:open-settings → core
```

The Tampermonkey loader speaks the same events, so the core never knows where
it is running.

## Install

**Tampermonkey.** Open
[sankaku-quick-actions.user.js](https://raw.githubusercontent.com/MotoIlyuha/sankaku-quick-actions/main/sankaku-quick-actions.user.js)
— Tampermonkey offers to install it and checks for updates on its own.

**Chrome.** Download `sankaku-chrome-*.zip` from
[Releases](https://github.com/MotoIlyuha/sankaku-quick-actions/releases),
unpack it, then go to `chrome://extensions` → Developer mode → «Load unpacked».
A locally built copy sits in `dist/chrome`.

**Firefox.** `sankaku-firefox-mv3-*.zip` for Firefox 128 and newer,
`sankaku-firefox-mv2-*.zip` for older builds. Unpack and load it from
`about:debugging#/runtime/this-firefox` → «Load Temporary Add-on» →
`manifest.json`. A temporary add-on lives until the browser restarts; a
permanent install needs a signature from addons.mozilla.org.

In the extension the settings open from the toolbar button, in Tampermonkey
from the «⚙ Settings» menu command. On the site's own settings page both add a
«Plugin» tab.

## Phones

The add-on is marked compatible with Firefox for Android (`gecko_android`,
version 142 and newer). On a touch screen:

- a hidden preview opens with a long press on the card instead of on hover;
- the reputation refresh button is always visible, with no hover needed;
- the settings open full screen with larger targets, and the «Keys» section and
  the arrow-key delay are hidden — there is no keyboard there;
- bulk upload keeps at most two forms open at once even if the setting says
  more: every form is a full copy of the site's page.

Not available on a phone: the hotkeys (1–5, F, C, E), selecting cards with the
arrow keys, and revealing previews on hover.

## Cutting a release

1. Bump `VERSION` in `build.py`, add a section to `CHANGELOG.md`.
2. Run `python build.py` and commit the rebuilt
   `sankaku-quick-actions.user.js` as well — Tampermonkey updates from it.
3. `git tag v1.18.0 && git push origin v1.18.0`.

`.github/workflows/release.yml` takes it from there: it builds every target,
checks the tag against the version, checks that the committed userscript
matches the sources, and creates a release with the script and the three
extension archives. The release notes come from the matching `CHANGELOG.md`
section.

## Publishing on addons.mozilla.org

The **MV3** build (`dist/firefox-mv3`) is the one submitted to AMO: it does not
duplicate the core, unlike MV2, where the core ships both inline in the bridge
and as a file. MV2 stays for self-distribution and older Firefox versions.

A submission needs three things:

1. **A source archive** — `python build.py --source` writes
   `dist/sankaku-source-<version>.zip`. The build is reproduced from it with
   `python build.py --zip`, with no network access and no third-party
   dependencies.
2. **Reviewer notes** — [`docs/REVIEWER_NOTES.md`](docs/REVIEWER_NOTES.md):
   what the add-on does, why it needs the page context and the `fetch` wrapper,
   why no data leaves the browser, how to build the package.
3. **A test account on the site** — rating, favoriting and uploading cannot be
   checked without signing in. The credentials go into the submission form.

Listing text, categories and the rest of the fields are in
[`docs/amo-listing.md`](docs/amo-listing.md) (in Russian, with the English
listing text ready to paste). Data collection is declared in the manifest
(`data_collection_permissions: none`), which is mandatory for new add-ons
submitted from November 3, 2025.

## Testing against the mock

The site is closed to automation, so a mock of its markup and API lives next to
the code:

```bash
python build.py
python test/server.py 8766
```

Then open `http://localhost:8766/<lang>/...` — for example `/ru`,
`/ja/settings`, `/ru/posts/upload#skq-mass`, `/ru/reputation`. The `?ext=`
parameter switches how the core is delivered; the files are served straight
from `dist/`:

| URL | What it exercises |
|---|---|
| no parameter | the userscript (`GM_*`) |
| `?ext=main` | extension with `world: "MAIN"` (Chrome MV3, Firefox MV3) |
| `?ext=1` | the same bridge without `world: MAIN` support — it injects the core itself |
| `?ext=mv2` | the Firefox MV2 bridge: core injected inline |

The mode is remembered per tab so the upload form's iframes open the same way.
In extension mode `chrome.storage` is a stub and asynchronous, and
`window.__extMessage({skq:'open-settings'})` stands in for a click on the
toolbar button.

`node test/check.js sankaku-quick-actions.user.js` checks that the core is
self-contained — its source has to run on its own, without the loader.

## Translations

155 strings in 26 languages. A string's key is its Russian text, so the code
shows what is being translated. The `lang_*.json` files are numbered in the
order from `base.json`; the build fails if a language is missing a string or if
placeholders such as `{n}` and `{key}` do not match.

The language follows the site: first the prefix in the URL (`/ja/`, `/zh-tw/`),
then `<html lang>`, then the site's own storage, then the browser language.
