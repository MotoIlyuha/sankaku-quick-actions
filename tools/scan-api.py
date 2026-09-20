#!/usr/bin/env python3
"""Собирает список адресов API сайта из его же бандла.

Документации у Sankaku нет, поэтому единственный достоверный источник — код
страницы. Скрипт скачивает главный бандл, находит вызовы api-клиента и печатает
адреса, сгруппированные по разделам. Результат лежит в docs/api.md.

    python tools/scan-api.py            # напечатать
    python tools/scan-api.py --md       # в том виде, в каком лежит в docs/api.md
"""
import collections
import re
import sys
import urllib.request

SITE = 'https://www.sankakucomplex.com/'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128'}
# вызовы вида l.A.get("reputation/ranking"), включая шаблоны с ${...}
CALL_RE = re.compile(r'\.(get|post|put|patch|delete)\(\s*([`"\'])([^`"\'\n]{2,120})\2')


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as f:
        return f.read().decode('utf-8', 'replace')


def endpoints(bundle):
    found = collections.defaultdict(set)
    for meth, _, url in CALL_RE.findall(bundle):
        url = url.strip()
        # у redux и immutable тоже есть .get(...) — адреса отличает косая черта;
        # начинающиеся с ${...} собраны из переменных, разобрать их без кода нельзя
        if '/' not in url or url.startswith(('./', 'http', '${')):
            continue
        found[url].add(meth.upper())
    return found


def group(found):
    by_section = collections.defaultdict(list)
    for url in sorted(found):
        section = url.lstrip('/').split('/')[0].split('?')[0]
        by_section[section].append((url, ','.join(sorted(found[url]))))
    return by_section


def main():
    html = fetch(SITE)
    src = re.search(r'src="(https://[^"]+/bundle\.[0-9a-f]+\.js)"', html)
    if not src:
        sys.exit('не нашёл адрес бандла на главной странице')
    print('#', src.group(1), file=sys.stderr)
    by_section = group(endpoints(fetch(src.group(1))))
    md = '--md' in sys.argv
    for section in sorted(by_section):
        print(('\n### %s\n' % section) if md else ('\n[%s]' % section))
        if md:
            print('| Метод | Адрес |\n|---|---|')
        for url, methods in by_section[section]:
            print(('| %s | `%s` |' % (methods, url)) if md else ('%-14s %s' % (methods, url)))


if __name__ == '__main__':
    main()
