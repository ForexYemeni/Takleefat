#!/usr/bin/env python3
"""تركيب بطاقة البريد الإلكتروني في ملفات الملف الشخصي الخمسة — الجولة 51"""
import re, pathlib

BASE = pathlib.Path('/home/z/my-project')
PAGES = [
    'app/nurse/profile/page.tsx',
    'app/doctor/profile/page.tsx',
    'app/receiver/profile/page.tsx',
    'app/supervisor/profile/page.tsx',
    'app/admin/profile/page.tsx',
]

IMPORT_ANCHOR = "import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'"
IMPORT_LINE = "\nimport { EmailAccountCard } from '@/components/shared/email-account-card'"
EMAIL_COMMENT = '{/* الجولة 51: بطاقة البريد الإلكتروني — إضافة/تأكيد/إعدادات الإشعارات (قناة إشعارات رسمية إضافية) */}\n      <EmailAccountCard />\n'

for rel in PAGES:
    p = BASE / rel
    src = p.read_text(encoding='utf-8')

    if 'EmailAccountCard' in src:
        print(f'skip (already wired): {rel}')
        continue

    # 1) الاستيراد بعد استيراد ui/card
    if IMPORT_ANCHOR not in src:
        raise SystemExit(f'import anchor missing in {rel}')
    src = src.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORT_LINE, 1)

    # 2) التركيب بعد إغلاق بطاقة بيانات الحساب (أول </Card> بعد وصف البطاقة «بيانات حساب»)
    m = re.search(r'بيانات حساب', src)
    if not m:
        raise SystemExit(f'account card description missing in {rel}')
    close_idx = src.find('</Card>', m.start())
    if close_idx == -1:
        raise SystemExit(f'closing Card tag missing in {rel}')
    insert_at = close_idx + len('</Card>')
    src = src[:insert_at] + '\n\n      ' + EMAIL_COMMENT.rstrip('\n') + '\n' + src[insert_at:]

    p.write_text(src, encoding='utf-8')
    print(f'wired: {rel}')

print('done')
