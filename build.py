# -*- coding: utf-8 -*-
"""Сборка из общих исходников: юзерскрипт для Tampermonkey и расширения для
Chrome (MV3), Firefox (MV3) и Firefox (MV2).

    python build.py            — собрать всё в dist/
    python build.py --zip      — ещё и упаковать расширения в zip

Ядро (src/core.js) одно на все цели. Отличается только загрузчик:
в юзерскрипте это песочница Tampermonkey, в расширении — мост в изолированном
мире плюс фоновый скрипт для кнопки на панели.
"""
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import zlib

VERSION = '1.30.0'
# Адрес репозитория: из него берутся ссылки на обновление в шапке юзерскрипта.
# Пока пусто — строки со ссылками из шапки убираются.
REPO_URL = 'https://github.com/MotoIlyuha/sankaku-quick-actions'
BRANCH = 'main'

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')

# порядок языков в таблице строк
LANG_ORDER = ['en', 'ja', 'zh', 'zh-tw', 'ko', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'pl', 'sv',
              'da', 'no', 'fi', 'hu', 'ro', 'bg', 'el', 'tr', 'th', 'hi', 'id', 'ms']


def read(*parts):
    return io.open(os.path.join(*parts), encoding='utf-8').read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(text)


# ---------------------------------------------------------------------------
# Переводы
# ---------------------------------------------------------------------------
def build_i18n():
    base = json.loads(read(SRC, 'i18n', 'base.json'))
    keys = list(base['en'].keys())
    tables = {'en': dict(base['en'])}
    problems = []

    for name in sorted(os.listdir(os.path.join(SRC, 'i18n'))):
        if not (name.startswith('lang_') and name.endswith('.json')):
            continue
        code = name[5:-5].lower()
        data = json.loads(read(SRC, 'i18n', name))
        table = {}
        for i, key in enumerate(keys):
            value = data.get(str(i))
            if value is None:
                problems.append('%s: нет строки %d (%s)' % (code, i, key))
                continue
            want = sorted(re.findall(r'\{(\w+)\}', key))
            got = sorted(re.findall(r'\{(\w+)\}', value))
            if want != got:
                problems.append('%s[%d]: подстановки %s вместо %s' % (code, i, got, want))
            table[key] = value
        extra = [k for k in data if not k.isdigit() or int(k) >= len(keys)]
        if extra:
            problems.append('%s: лишние ключи %s' % (code, extra[:5]))
        tables[code] = table

    if problems:
        raise SystemExit('Переводы: ' + '; '.join(problems[:5]))

    parts = []
    for code in LANG_ORDER:
        if code not in tables:
            continue
        body = json.dumps(tables[code], ensure_ascii=False, indent=6).replace('\n', '\n    ')
        parts.append("    '%s': %s," % (code, body))
    table_js = '{\n' + '\n'.join(parts) + '\n  }'

    menu = {'ru': 'Настройки'}
    for code in LANG_ORDER:
        if code in tables:
            menu[code] = tables[code].get('Настройки', 'Settings')
    menu_js = json.dumps(menu, ensure_ascii=False, indent=4).replace('\n', '\n  ')
    return table_js, menu_js, len(keys), len(tables) + 1


# ---------------------------------------------------------------------------
# Иконки: оранжевый квадрат с белой звездой
# ---------------------------------------------------------------------------
def star_png(size):
    import math

    cx = cy = (size - 1) / 2.0
    outer = size * 0.42
    inner = outer * 0.42
    points = []
    for i in range(10):
        r = outer if i % 2 == 0 else inner
        a = -math.pi / 2 + i * math.pi / 5
        points.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    def inside(x, y):
        hit = False
        j = len(points) - 1
        for i, (xi, yi) in enumerate(points):
            xj, yj = points[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                hit = not hit
            j = i
        return hit

    bg = (255, 140, 0)
    rows = []
    radius = size * 0.18
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # скруглённые углы
            dx = max(radius - x, x - (size - 1 - radius), 0)
            dy = max(radius - y, y - (size - 1 - radius), 0)
            corner = (dx * dx + dy * dy) > radius * radius
            if corner:
                row += bytes((0, 0, 0, 0))
            elif inside(x + 0.5, y + 0.5):
                row += bytes((255, 255, 255, 255))
            else:
                row += bytes(bg + (255,))
        rows.append(bytes(row))

    raw = b''.join(rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def write_icons(folder):
    os.makedirs(folder, exist_ok=True)
    for size in (16, 32, 48, 128):
        with open(os.path.join(folder, '%d.png' % size), 'wb') as f:
            f.write(star_png(size))


# ---------------------------------------------------------------------------
# Цели сборки
# ---------------------------------------------------------------------------
def build():
    table_js, menu_js, n_keys, n_langs = build_i18n()
    core = (read(SRC, 'core.js')
            .replace('{{I18N}}', '/* SKQ_I18N_START */ ' + table_js + ' /* SKQ_I18N_END */')
            .replace('{{VERSION}}', VERSION))
    header = read(SRC, 'header.txt').replace('{{VERSION}}', VERSION)
    if REPO_URL:
        raw = REPO_URL.replace('https://github.com/', 'https://raw.githubusercontent.com/') + '/' + BRANCH
        header = header.replace('{{REPO}}', REPO_URL).replace('{{RAW}}', raw)
    else:
        header = '\n'.join(l for l in header.split('\n') if '{{REPO}}' not in l and '{{RAW}}' not in l)
    loader = read(SRC, 'loaders', 'userscript.js').replace('{{MENU}}', menu_js)
    bridge = read(SRC, 'ext', 'bridge.js')
    background = read(SRC, 'ext', 'background.js')

    if os.path.isdir(DIST):
        shutil.rmtree(DIST)

    # --- юзерскрипт ---
    userscript = header + '\n\n/* global GM_getValue, GM_setValue, GM_registerMenuCommand, GM_addElement */\n\n' \
        + loader + '\n\n' + core
    us_path = os.path.join(DIST, 'tampermonkey', 'sankaku-quick-actions.user.js')
    write(us_path, userscript)
    # копия в корне: по ней стоит установка у пользователя
    write(os.path.join(ROOT, 'sankaku-quick-actions.user.js'), userscript)

    # --- расширения ---
    core_main = ('// Ядро расширения: тот же код, что и в юзерскрипте, выполняется в контексте страницы.\n'
                 '(function () {\n' + core + '\n  core(null);\n})();\n')

    targets = [
        ('chrome', 'manifest.chrome.json', False),
        ('firefox-mv3', 'manifest.firefox.json', False),
        ('firefox-mv2', 'manifest.firefox-mv2.json', True),
    ]
    for name, manifest_name, inject in targets:
        out = os.path.join(DIST, name)
        manifest = read(SRC, 'ext', manifest_name).replace('{{VERSION}}', VERSION)
        json.loads(manifest)  # проверка синтаксиса
        write(os.path.join(out, 'manifest.json'), manifest)
        write(os.path.join(out, 'core-main.js'), core_main)
        # где ядро не объявлено в манифесте, мост несёт его исходник с собой
        core_src = json.dumps(core_main) if inject else 'null'
        write(os.path.join(out, 'bridge.js'), bridge
              .replace('{{INJECT_CORE}}', 'true' if inject else 'false')
              .replace('{{CORE_SRC}}', core_src))
        write(os.path.join(out, 'background.js'), background)
        write_icons(os.path.join(out, 'icons'))

    return us_path, n_keys, n_langs


def check_no_shadowed_t():
    """t — функция перевода. Локальная переменная с таким именем её закрывает,
    и вызов t('строка') падает с «t is not a function» (так сломался клик по
    звезде на странице поста в 1.17.0). Проще запретить имя целиком."""
    decl = re.compile(r'(?:\b(?:const|let|var)\s+t\s*[=;,)]|\(\s*t\s*[,)]\s*=>|\bfunction\s*\(\s*t\b|\bcatch\s*\(\s*t\b)')
    bad = [(i + 1, line.strip()[:80])
           for i, line in enumerate(read(SRC, 'core.js').split('\n'))
           if decl.search(line)]
    assert not bad, 'имя t занято функцией перевода: %s' % bad


def check(us_path):
    """node --check по всем собранным файлам и сверка ссылок в манифестах."""
    check_no_shadowed_t()
    files = [us_path]
    for name in ('chrome', 'firefox-mv3', 'firefox-mv2'):
        folder = os.path.join(DIST, name)
        manifest = json.loads(read(folder, 'manifest.json'))
        listed = set()
        for entry in manifest.get('content_scripts', []):
            listed.update(entry.get('js', []))
        bg = manifest.get('background', {})
        listed.update(bg.get('scripts', []))
        if bg.get('service_worker'):
            listed.add(bg['service_worker'])
        listed.add('core-main.js')
        for rel in sorted(listed):
            path = os.path.join(folder, rel)
            assert os.path.exists(path), 'нет файла %s в %s' % (rel, name)
            files.append(path)
        for icon in manifest.get('icons', {}).values():
            assert os.path.exists(os.path.join(folder, icon)), icon

    for path in files:
        subprocess.run(['node', '--check', path], check=True)
    return len(files)


def make_zips():
    import zipfile
    made = []
    for name in ('chrome', 'firefox-mv3', 'firefox-mv2'):
        folder = os.path.join(DIST, name)
        zip_path = os.path.join(DIST, 'sankaku-%s-%s.zip' % (name, VERSION))
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
            for base, _, names in os.walk(folder):
                for n in names:
                    full = os.path.join(base, n)
                    z.write(full, os.path.relpath(full, folder))
        made.append(zip_path)
    return made


def make_source_zip():
    """Архив исходников для ревьюеров AMO: из него воспроизводится сборка."""
    import zipfile
    zip_path = os.path.join(DIST, 'sankaku-source-%s.zip' % VERSION)
    items = ['build.py', 'README.md', 'README.en.md', 'CHANGELOG.md', 'LICENSE',
             'docs/REVIEWER_NOTES.md']
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in items:
            path = os.path.join(ROOT, rel)
            if os.path.exists(path):
                z.write(path, rel)
        for folder in ('src', 'test'):
            for base, _, names in os.walk(os.path.join(ROOT, folder)):
                if '__pycache__' in base:
                    continue
                for n in names:
                    full = os.path.join(base, n)
                    z.write(full, os.path.relpath(full, ROOT).replace('\\', '/'))
    return zip_path


if __name__ == '__main__':
    us_path, n_keys, n_langs = build()
    n_checked = check(us_path)
    print('версия %s · строк перевода %d · языков %d · проверено файлов %d'
          % (VERSION, n_keys, n_langs, n_checked))
    if '--zip' in sys.argv:
        for path in make_zips():
            print('zip:', os.path.relpath(path, ROOT))
    if '--zip' in sys.argv or '--source' in sys.argv:
        print('исходники:', os.path.relpath(make_source_zip(), ROOT))
