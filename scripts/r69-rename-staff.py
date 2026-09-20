#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
الجولة 69 — إعادة تسمية «كادر تمريضي» إلى «كادر صحي» في التطبيق كاملاً.
القاعدة: استبدال نصي حصراً في ملفات الشيفرة (العربية لا تكون معرفات) —
الترتيب من الأطول إلى الأقصر لمنع الكسور المتداخلة:
  1) الكادر التمريضي  → الكادر الصحي
  2) كوادر تمريضية    → كوادر صحية
  3) كادر تمريضي      → كادر صحي
  4) كادر التمريض     → كادر الصحي
لا يمس أي صيغة «تمريض» خارج عبارة «كادر» (مثل: التكليفات الطبية والتمريضية).
"""
import pathlib
import sys

ROOT = pathlib.Path('/home/z/my-project')
TARGETS = ['app', 'components', 'lib']
EXTS = {'.ts', '.tsx', '.js', '.mjs'}

REPLACEMENTS = [
    ('الكادر التمريضي', 'الكادر الصحي'),
    ('كوادر تمريضية', 'كوادر صحية'),
    ('كادر تمريضي', 'كادر صحي'),
    ('كادر التمريض', 'كادر الصحي'),
]

changed_files = 0
total_repl = 0

for target in TARGETS:
    base = ROOT / target
    if not base.exists():
        continue
    for path in base.rglob('*'):
        if path.suffix not in EXTS or not path.is_file():
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        original = text
        counts = []
        for old, new in REPLACEMENTS:
            n = text.count(old)
            if n:
                text = text.replace(old, new)
                counts.append(f'{old}×{n}')
                total_repl += n
        if text != original:
            path.write_text(text, encoding='utf-8')
            changed_files += 1
            rel = path.relative_to(ROOT)
            print(f'  {rel}: {", ".join(counts)}')

print(f'\nالمجموع: {total_repl} استبدالاً في {changed_files} ملفاً')

# تحقق نهائي: لا بقايا
leftover = 0
for target in TARGETS:
    base = ROOT / target
    if not base.exists():
        continue
    for path in base.rglob('*'):
        if path.suffix not in EXTS or not path.is_file():
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        for old, _ in REPLACEMENTS:
            if old in text:
                print(f'  بقايا! {path.relative_to(ROOT)}: {old}')
                leftover += 1
if leftover:
    print(f'فشل: {leftover} بقايا')
    sys.exit(1)
print('التحقق النهائي: صفر بقايا — التسمية مكتملة 100%')
