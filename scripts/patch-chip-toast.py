# -*- coding: utf-8 -*-
"""Round-19: patch push-status-chip toasts — reassure real notifications arrive the same way as the test."""
import io

PATH = '/home/z/my-project/components/pwa/push-status-chip.tsx'

with io.open(PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

out = []
patched = {'enable': 0, 'q': 0, 'colon': 0}
for line in lines:
    if 'يجب أن تراه الآن خارج التطبيق' in line:
        indent = line[: len(line) - len(line.lstrip())]
        out.append(indent + "toast.success('أرسلنا إشعاراً تجريبياً — كل الإشعارات الحقيقية ستصل بنفس الطريقة')\n")
        patched['enable'] += 1
        continue
    if 'إن لم يظهر خلال دقيقة' in line and line.lstrip().startswith('?'):
        indent = line[: len(line) - len(line.lstrip())]
        out.append(indent + "? 'أُرسل إشعار تجريبي إلى جهازك بنجاح — هكذا ستصل كل الإشعارات الحقيقية صوتاً وتنبيهاً حتى والتطبيق مغلق. إن لم يظهر خلال دقيقة: فعّل إشعارات المتصفح/التطبيق من إعدادات النظام وعطّل مُحسِّن البطارية ووضع عدم الإزعاج'\n")
        patched['q'] += 1
        continue
    if 'إن لم يظهر على جهاز معين' in line and line.lstrip().startswith(':'):
        indent = line[: len(line) - len(line.lstrip())]
        out.append(indent + ": `أُرسل إشعار تجريبي إلى ${test.delivered} أجهزة — هكذا ستصل كل الإشعارات الحقيقية حتى والتطبيق مغلق. إن لم يظهر على جهاز معين ففعّل إشعارات المتصفح من إعدادات النظام`\n")
        patched['colon'] += 1
        continue
    out.append(line)

if patched['enable'] != 1 or patched['q'] != 1 or patched['colon'] != 1:
    raise SystemExit('PATCH MISMATCH: %r' % patched)

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.writelines(out)

print('patched:', patched)
