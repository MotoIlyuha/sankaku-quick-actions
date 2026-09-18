# -*- coding: utf-8 -*-
"""Достаёт из CHANGELOG.md раздел нужной версии и дописывает инструкцию по установке."""
import io
import sys

tag = sys.argv[1]
out = sys.argv[2]
version = tag.lstrip('v')

lines = io.open('CHANGELOG.md', encoding='utf-8').read().split('\n')
body, taking = [], False
for line in lines:
    if line.startswith('## '):
        if taking:
            break
        taking = line[3:].strip().lstrip('v') == version
        continue
    if taking:
        body.append(line)

text = '\n'.join(body).strip() or 'См. CHANGELOG.md'

install = """

## Установка

**Tampermonkey** — открыть `sankaku-quick-actions.user.js` из файлов релиза,
Tampermonkey предложит установку и дальше будет обновляться сам.

**Chrome** — распаковать `sankaku-chrome-%s.zip`, затем `chrome://extensions`
→ «Режим разработчика» → «Загрузить распакованное расширение».

**Firefox** — `sankaku-firefox-mv3-%s.zip` для Firefox 128 и новее,
`sankaku-firefox-mv2-%s.zip` для старых сборок; распаковать и загрузить через
`about:debugging#/runtime/this-firefox` → «Загрузить временное дополнение».
""" % (version, version, version)

io.open(out, 'w', encoding='utf-8', newline='\n').write(text + install)
print(text[:200])
