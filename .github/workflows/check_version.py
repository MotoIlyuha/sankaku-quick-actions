# -*- coding: utf-8 -*-
"""Тег должен совпадать с версией в build.py."""
import io
import re
import sys

tag = sys.argv[1].lstrip('v')
version = re.search(r"VERSION = '([^']+)'", io.open('build.py', encoding='utf-8').read()).group(1)
if tag != version:
    raise SystemExit('Тег %s не совпадает с версией %s в build.py' % (tag, version))
print('версия совпадает:', version)
