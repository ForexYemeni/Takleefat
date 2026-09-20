#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
الجولة 67 — باتش الإغلاق الكلي لنظام «فرصة»:
يضيف حرس assertForsahEnabled إلى كل مسارات «فرصة» بنقاط إدراج دقيقة،
مع تحديث الاستيرادات. الملفات الهدف فقط — لا مساس بأي مسار قائم آخر.
"""
import re
from pathlib import Path

ROOT = Path('/home/z/my-project')

def rel(p): return ROOT / p

def add_import(content: str, import_path: str, names: list[str]) -> str:
    """يضيف الأسماء إلى استيراد موجود أو ينشئ استيراداً جديداً."""
    changed = False
    # حالة 1: import { a, b } from 'path' في سطر واحد
    single = re.compile(r"import \{([^}]*)\} from '" + re.escape(import_path) + "'")
    m = single.search(content)
    if m:
        existing = [x.strip() for x in m.group(1).split(',') if x.strip()]
        missing = [n for n in names if n not in existing]
        if missing:
            merged = ', '.join(sorted(existing + missing, key=lambda s: s.lower()))
            content = single.sub(f"import {{ {merged} }} from '{import_path}'", content, count=1)
            changed = True
        return content
    # حالة 2: استيراد متعدد الأسطر
    multi = re.compile(r"(import \{)([^}]*?)(\}) from '" + re.escape(import_path) + "'", re.S)
    m = multi.search(content)
    if m:
        inner = m.group(2)
        existing = [x.strip() for x in inner.replace('\n', ' ').split(',') if x.strip()]
        missing = [n for n in names if n not in existing]
        if missing:
            existing += missing
            body = ',\n  '.join(existing)
            content = content[:m.start()] + f"import {{\n  {body},\n}} from '{import_path}'" + content[m.end():]
        return content
    # حالة 3: لا استيراد — أضف بعد آخر import
    names_line = f"import {{ {', '.join(names)} }} from '{import_path}'"
    lines = content.split('\n')
    last_import = max(i for i, l in enumerate(lines) if l.startswith('import ') or (l.startswith('  ') and "from '" in l))
    lines.insert(last_import + 1, names_line)
    return '\n'.join(lines)

def after_line(content: str, anchor: str, insert: str, occurrence: int = None) -> str:
    """يُدرج insert بعد أول سطر يطابق anchor بالكامل (أو كل التكرارات عند occurrence=None)."""
    lines = content.split('\n')
    out = []
    hits = 0
    for line in lines:
        out.append(line)
        if anchor.strip() in line.strip():
            hits += 1
            if occurrence is None or hits == occurrence:
                out.append(insert)
    return '\n'.join(out)

ROLE_ANCHOR = 'const role = session.user.activeRole ?? session.user.role'
ACTOR_PAT = re.compile(r"const actor = await requireForsahPermission\(session, '[^']+'\)")
GUARD_ROLE = '    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة (يعيد التشغيل من لوحته)\n    await assertForsahEnabled(role)'
GUARD_ACTOR = '    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة\n    await assertForsahEnabled(actor.role)'

jobs = [
    # (file, kind)  kind: role-guard | actor-guard | both | public
    ("app/api/opportunities/[id]/apply/route.ts", 'role'),
    ("app/api/opportunities/interviews/[id]/respond/route.ts", 'role'),
    ("app/api/me/opportunities/route.ts", 'role'),
    ("app/api/opportunities/applications/[id]/route.ts", 'role+actor'),
    ("app/api/opportunities/[id]/applications/route.ts", 'actor'),
    ("app/api/opportunities/[id]/interviews/route.ts", 'actor'),
    ("app/api/opportunities/[id]/selections/route.ts", 'actor'),
    ("app/api/opportunities/[id]/transaction/route.ts", 'actor'),
    ("app/api/forsah/dashboard/route.ts", 'actor'),
]

for path, kind in jobs:
    f = rel(path)
    src = f.read_text()
    if 'assertForsahEnabled' in src:
        print(f'SKIP (already patched): {path}')
        continue
    src = add_import(src, '@/lib/forsah/server', ['assertForsahEnabled'])
    if kind in ('role', 'role+actor'):
        src = after_line(src, ROLE_ANCHOR, GUARD_ROLE)
    if kind in ('actor', 'role+actor'):
        # أدرج الحرس بعد كل سطر actor (كل المعالجات GET/PATCH/POST)
        lines = src.split('\n')
        out = []
        for line in lines:
            out.append(line)
            if ACTOR_PAT.search(line):
                out.append('    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة')
                out.append('    await assertForsahEnabled(actor.role)')
        src = '\n'.join(out)
    f.write_text(src)
    n = src.count('assertForsahEnabled(')
    print(f'OK ({n} guards): {path}')

# ---------- المسار العام SEO: يُرجع قائمة فارغة عند الإغلاق (بدون خطأ — الصفحة العامة تبقى سليمة) ----------
pub = rel('app/api/opportunities/public/route.ts')
src = pub.read_text()
if 'isForsahEnabled' not in src:
    src = add_import(src, '@/lib/forsah/server', ['isForsahEnabled'])
    anchor = "    const take = Math.min(30, Math.max(6, Number(req.nextUrl.searchParams.get('take') ?? 12) || 12))"
    insert = ('\n    // الجولة 67: الإغلاق الكلي — الصفحة العامة تُرجع قائمة فارغة بلا خطأ\n'
              '    if (!(await isForsahEnabled())) {\n'
              "      return NextResponse.json({ opportunities: [], total: 0, page, take })\n"
              '    }')
    assert anchor in src, 'public anchor missing'
    src = src.replace(anchor, anchor + insert, 1)
    pub.write_text(src)
    print('OK: public route (empty list when closed)')
else:
    print('SKIP public')

print('DONE')
