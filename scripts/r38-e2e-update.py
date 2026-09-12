# -*- coding: utf-8 -*-
"""الجولة 38 — تحديث فحوص E2E: قلب التبادلية إلى اتجاه واحد + قسم 47 جديد"""
import sys

PATH = '/home/z/my-project/scripts/e2e-flow-test.sh'
src = open(PATH, encoding='utf-8').read()
orig_len = len(src)

# ---------- Block 1: قسم 43 (6) — رقم المستلم للكادر: دائماً مقفل ----------
b1_start = src.index('# (6) الجولة 35 — القفل التبادلي: رقم المستلم يُفتح للكادر حصراً بتكليف مسدد أكده الإدارة')
b1_end = src.index('# (7) المشرف: رقم الطبيب مقفل في تكليفه غير المسدد + شبكته كلها مقفلة')
BLOCK1 = '''# (6) الجولة 38 — القفل باتجاه واحد: بيانات اتصال المستلم/المشرف لا تُرسل للكادر أبداً
R38_NURSE_CONS=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
ok=all(a['receiver']['phone'] is None and a['receiver']['phoneLocked'] is True for a in d)
print('ok' if d and ok else 'bad')" 2>/dev/null)
check "الكادر: بيانات اتصال المستلم مقفلة في كل تكليفاته مهما كانت حالتها (قفل باتجاه واحد — الجولة 38)" "ok" "$R38_NURSE_CONS"

curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments -o "$DIR/r35_assign.json" 2>/dev/null
curl -s -b "$DIR/nurse.jar" $BASE/api/me/applications -o "$DIR/r35_apps.json" 2>/dev/null
R38_NURSE_APPS=$(python3 -c "
import json
apps=json.load(open('$DIR/r35_apps.json'))['applications']
ok=all(a['post']['receiver']['phone'] is None and a['post']['receiver']['phoneLocked'] is True for a in apps)
print('ok' if apps and ok else 'bad')" 2>/dev/null)
check "الكادر: تقديماته — بيانات اتصال المستلم قناع مقفل في كل التقديمات بلا استثناء" "ok" "$R38_NURSE_APPS"

'''
src = src[:b1_start] + BLOCK1 + src[b1_end:]

# ---------- Block 2: قسم 44 — الفتح/الغلق يُختبر على اتجاه المستلم فقط ----------
b2_start = src.index('echo "=========== 44) الجولة 35/36 — القفل التبادلي أثناء سير التكليف: بيانات الاتصال بعد تأكيد السداد ===========')
b2_end = src.index('# (د) الاتجاه المعاكس سليم بعد كل ذلك: المستلم ما زال يرى رقم الكادر في المسدد فقط')
BLOCK2 = '''echo "=========== 44) الجولة 38 — القفل باتجاه واحد: اتصال المستلم/المشرف لا يُفتح للكادر في أي حال ==========="
# منح إذن «موثوق جداً» للمستلم/المشرف يفتح أرقام الكوادر له حصراً ولا يفتح اتصاله
# هو للكادر إطلاقاً (الجولة 38) — ومفتاح السداد يتحكم باتجاه واحد فقط:
# المستلم يرى رقم الكادر في تكليفه الساري المسدد (يُختبر أدناه بالإلغاء والإعادة)

# مصدر الحقيقة: أول تكليف سارٍ مسدد غير منتهٍ للكادر الحالي
curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments -o "$DIR/r35_assign.json" 2>/dev/null
N35_PAID_ROW=$(python3 -c "
import json
d=json.load(open('$DIR/r35_assign.json'))['assignments']
rows=[a for a in d if a['paymentStatus']=='PAID' and a['status'] not in ('CANCELLED','COMPLETED')]
print(rows[0]['id']+'|'+rows[0]['receiver']['id'] if rows else '')" 2>/dev/null)
N35_AID=$(echo "$N35_PAID_ROW" | cut -d'|' -f1)
N35_RCVID=$(echo "$N35_PAID_ROW" | cut -d'|' -f2)
[ -n "$N35_AID" ] && check "سياق: يوجد تكليف مسدد للكادر مع مستلم (سياق الفحص)" "id" "id" || check "سياق: يوجد تكليف مسدد للكادر (سياق مطلوب)" "id" "null"

# (أ) القفل المطلق للكادر: بيانات المستلم قناع مقفل حتى في التكليف الساري المسدد
N38_LOCKED=$(python3 -c "
import json
d=json.load(open('$DIR/r35_assign.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
r=rows[0]['receiver'] if rows else None
print('ok' if r and r['phone'] is None and r['phoneLocked'] is True and '•' in r['phoneMasked'] else 'bad')" 2>/dev/null)
check "الكادر: في التكليف الساري المسدد بيانات المستلم قناع مقفل (القفل المطلق — الجولة 38)" "ok" "$N38_LOCKED"

# (ب) الرقم الحقيقي موجود لدى الإدارة لكنه لا يُرسل للكادر إطلاقاً — لا تسرب من الخادم
curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users/$N35_RCVID" -o "$DIR/r35_rcv_admin.json" 2>/dev/null
N35_ADMIN_PHONE=$(python3 -c "
import json
d=json.load(open('$DIR/r35_rcv_admin.json'))
print(d['user']['phone'])" 2>/dev/null)
N38_NOT_SENT=$(python3 -c "
import json
d=json.load(open('$DIR/r35_assign.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
r=rows[0]['receiver'] if rows else None
full='$N35_ADMIN_PHONE'
print('ok' if r and r['phone'] is None and full not in json.dumps(r) else 'bad')" 2>/dev/null)
check "استجابة الكادر خالية تماماً من رقم المستلم الحقيقي ($N35_ADMIN_PHONE) — الإخفاء من الخادم حصراً" "ok" "$N38_NOT_SENT"

# (ج) مفتاح السداد يتحكم باتجاه واحد: فتح/غلق رقم الكادر لدى المستلم حصراً
TOG_OFF=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$N35_AID -H "Content-Type: application/json" -d '{"paymentStatus":"UNPAID"}')
check "الإدارة تلغي تأكيد السداد → 200" "200" "$TOG_OFF"
curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments -o "$DIR/r35_r_off.json" 2>/dev/null
N38_R_LOCKED=$(python3 -c "
import json
d=json.load(open('$DIR/r35_r_off.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
print('ok' if rows and rows[0]['nurse']['phone'] is None and rows[0]['nurse']['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "بعد إلغاء التأكيد: رقم الكادر مقفل للمستلم (مفتاح السداد باتجاه المستلم فقط)" "ok" "$N38_R_LOCKED"
TOG_ON=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$N35_AID -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}')
check "الإدارة تعيد تأكيد السداد → 200" "200" "$TOG_ON"
curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments -o "$DIR/r35_r_on.json" 2>/dev/null
N38_R_OPEN=$(python3 -c "
import json
d=json.load(open('$DIR/r35_r_on.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
print('ok' if rows and rows[0]['nurse']['phone'] and rows[0]['nurse']['phoneLocked'] is False else 'bad')" 2>/dev/null)
check "بعد إعادة التأكيد: رقم الكادر مفتوح للمستلم مجدداً (الفتح مرتبط بكل تكليف على حدة)" "ok" "$N38_R_OPEN"

'''
src = src[:b2_start] + BLOCK2 + src[b2_end:]

# ---------- Block 3: قسم 47 قبل الملخص النهائي ----------
SECTION47 = '''
# ============================================================
# القسم 47 — الجولة 38: القفل باتجاه واحد + الإغلاق الفوري 100%
#   + ميزة «كوادر جهتي الصحية» (مجتمع كوادر لكل جهة صحية)
# ============================================================
echo "=========== 47) الجولة 38 — اتجاه واحد + إغلاق فوري + كوادر جهتي الصحية ==========="

# (1) اتجاه واحد صارم: منح إذن «موثوق جداً» للمستلم لا يفتح اتصاله هو للكادر أبداً
R38_GRANT=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$N35_RCVID -H "Content-Type: application/json" -d '{"trustedContactViewer":true}')
check "سياق: الإدارة تمنح المستلم إذن «موثوق جداً» → 200" "200" "$R38_GRANT"
curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments -o "$DIR/r38_n_trusted.json" 2>/dev/null
R38_ONEWAY=$(python3 -c "
import json
d=json.load(open('$DIR/r38_n_trusted.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
r=rows[0]['receiver'] if rows else None
print('ok' if r and r['phone'] is None and r['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "الكادر: حتى مع موثوقية المستلم نفسه تبقى بيانات اتصاله مقفلة عن الكادر (اتجاه واحد صارم)" "ok" "$R38_ONEWAY"
R38_REVOKE=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$N35_RCVID -H "Content-Type: application/json" -d '{"trustedContactViewer":false}')
check "سياق: الإدارة تسحب إذن الموثوق من المستلم → 200" "200" "$R38_REVOKE"

# (2) الإغلاق الفوري 100%: الطلب المباشر التالي بعد تغيير المفتاح يُغلق دون أي تحديث
TOG38_OFF=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$R37_ASSIGN -H "Content-Type: application/json" -d '{"paymentStatus":"UNPAID"}')
check "سياق: الإدارة تلغي تأكيد سداد تكليف بطاقة السداد → 200" "200" "$TOG38_OFF"
R38_INSTANT=$(curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
rows=[a for a in d if a['id']=='$R37_ASSIGN']
print('ok' if rows and rows[0]['nurse']['phone'] is None and rows[0]['nurse']['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "الإغلاق الفوري 100%: الطلب المباشر التالي بعد إلغاء التأكيد — رقم الكادر مقفل دون أي تحديث" "ok" "$R38_INSTANT"
TOG38_ON=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$R37_ASSIGN -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}')
check "سياق: الإدارة تعيد تأكيد السداد → 200" "200" "$TOG38_ON"

# (3) الإغلاق الفوري لقناة الموثوق: منح المشرف يفتح ثم سحبه يقفل في الطلب التالي المباشر
R38_TG=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$R36_SUP_ID -H "Content-Type: application/json" -d '{"trustedContactViewer":true}')
check "سياق: الإدارة تمنح المشرف إذن «موثوق جداً» → 200" "200" "$R38_TG"
R38_T_OPEN=$(curl -s -b "$DIR/supervisor.jar" "$BASE/api/workforce/$R34_DOC_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] and not p['phoneLocked'] else 'bad')" 2>/dev/null)
check "الموثوق جداً: رقم الطبيب مفتوح للمشرف فور المنح (قراءة مباشرة من قاعدة البيانات)" "ok" "$R38_T_OPEN"
R38_TR=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$R36_SUP_ID -H "Content-Type: application/json" -d '{"trustedContactViewer":false}')
check "سياق: الإدارة تسحب إذن المشرف → 200" "200" "$R38_TR"
R38_T_LOCK=$(curl -s -b "$DIR/supervisor.jar" "$BASE/api/workforce/$R34_DOC_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] is None and p['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "الإغلاق الفوري 100%: الطلب المباشر التالي بعد السحب — رقم الطبيب مقفل تماماً بلا أي تحديث" "ok" "$R38_T_LOCK"

# (4) فحوص ساكنة: تهيئة الإغلاق الفوري في مزود الاستعلامات + القفل المطلق في الخادم
R38_STALE=$(grep -c "staleTime: 0" components/shared/providers.tsx)
check "ui: بلا تخزين مؤقت للاستعلامات (staleTime: 0) — انعكاس فوري لأي منح/سحب" "1" "$R38_STALE"
R38_FOCUS=$(grep -c "refetchOnWindowFocus: 'always'" components/shared/providers.tsx)
check "ui: إعادة جلب فورية عند كل عودة للصفحة (refetchOnWindowFocus: 'always')" "1" "$R38_FOCUS"
R38_PULSE=$(grep -c "refetchInterval: 30 \\* 1000" components/shared/providers.tsx)
check "ui: نبض تحديث تلقائي كل 30 ثانية — الإغلاق يصل الشاشات المفتوحة دون تحديث يدوي" "1" "$R38_PULSE"
R38_HINT=$(grep -c "RECEIVER_CONTACT_LOCKED_HINT" lib/phone-privacy.ts)
check "خادم: تلميح خاص لقفل اتصال المستلم/المشرف لدى الكادر (الجولة 38)" "1" "$R38_HINT"
R38_FN=$(grep -c "phoneLocked: true" lib/phone-privacy.ts)
check "خادم: receiverPhoneForStaff قفل مطلق — لا يُرسل رقم المستلم/المشرف للكادر في أي حال" "1" "$R38_FN"
R38_UIHINT=$(grep -c "lockedHint={RECEIVER_CONTACT_LOCKED_HINT}" app/nurse/assignments/page.tsx)
check "ui: شريحة تواصل المستلم في صفحة الكادر تعرض تلميح الخصوصية الجديد" "1" "$R38_UIHINT"

# (5) كوادر جهتي الصحية — المستلم يرى مجتمع جهته بالإحصاءات الثلاث وشارات التوفر
R38_R_COM=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d.get('community') or {}
ok=set(c.keys())=={'accreditedNurses','accreditedDoctors','availableNow'} and c['availableNow']<=c['accreditedNurses']+c['accreditedDoctors']
rows=d.get('nurses',[])
ok=ok and all('available' in n for n in rows)
print('ok' if d.get('org') and ok else 'bad')" 2>/dev/null)
check "المستلم: مجتمع كوادر جهته — إحصاءات (الممرضون/الأطباء المعتمدون/المتاحون الآن) + شارة التوفر لكل صف" "ok" "$R38_R_COM"

# (6) الإدارة: مسار مجتمع الكوادر لأي جهة + اتساق الإحصاءات بين المسارين
R38_A_COM=$(curl -s -b "$DIR/admin.jar" "$BASE/api/org/community?hospitalId=$HOSP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d.get('stats') or {}
ok=set(c.keys())=={'accreditedNurses','accreditedDoctors','availableNow'}
ok=ok and d.get('org',{}).get('id','')!=''
ok=ok and all(('available' in x and 'phoneLocked' in x and x['phoneLocked'] is False) for x in d.get('cadres',[]))
print('ok' if ok else 'bad')" 2>/dev/null)
check "الإدارة: مسار مجتمع الكوادر لأي جهة (hospitalId) — إحصاءات كاملة وكوادر بأرقام كاملة وشارات توفر" "ok" "$R38_A_COM"

R38_CONSIST=$(python3 -c "
import json,subprocess,os
BASE=os.environ['BASE']; DIR=os.environ['DIR']
h=subprocess.run(['curl','-s','-b',DIR+'/admin.jar',BASE+'/api/admin/hospitals'],capture_output=True,text=True).stdout
c=subprocess.run(['curl','-s','-b',DIR+'/admin.jar',BASE+'/api/org/community?hospitalId='+os.environ['H38']],capture_output=True,text=True).stdout
hj=json.loads(h); cj=json.loads(c)
row=[x for x in hj['hospitals'] if x['id']==os.environ['H38']]
if not row: print('bad'); raise SystemExit
print('ok' if row[0].get('community')==cj.get('stats') else 'bad')" 2>/dev/null)
check "اتساق الإحصاءات: إحصاءات مجتمع الجهة في قائمة الإدارة تطابق مسار المجتمع حرفياً" "ok" "$R38_CONSIST"

# (7) صلاحيات المسار: الكادر مرفوع 403 — الإدارة بلا hospitalId مرفوضة 422 — بلا جهة استجابة فارغة أنيقة
R38_N403=$(code -b "$DIR/nurse.jar" $BASE/api/org/community)
check "حماية: الكادر التمريضي لا يصل لمسار مجتمع الكوادر → 403" "403" "$R38_N403"
R38_A422=$(code -b "$DIR/admin.jar" $BASE/api/org/community)
check "حماية: الإدارة بلا hospitalId → 422 برسالة واضحة" "422" "$R38_A422"
R38_EMPTY=$(curl -s -b "$DIR/sup34.jar" $BASE/api/org/community | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d.get('stats') or {}
print('ok' if d.get('org') is None and d.get('cadres')==[] and c.get('accreditedNurses')==0 and c.get('accreditedDoctors')==0 and c.get('availableNow')==0 else 'bad')" 2>/dev/null)
check "مسؤول بلا جهة مصرّح بها: استجابة فارغة أنيقة (صفر لكل العدادات) دون أخطاء" "ok" "$R38_EMPTY"

# (8) فحوص ساكنة للوحة مجتمع الكوادر في الواجهات الثلاث
R38_COMP=$([ -f components/shared/entity-cadre-community.tsx ] && grep -c "الممرضون المعتمدون\\|الأطباء المعتمدون\\|المتاحون الآن" components/shared/entity-cadre-community.tsx | awk '{print ($1>=3)?1:0}')
check "ui: لوحة مجتمع الكوادر ببطاقاتها الثلاث (الممرضون المعتمدون/الأطباء المعتمدون/المتاحون الآن)" "1" "$R38_COMP"
R38_USE3=$(grep -l "EntityCadreCommunity" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx components/admin/organizations-manager.tsx | wc -l | tr -d ' ')
check "ui: لوحة المجتمع مدمجة في (كوادر جهتي + أطباء جهتي + لوحة الجهات الإدارية)" "3" "$R38_USE3"
R38_API_NEW=$([ -f app/api/org/community/route.ts ] && grep -c "computeOrgCadreStats" app/api/org/community/route.ts)
check "خادم: مسار GET /api/org/community يعتمد محرك إحصاءات المجتمع المشترك" "1" "$R38_API_NEW"
R38_RSAPI=$(grep -c "community" app/api/receiver/staff/route.ts)
check "خادم: مسار كوادر الجهة يعيد إحصاءات المجتمع وشارة التوفر" "3" "$R38_RSAPI"
R38_AHAPI=$(grep -c "computeAllOrgCadreStats" app/api/admin/hospitals/route.ts)
check "خادم: قائمة جهات الإدارة تجمع إحصاءات كل المجتمعات دفعة واحدة" "1" "$R38_AHAPI"

'''
# أدخل قبل الملخص النهائي
tail_anchor = 'echo ""\necho "==========================================="'
k = src.rindex(tail_anchor)
src = src[:k] + SECTION47 + src[k:]

# متغيرات البيئة لفحص الاتساق — مرر BASE و DIR و H38 عبر export داخل السكربت؟
# الحل: استبدال فحص الاتساق باستدعاء python مباشر بقيم bash (بدون env)
old_consist = src[src.index("R38_CONSIST=$(python3 -c \""):src.index('check "اتساق الإحصاءات')]
new_consist = '''R38_CONSIST=$(H38="$HOSP" DIR="$DIR" BASE="$BASE" python3 -c "
import json,subprocess,os
BASE=os.environ['BASE']; DIR=os.environ['DIR']; H38=os.environ['H38']
h=subprocess.run(['curl','-s','-b',DIR+'/admin.jar',BASE+'/api/admin/hospitals'],capture_output=True,text=True).stdout
c=subprocess.run(['curl','-s','-b',DIR+'/admin.jar',BASE+'/api/org/community?hospitalId='+H38],capture_output=True,text=True).stdout
hj=json.loads(h); cj=json.loads(c)
row=[x for x in hj['hospitals'] if x['id']==H38]
if not row:
    print('bad'); raise SystemExit
print('ok' if row[0].get('community')==cj.get('stats') else 'bad')" 2>/dev/null)
'''
src = src.replace(old_consist, new_consist)

open(PATH, 'w', encoding='utf-8').write(src)
print('OK — E2E updated:', orig_len, '->', len(src), 'chars')
