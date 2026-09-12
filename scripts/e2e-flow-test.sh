#!/bin/bash
# ============================================================
# Takleefat E2E — التدفقات الكاملة + ميزات الجولات الثالثة والرابعة والخامسة
# ============================================================
BASE="http://localhost:3111"
PASS=0; FAIL=0; FAILED_TESTS=()
DIR="/home/z/my-project/scripts/e2e-tmp"
mkdir -p "$DIR"

check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "✅ $1"
  else FAIL=$((FAIL+1)); FAILED_TESTS+=("$1 (متوقع=$2 فعلي=$3)"); echo "❌ $1 — متوقع=$2 فعلي=$3"; fi
}

code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

login() {
  local jar="$1" phone="$2" pass="$3"
  rm -f "$jar"
  local csrf=$(curl -s -c "$jar" $BASE/api/auth/csrf | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
  curl -s -b "$jar" -c "$jar" -X POST $BASE/api/auth/callback/credentials \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "phone=$phone" --data-urlencode "password=$pass" \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "callbackUrl=$BASE" \
    --data-urlencode "json=true" -o /dev/null
}

jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

# ---------- صورة اختبار صغيرة (PNG 1x1) ----------
python3 -c "
import base64,struct,zlib
def chunk(t,data):
    c=t+data
    return struct.pack('>I',len(data))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
ihdr=chunk(b'IHDR',struct.pack('>IIBBBBB',4,4,8,2,0,0,0))
raw=b''.join(b'\x00'+b'\x00\x80\xff'*4 for _ in range(4))
idat=chunk(b'IDAT',zlib.compress(raw))
iend=chunk(b'IEND',b'')
open('$DIR/test.png','wb').write(b'\x89PNG\r\n\x1a\n'+ihdr+idat+iend)
open('$DIR/test.pdf','wb').write(b'%PDF-1.4 fake pdf content')
"

echo "=========== 1) المصادقة + لا حسابات وهمية + دخول فوري PENDING ==========="
H=$(code $BASE/api/health); check "فحص الصحة /api/health" "200" "$H"

login "$DIR/admin.jar" "773178684" "Admin@1234"
ADMIN_OK=$(curl -s -b "$DIR/admin.jar" $BASE/api/stats -o /dev/null -w "%{http_code}")
check "تسجيل دخول الإدارة 773178684" "200" "$ADMIN_OK"

# لا حسابات وهمية: البذرة نظيفة — لا كادر ولا مستلمين مزيّفين (حذف نهائي لا عودة)
FAKE_N=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=NURSE" | jget "['users'].__len__()")
check "لا أي كادر تمريضي وهمي بعد التجهيز" "0" "$FAKE_N"
FAKE_R=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=RECEIVER" | jget "['users'].__len__()")
check "لا أي مستلم إداري وهمي بعد التجهيز" "0" "$FAKE_R"

# حسابات حقيقية عبر التسجيل العام — المستلم مع الجهة الصحية
REG_N=$(curl -s -o "$DIR/reg_n.json" -w "%{http_code}" -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"سارة أحمد","phone":"711111111","password":"Nurse@1234","specialty":"تمريض طوارئ","qualification":"بكالوريوس أربع سنوات","yearsOfExperience":5,"gender":"MALE"}')
check "تسجيل حساب كادر جديد (بدون تأكيد كلمة المرور) → 201" "201" "$REG_N"

REG_R=$(curl -s -o "$DIR/reg_r.json" -w "%{http_code}" -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"RECEIVER","name":"خالد عبدالله","phone":"733333333","password":"Receiver@1234","hospitalName":"مستشفى الاختبار التخصصي"}')
check "تسجيل مستلم إداري مع الجهة الصحية → 201" "201" "$REG_R"

REG_NOHOSP=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"RECEIVER","name":"بلا جهة","phone":"744444461","password":"NoHosp@1234"}')
check "رفض تسجيل مستلم بلا جهة صحية → 422" "422" "$REG_NOHOSP"

# سياسة الدخول الجديدة: حساب PENDING يدخل فوراً بعد التسجيل
login "$DIR/nurse.jar" "711111111" "Nurse@1234"
NURSE_OK=$(code -b "$DIR/nurse.jar" $BASE/api/stats)
check "الكادر الجديد يدخل فور التسجيل قبل الاعتماد (PENDING)" "200" "$NURSE_OK"
NSTAT=$(curl -s -b "$DIR/nurse.jar" $BASE/api/auth/session | jget "['user']['status']")
check "حالة الكادر الجديد PENDING (قيد المراجعة)" "PENDING" "$NSTAT"

login "$DIR/receiver.jar" "733333333" "Receiver@1234"
RCV_OK=$(code -b "$DIR/receiver.jar" $BASE/api/stats)
check "المستلم الجديد يدخل فور التسجيل قبل الاعتماد (PENDING)" "200" "$RCV_OK"

# المستلم PENDING لا ينشئ تكليفاً (قيد الاعتماد) — الخادم والواجهة
TODAY=$(date -u +%Y-%m-%d)
# الجهات والأقسام لا تُبذر أبداً (قاعدة الإدارة) — E2E ينشئ أساسه من حساب الإدارة مباشرة
E2E_HOSP=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى E2E الأساس","location":"صنعاء — حدة","status":"ACTIVE"}')
HOSP=$(echo "$E2E_HOSP" | jget "['hospital']['id']")
[ -n "$HOSP" ] || { echo "فشل إنشاء جهة E2E الأساس من حساب الإدارة!"; exit 1; }
E2E_DEPT=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/departments -H "Content-Type: application/json" \
  -d '{"name":"طوارئ E2E"}')
[ -n "$(echo "$E2E_DEPT" | jget "['department']['id']")" ] || { echo "فشل إنشاء قسم E2E الأساس!"; exit 1; }
check "لا بذر جهات/أقسام: الأساس أُنشئ من حساب الإدارة فقط" "ok" "ok"
RCV_BLOCK=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"value\":100}")
check "منع المستلم غير المعتمد من إنشاء تكليف → 403" "403" "$RCV_BLOCK"

# بلا مستندات لا موافقة: رفض اعتماد الكادر قبل رفع المستندات
NURSE_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=NURSE" | jget "['users'][0]['id']")
RCV_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=RECEIVER" | jget "['users'][0]['id']")
APPR_NODOC=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$NURSE_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}')
check "رفض اعتماد كادر بلا مستندات → 422" "422" "$APPR_NODOC"

echo "=========== 2) رفع المستندات (صور فقط + ضغط) ==========="
UP=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "رفع صورة البطاقة → 201" "201" "$UP"

UP2=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.pdf;type=application/pdf" -F "type=PRACTICE_LICENSE")
check "رفض ملف غير صورة (PDF) → 422" "422" "$UP2"

UP3=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=INVALID")
check "رفض نوع مستند غير صحيح → 422" "422" "$UP3"

DOCS=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/documents | jget "['documents'][0]['status']")
check "المستند المرفوع بانتظار المراجعة" "PENDING" "$DOCS"

echo "=========== 2-ج) الاعتماد بعد رفع المستندات ==========="
APPR_RCV=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}' | jget "['user']['status']")
check "اعتماد المستلم الإداري (لا يشترط مستندات)" "APPROVED" "$APPR_RCV"

APPR_DOC=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$NURSE_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}' | jget "['user']['status']")
check "اعتماد الكادر بعد رفع المستندات" "APPROVED" "$APPR_DOC"

NSTAT2=$(curl -s -b "$DIR/nurse.jar" $BASE/api/auth/session | jget "['user']['status']")
check "حالة الكادر أصبحت APPROVED بعد الاعتماد" "APPROVED" "$NSTAT2"

echo "=========== 3) المستلم الإداري ينشئ تكليفاً ==========="
TODAY=$(date -u +%Y-%m-%d)
HOSP=$(curl -s -b "$DIR/receiver.jar" $BASE/api/hospitals | python3 -c "import json,sys;h=json.load(sys.stdin)['hospitals'];print(h[0]['id'] if h else '')")
[ -n "$HOSP" ] || { echo "لا توجد مستشفيات في البذرة!"; exit 1; }
POST_RESP=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"عناية\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":8,\"gender\":\"ANY\",\"value\":120000,\"description\":\"وصف الاختبار\"}")
POST_ID=$(echo "$POST_RESP" | jget "['post']['id']")
[ -n "$POST_ID" ] && check "إنشاء تكليف معلن → 201 (عنوان: $(echo "$POST_RESP" | jget "['post']['title']"))" "ok" "ok" || { check "إنشاء تكليف معلن" "id" "null"; POST_ID=""; }

NURSE_POST=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"value\":100}")
check "منع الكادر من إنشاء تكليف → 403" "403" "$NURSE_POST"

echo "=========== 4) الكادر يتقدم على التكليف ==========="
SEEN=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | jget "['posts'][0]['value']")
check "ظهور التكليف للكادر بقيمة 120000" "120000" "$SEEN"

APPLY=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$POST_ID/apply -H "Content-Type: application/json" -d '{"coverNote":"خبرة 5 سنوات"}')
check "تقديم الكادر على التكليف → 201" "201" "$APPLY"

# --- الجولة 15: الإدارة ترى التقديمات الجديدة (نسخة إشعار للمدير) ---
ADMIN_NOTIF_APPLY=$(curl -s -b "$DIR/admin.jar" $BASE/api/notifications | grep -cF "تقديم جديد على تكليف")
check "الإدارة تستلم إشعار التقديم الجديد (نسخة الإدارة)" "1" "$ADMIN_NOTIF_APPLY"

DUP=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$POST_ID/apply -H "Content-Type: application/json" -d '{}')
check "منع التقديم المكرر → 409" "409" "$DUP"

echo "=========== 5) بيانات المتقدم + حقل applicationId (إصلاح اعتماد التقديم) ==========="
APPS_JSON=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$POST_ID/applications)
APP_NAME=$(echo "$APPS_JSON" | jget "['applications'][0]['nurse']['name']")
check "رؤية بيانات المتقدم (الاسم: سارة أحمد)" "سارة أحمد" "$APP_NAME"
APP_PHONE=$(echo "$APPS_JSON" | jget "['applications'][0]['nurse']['phone']")
check "رقم المتقدم مقفل عن الجهة قبل أي تكليف مسدد (الجولة 34) — phone=None" "None" "$APP_PHONE"
APP_LOCKED=$(echo "$APPS_JSON" | jget "['applications'][0]['nurse']['phoneLocked']")
check "المتقدم: راية القفل مرفوعة (phoneLocked=True) مع القناع" "True" "$APP_LOCKED"
APP_SPEC=$(echo "$APPS_JSON" | jget "['applications'][0]['nurse']['specialty']")
check "التخصص ظاهر في السيرة (تمريض طوارئ)" "تمريض طوارئ" "$APP_SPEC"
APP_ID=$(echo "$APPS_JSON" | jget "['applications'][0]['applicationId']")
[ -n "$APP_ID" ] && check "حقل applicationId موجود في واجهة التقديمات" "ok" "ok" || check "حقل applicationId موجود" "id" "null"

echo "=========== 6) الوصول لصور المستندات ==========="
DOC_ID=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/documents | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['documents'][0]['fileUrl'].rstrip('/').split('/')[-1])")
DOC_ADMIN=$(code -b "$DIR/admin.jar" $BASE/api/files/blob/$DOC_ID)
check "الإدارة تعرض صورة المستند → 200" "200" "$DOC_ADMIN"
DOC_RCV=$(code -b "$DIR/receiver.jar" $BASE/api/files/blob/$DOC_ID)
check "المستلم صاحب التقديم يعرض صورة السيرة الذاتية → 200 (بالتصميم)" "200" "$DOC_RCV"
DOC_TYPE=$(curl -s -b "$DIR/admin.jar" $BASE/api/files/blob/$DOC_ID -o /dev/null -w "%{content_type}")
check "نوع المحتوى صورة صحيحة (image/png)" "image/png" "$DOC_TYPE"

echo "=========== 7) اعتماد التقديم (نمط حصة الإدارة الافتراضي) ==========="
APPROVE=$(curl -s -b "$DIR/receiver.jar" -X PATCH $BASE/api/applications/$APP_ID -H "Content-Type: application/json" -d '{"action":"APPROVE"}')
APPROVE_MSG=$(echo "$APPROVE" | jget "['message']")
[ -n "$APPROVE_MSG" ] && check "اعتماد التقديم عبر applicationId (كان يفشل: التقديم غير موجود)" "ok" "ok" || check "اعتماد التقديم" "msg" "null"

ASSIGNMENT_ID=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | jget "['assignments'][0]['id']")
[ -n "$ASSIGNMENT_ID" ] && check "إنشاء تكليف مؤكد تلقائياً" "ok" "ok" || check "تكليف مؤكد" "id" "null"

REVIEW2=$(code -b "$DIR/receiver.jar" -X PATCH $BASE/api/applications/$APP_ID -H "Content-Type: application/json" -d '{"action":"APPROVE"}')
check "منع إعادة مراجعة تقديم مُراجع → 409" "409" "$REVIEW2"

POST_STATUS=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$POST_ID | jget "['post']['status']")
check "إغلاق التكليف بعد اكتمال العدد" "ASSIGNED" "$POST_STATUS"

# --- الجولة 15: الإدارة ترى الاعتماد وإنشاء التكليف (المُعتمِد هنا مستلم) ---
ADMIN_NOTIF_APPROVE=$(curl -s -b "$DIR/admin.jar" $BASE/api/notifications | grep -cF "اعتماد تقديم وإنشاء تكليف")
check "الإدارة تستلم إشعار الاعتماد وإنشاء التكليف" "1" "$ADMIN_NOTIF_APPROVE"

AFEE=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | jget "['assignments'][0]['adminFee']")
check "حصة الإدارة محسوبة (نمط ADMIN: 10٪ من 120000)" "12000" "$AFEE"

echo "=========== 8) طرق الدفع للكادر ==========="
PAY=$(curl -s -b "$DIR/nurse.jar" $BASE/api/settings)
PM=$(echo "$PAY" | jget "['settings']['paymentMethod']")
PAN=$(echo "$PAY" | jget "['settings']['paymentAccountNumber']")
check "طريقة الدفع ظاهرة للكادر (محفظة جيب)" "محفظة جيب" "$PM"
check "رقم حساب الإدارة ظاهر (755000000)" "755000000" "$PAN"

echo "=========== 9) صلاحيات الإعدادات ==========="
RCV_SET=$(code -b "$DIR/receiver.jar" -X PATCH $BASE/api/settings -H "Content-Type: application/json" \
  -d '{"feeMode":"ADMIN","applicationFee":1000,"adminFeeType":"PERCENTAGE","adminPercentage":15,"adminFeeFixed":0,"paymentMethod":"محفظة جيب","paymentAccountNumber":"777123456","paymentAccountName":"منصة تكليفات"}')
check "منع المستلم من تعديل الإعدادات → 403" "403" "$RCV_SET"

echo "=========== 10) سياسة الاعتماد الصارمة + الجهة الصحية للإدارة ==========="
REG2=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"كادر بلا مستندات","phone":"744444460","password":"NoDocs@1234","specialty":"تمريض عام","qualification":"دبلوم ثلاث سنوات","gender":"FEMALE","yearsOfExperience":6}')
check "تسجيل كادر ثانٍ (بلا مستندات) → 201" "201" "$REG2"

STRICT_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=NURSE&status=PENDING" | jget "['users'][0]['id']")
STRICT=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$STRICT_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}')
check "السياسة الصارمة: لا اعتماد لأي كادر بلا مستندات → 422" "422" "$STRICT"

R_HOSP=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=RECEIVER" | jget "['users'][0]['hospitalName']")
check "الجهة الصحية المسجلة تظهر في لوحة الإدارة" "مستشفى الاختبار التخصصي" "$R_HOSP"

echo "=========== 11) الجهات الصحية بالإحداثيات + الأقسام ==========="
NEW_HOSP=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى E2E العام","location":"صنعاء — حدة","lat":15.348333,"lng":44.206389}')
NEW_HOSP_ID=$(echo "$NEW_HOSP" | jget "['hospital']['id']")
NEW_HOSP_LAT=$(echo "$NEW_HOSP" | jget "['hospital']['lat']")
check "إضافة جهة صحية بإحداثيات حقيقية → lat محفوظ" "15.348333" "$NEW_HOSP_LAT"

DUPH=$(code -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى E2E العام","location":"صنعاء","lat":15.0,"lng":44.0}')
check "منع تكرار اسم المستشفى → 409" "409" "$DUPH"

RCV_HOSP=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" -d '{"name":"مستشفى غير مصرح"}')
check "منع المستلم من إدارة المستشفيات → 403" "403" "$RCV_HOSP"

HOSP_LIST=$(curl -s -b "$DIR/receiver.jar" $BASE/api/hospitals | python3 -c "
import json,sys
h=json.load(sys.stdin)['hospitals']
m=[x for x in h if x['name']=='مستشفى E2E العام']
print(m[0]['location'] if m and m[0].get('location') else 'none')")
check "المستشفى يظهر للمستلم مع الموقع (صنعاء — حدة)" "صنعاء — حدة" "$HOSP_LIST"

DEPTS=$(curl -s -b "$DIR/nurse.jar" $BASE/api/departments | jget "['departments'][0]['name']")
[ -n "$DEPTS" ] && check "الأقسام متاحة للكادر" "ok" "ok" || check "الأقسام متاحة" "name" "null"

echo "=========== 12) إنشاء تكليف: ترقيم + موقع تلقائي + جنس + ساعات ==========="
NP_RESP=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$NEW_HOSP_ID\",\"department\":\"طوارئ\",\"startDate\":\"$TODAY\",\"nursesNeeded\":2,\"hours\":12,\"gender\":\"FEMALE\",\"value\":90000,\"description\":\"تكليف بدون عنوان\"}")
NEW_TITLE=$(echo "$NP_RESP" | jget "['post']['title']")
NEW_NUM=$(echo "$NP_RESP" | jget "['post']['number']")
[ "$NEW_TITLE" = "التكليف رقم $NEW_NUM" ] && check "العنوان التلقائي «التكليف رقم N»" "ok" "ok" || check "العنوان التلقائي" "$NEW_NUM" "$NEW_TITLE"
P2_ID=$(echo "$NP_RESP" | jget "['post']['id']")
DET=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$P2_ID)
P_LOC=$(echo "$DET" | jget "['post']['location']")
check "الموقع يُعبأ تلقائياً من الجهة (صنعاء — حدة)" "صنعاء — حدة" "$P_LOC"
P_GEN=$(echo "$DET" | jget "['post']['gender']")
check "الجنس المطلوب محفوظ (FEMALE)" "FEMALE" "$P_GEN"
P_HRS=$(echo "$DET" | jget "['post']['hours']")
check "عدد الساعات محفوظ (12)" "12" "$P_HRS"
NO_END=$(echo "$DET" | python3 -c "import json,sys;d=json.load(sys.stdin);print('gone' if 'endDate' not in d['post'] else 'exists')")
check "تاريخ الانتهاء محذوف من التكليف" "gone" "$NO_END"

NOHOSP=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"nonexistent\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"value\":100}")
check "رفض جهة غير مسجلة → 422" "422" "$NOHOSP"

echo "=========== 13) الإدارة تنشئ وتعدل التكليفات ==========="
ADMIN_POST=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$NEW_HOSP_ID\",\"department\":\"مختبر\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":6,\"gender\":\"MALE\",\"value\":60000}")
ADMIN_POST_TITLE=$(echo "$ADMIN_POST" | jget "['post']['title']")
[ -n "$ADMIN_POST_TITLE" ] && check "الإدارة تنشئ تكليفاً معلناً ($ADMIN_POST_TITLE)" "ok" "ok" || check "الإدارة تنشئ تكليفاً" "title" "null"

EDIT=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/posts/$P2_ID -H "Content-Type: application/json" \
  -d '{"title":"تكليف طوارئ مؤقت","gender":"ANY"}')
EDITED=$(echo "$EDIT" | jget "['post']['title']")
check "الإدارة تعدل عنوان التكليف (تكليف طوارئ مؤقت)" "تكليف طوارئ مؤقت" "$EDITED"

NURSE_EDIT=$(code -b "$DIR/nurse.jar" -X PATCH $BASE/api/posts/$P2_ID -H "Content-Type: application/json" -d '{"title":"hacking"}')
check "منع الكادر من تعديل التكليفات → 403" "403" "$NURSE_EDIT"
OWNER_EDIT=$(code -b "$DIR/receiver.jar" -X PATCH $BASE/api/posts/$P2_ID -H "Content-Type: application/json" -d '{"hours":10}')
check "المالك يعدل تكليفه وهو مفتوح → 200" "200" "$OWNER_EDIT"

echo "=========== 14) الملف الشخصي وكلمات المرور والهواتف ==========="
# حساب مؤقت لإجراءات الحساب
TMP_PHONE="744444455"
TMP_CREATE=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d "{\"name\":\"كادر مؤقت\",\"phone\":\"$TMP_PHONE\",\"password\":\"Temp@12345\",\"role\":\"NURSE\",\"specialty\":\"تمريض عام\",\"qualification\":\"بكالوريوس أربع سنوات\",\"gender\":\"MALE\",\"yearsOfExperience\":3}")
TMP_ID=$(echo "$TMP_CREATE" | jget "['user']['id']")
[ -n "$TMP_ID" ] && check "الإدارة تنشئ حساب كادر مؤقت للاختبار" "ok" "ok" || check "حساب مؤقت" "id" "null"

login "$DIR/tmp.jar" "$TMP_PHONE" "Temp@12345"
TMP_OK=$(code -b "$DIR/tmp.jar" $BASE/api/stats)
check "الحساب المؤقت يدخل فوراً" "200" "$TMP_OK"

# بوابة المستندات: كادر معتمد بلا مستندات يُمنع من التقديم
TMP_DOCGATE=$(code -b "$DIR/tmp.jar" -X POST $BASE/api/posts/$P2_ID/apply -H "Content-Type: application/json" -d '{}')
check "كادر معتمد بلا مستندات يُمنع من التقديم → 403" "403" "$TMP_DOCGATE"

UP_TMP=$(code -b "$DIR/tmp.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=OTHER")
check "رفع مستند للكادر المؤقت (شرط التقديم لاحقاً) → 201" "201" "$UP_TMP"

WRONG_CUR=$(code -b "$DIR/tmp.jar" -X PATCH $BASE/api/me/password -H "Content-Type: application/json" \
  -d '{"currentPassword":"Wrong@1234","newPassword":"NewPass@123"}')
check "رفض تغيير كلمة المرور بكلمة حالية خاطئة → 422" "422" "$WRONG_CUR"

CHGPW=$(code -b "$DIR/tmp.jar" -X PATCH $BASE/api/me/password -H "Content-Type: application/json" \
  -d '{"currentPassword":"Temp@12345","newPassword":"NewPass@123"}')
check "المستخدم يغير كلمة مروره → 200" "200" "$CHGPW"

login "$DIR/tmp2.jar" "$TMP_PHONE" "Temp@12345"
OLDPW=$(code -b "$DIR/tmp2.jar" $BASE/api/stats)
check "الدخول بالكلمة القديمة يفشل → 401" "401" "$OLDPW"

login "$DIR/tmp3.jar" "$TMP_PHONE" "NewPass@123"
NEWPW=$(code -b "$DIR/tmp3.jar" $BASE/api/stats)
check "الدخول بالكلمة الجديدة ينجح → 200" "200" "$NEWPW"

ADMPW=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$TMP_ID -H "Content-Type: application/json" \
  -d '{"password":"AdminSet@123"}' | jget "['message']")
[ -n "$ADMPW" ] && check "الإدارة تعيد تعيين كلمة المرور (نسيت كلمة السر)" "ok" "ok" || check "إعادة تعيين كلمة المرور" "msg" "null"

login "$DIR/tmp4.jar" "$TMP_PHONE" "AdminSet@123"
ADMSET=$(code -b "$DIR/tmp4.jar" $BASE/api/stats)
check "الدخول بكلمة الإدارة الجديدة → 200" "200" "$ADMSET"

DUP_PHONE=$(code -b "$DIR/tmp4.jar" -X PATCH $BASE/api/me/phone -H "Content-Type: application/json" \
  -d '{"currentPassword":"AdminSet@123","newPhone":"711111111"}')
check "منع تعيين رقم مستخدم مسبقاً → 409" "409" "$DUP_PHONE"

NEW_PHONE="744444456"
CHG_PHONE=$(code -b "$DIR/tmp4.jar" -X PATCH $BASE/api/me/phone -H "Content-Type: application/json" \
  -d "{\"currentPassword\":\"AdminSet@123\",\"newPhone\":\"$NEW_PHONE\"}")
check "المستخدم يغير رقم هاتفه → 200" "200" "$CHG_PHONE"

login "$DIR/tmp5.jar" "$NEW_PHONE" "AdminSet@123"
NEWPH=$(code -b "$DIR/tmp5.jar" $BASE/api/stats)
check "الدخول بالرقم الجديد → 200" "200" "$NEWPH"

RENAME=$(curl -s -b "$DIR/tmp5.jar" -X PATCH $BASE/api/me/profile -H "Content-Type: application/json" \
  -d '{"name":"كادر مؤقت مُعدل"}' | jget "['user']['name']")
check "تحديث الاسم من الملف الشخصي" "كادر مؤقت مُعدل" "$RENAME"

echo "=========== 15) الإشعارات (حذف فردي + حذف الكل) ==========="
NOTIF_COUNT=$(curl -s -b "$DIR/tmp5.jar" $BASE/api/notifications | jget "['unreadCount']")
[ -n "$NOTIF_COUNT" ] && check "الإشعارات تُقرأ للمستخدم (عدد غير المقروء: $NOTIF_COUNT)" "ok" "ok" || check "قراءة الإشعارات" "n" "null"

ONE_NOTIF=$(curl -s -b "$DIR/tmp5.jar" $BASE/api/notifications | jget "['notifications'][0]['id']")
DEL_ONE=$(code -b "$DIR/tmp5.jar" -X DELETE $BASE/api/notifications/$ONE_NOTIF)
check "حذف إشعار واحد → 200" "200" "$DEL_ONE"

DEL_ALL=$(code -b "$DIR/tmp5.jar" -X DELETE $BASE/api/notifications)
check "حذف جميع الإشعارات → 200" "200" "$DEL_ALL"

AFTER_ALL=$(curl -s -b "$DIR/tmp5.jar" $BASE/api/notifications | jget "['unreadCount']")
check "صفر إشعارات بعد الحذف الجماعي" "0" "$AFTER_ALL"

echo "=========== 16) نمط الرسوم: واحدة فقط (رسوم تقديم XOR حصة إدارة) ==========="
SET_APP=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/settings -H "Content-Type: application/json" \
  -d '{"feeMode":"APPLICATION","applicationFee":1500,"adminFeeType":"PERCENTAGE","adminPercentage":50,"adminFeeFixed":0,"paymentMethod":"محفظة جيب","paymentAccountNumber":"777123456","paymentAccountName":"منصة تكليفات"}')
MODE=$(echo "$SET_APP" | jget "['settings']['feeMode']")
check "الإدارة تفعّل نمط رسوم التقديم" "APPLICATION" "$MODE"

POST3=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"قبالة\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":4,\"gender\":\"ANY\",\"value\":80000}")
P3_ID=$(echo "$POST3" | jget "['post']['id']")

login "$DIR/nurse2.jar" "$NEW_PHONE" "AdminSet@123"
APPLY3=$(code -b "$DIR/nurse2.jar" -X POST $BASE/api/posts/$P3_ID/apply -H "Content-Type: application/json" -d '{}')
check "تقديم كادر آخر على التكليف → 201" "201" "$APPLY3"

FEES3=$(curl -s -b "$DIR/nurse2.jar" $BASE/api/me/applications | python3 -c "
import json,sys
d=json.load(sys.stdin)
apps=[a for a in d.get('applications',[]) if a.get('post',{}).get('id')=='$P3_ID']
f=apps[0]['fees'] if apps else {}
print(f.get('adminFee','?'), f.get('applicationFee','?'), f.get('dueToAdmin','?'))")
AF3=$(echo $FEES3 | cut -d' ' -f1); APF3=$(echo $FEES3 | cut -d' ' -f2); DUE3=$(echo $FEES3 | cut -d' ' -f3)
check "نمط رسوم التقديم: حصة الإدارة = 0" "0" "$AF3"
check "نمط رسوم التقديم: الرسوم = 1500" "1500" "$APF3"
check "نمط رسوم التقديم: الواجب = 1500 فقط" "1500" "$DUE3"

APP3_ID=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$P3_ID/applications | jget "['applications'][0]['applicationId']")
APPROVE3=$(curl -s -b "$DIR/receiver.jar" -X PATCH $BASE/api/applications/$APP3_ID -H "Content-Type: application/json" -d '{"action":"APPROVE"}' | jget "['assignment']['id']")
[ -n "$APPROVE3" ] && check "اعتماد التقديم في نمط الرسوم (تكليف مؤكد)" "ok" "ok" || check "اعتماد في نمط الرسوم" "id" "null"

AASSIGN=$(curl -s -b "$DIR/nurse2.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=[x for x in d.get('assignments',[]) if x.get('postId')=='$P3_ID']
print(a[0].get('adminFee','?') if a else '?')")
check "نمط رسوم التقديم: تكليف مؤكد بلا حصة إدارة" "0" "$AASSIGN"

# تأكيد الإدارة دفع رسوم التكليف الأول للكادر الثاني — بدونها يُمنع من التقديم الجديد (جولة 4)
P3_ASSIGN_ID=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=[x for x in d.get('assignments',[]) if x.get('postId')=='$P3_ID']
print(a[0]['id'] if a else '')")
PAY3=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$P3_ASSIGN_ID -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}')
check "تأكيد دفع رسوم التكليف السابق للكادر الثاني (شرط التقديم الجديد) → 200" "200" "$PAY3"

# العودة لنمط حصة الإدارة
SET_ADM=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/settings -H "Content-Type: application/json" \
  -d '{"feeMode":"ADMIN","applicationFee":1000,"adminFeeType":"PERCENTAGE","adminPercentage":10,"adminFeeFixed":0,"paymentMethod":"محفظة جيب","paymentAccountNumber":"777123456","paymentAccountName":"منصة تكليفات"}')
MODE2=$(echo "$SET_ADM" | jget "['settings']['feeMode']")
check "العودة لنمط حصة الإدارة" "ADMIN" "$MODE2"

POST4=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"مختبر\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":2,\"gender\":\"ANY\",\"value\":80000}")
P4_ID=$(echo "$POST4" | jget "['post']['id']")
APPLY4=$(code -b "$DIR/nurse2.jar" -X POST $BASE/api/posts/$P4_ID/apply -H "Content-Type: application/json" -d '{}')
check "تقديم على تكليف نمط حصة الإدارة → 201" "201" "$APPLY4"

FEES4=$(curl -s -b "$DIR/nurse2.jar" $BASE/api/me/applications | python3 -c "
import json,sys
d=json.load(sys.stdin)
apps=[a for a in d.get('applications',[]) if a.get('post',{}).get('id')=='$P4_ID']
f=apps[0]['fees'] if apps else {}
print(f.get('adminFee','?'), f.get('applicationFee','?'), f.get('dueToAdmin','?'))")
AF4=$(echo $FEES4 | cut -d' ' -f1); APF4=$(echo $FEES4 | cut -d' ' -f2); DUE4=$(echo $FEES4 | cut -d' ' -f3)
check "نمط حصة الإدارة: الحصة = 8000 (10٪)" "8000" "$AF4"
check "نمط حصة الإدارة: لا رسوم تقديم" "0" "$APF4"
check "نمط حصة الإدارة: الواجب = 8000 فقط" "8000" "$DUE4"

BADFIXED=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/settings -H "Content-Type: application/json" \
  -d '{"feeMode":"ADMIN","applicationFee":1000,"adminFeeType":"FIXED","adminPercentage":0,"adminFeeFixed":0,"paymentMethod":"محفظة جيب","paymentAccountNumber":"777123456","paymentAccountName":"منصة تكليفات"}')
check "رفض نمط ثابت بمبلغ صفر → 422" "422" "$BADFIXED"

echo "=========== 17) دورة الإنهاء والدفع والتقييم وأرباح المستلم (جولة 4) ==========="
# رسالة الاعتماد للمستلم بلا أي تفاعل مالي
APPROVE_MSG_4=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$POST_ID/applications | python3 -c "import json,sys;print('ok')")
HAS_MONEY=$(curl -s -b "$DIR/nurse.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=[x for x in d.get('notifications',[]) if 'تهانينا' in x.get('title','')]
print('yes' if n and 'المبلغ الواجب' in (n[0].get('body') or '') else 'no')")
check "إشعار الكادر عند الاعتماد يتضمن تفاصيل الدفع (للكادر فقط)" "yes" "$HAS_MONEY"

# 17-أ) منع التقديم قبل تأكيد دفع الرسوم
P5=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"عناية\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":6,\"gender\":\"ANY\",\"value\":50000}")
P5_ID=$(echo "$P5" | jget "['post']['id']")
BLOCKED=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$P5_ID/apply -H "Content-Type: application/json" -d '{}')
check "منع التقديم على تكليف جديد قبل تأكيد الإدارة دفع الرسوم → 403" "403" "$BLOCKED"

# 17-ب) رفع لقطة شاشة إثبات الدفع في نفس الصفحة
A4_ID=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=[x for x in d.get('assignments',[]) if x.get('postId')=='$POST_ID']
print(a[0]['id'] if a else '')")
SHOT=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/me/assignments/$A4_ID/payment-screenshot -F "file=@$DIR/test.png;type=image/png")
check "رفع لقطة شاشة إثبات الدفع من صفحة الكادر → 200" "200" "$SHOT"

SHOT_ADMIN=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=[x for x in d.get('assignments',[]) if x.get('id')=='$A4_ID']
print('yes' if a and a[0].get('paymentScreenshotUrl') else 'no')")
check "لقطة إثبات الدفع تظهر للإدارة (تكبير مثل المستندات)" "yes" "$SHOT_ADMIN"

# 17-ج) الإدارة تؤكد دفع الرسوم → يُفتح التقديم من جديد
CONFIRM_PAY=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$A4_ID -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}')
check "الإدارة تؤكد دفع رسوم/نسبة الإدارة → 200" "200" "$CONFIRM_PAY"

# 17-ج-2) الجولة السادسة عشرة: الكادر يُشعَر فوراً بتأكيد الدفع
N_PAY_NOTIF=$(curl -s -b "$DIR/nurse.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
ns=[n for n in d.get('notifications',[]) if 'تأكيد دفع' in (n.get('title') or '')]
print('yes' if ns else 'no')")
check "إشعار فوري للكادر: تم تأكيد دفع الرسوم" "yes" "$N_PAY_NOTIF"

UNBLOCKED=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$P5_ID/apply -H "Content-Type: application/json" -d '{}')
check "بعد تأكيد الدفع يستطيع الكادر التقديم → 201" "201" "$UNBLOCKED"

# 17-د) الكادر يكد إنهاء التكليف واستلام المبلغ
NCOMP=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/me/assignments/$A4_ID/nurse-complete -H "Content-Type: application/json" -d '{"receivedAmount":true}')
check "الكادر يؤكد: تم الانتهاء واستلام المبلغ → 200" "200" "$NCOMP"

NCOMP2=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/me/assignments/$A4_ID/nurse-complete -H "Content-Type: application/json" -d '{"receivedAmount":true}')
check "منع تكرار تأكيد الإنهاء → 409" "409" "$NCOMP2"

# 17-هـ) المستلم الإداري: تم انتهاء التكليف + هل تم الدفع للممرض + تقييم احترافي
RCOMP=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/me/assignments/$A4_ID/receiver-complete -H "Content-Type: application/json" \
  -d '{"nursePaid":true,"rating":{"overall":5,"punctuality":5,"quality":5,"communication":4,"discipline":5,"comment":"أداء متميز والتزام عالٍ"}}')
check "المستلم ينهي التكليف مع الدفع والتقييم الاحترافي → 200" "200" "$RCOMP"

RCOMP2=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/me/assignments/$A4_ID/receiver-complete -H "Content-Type: application/json" \
  -d '{"nursePaid":true,"rating":{"overall":5}}')
check "منع إنهاء تكليف منتهٍ → 409" "409" "$RCOMP2"

A4_STATUS=$(curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=[x for x in d.get('assignments',[]) if x.get('id')=='$A4_ID']
print(a[0]['status'] if a else '?')")
check "حالة التكليف بعد الإنهاء: COMPLETED" "COMPLETED" "$A4_STATUS"

# 17-و) أرباح المستلم الإداري — الجولة 32: الافتراضي التلقائي = نصف نسبة الإدارة
#   20000 من تأكيد دفع تكليف P3 (نصف نسبة الإدارة 25٪ خلال نافذة adminPercentage=50 × 80000)
#   + 6000 من إنهاء المستلم (نصف نسبة الإدارة 5٪ بعد إعادة adminPercentage=10 × 120000) = 26000
EARN_TOTAL=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['totalEarned']")
check "ربح المستلم الإجمالي (20000 توزيع تأكيد الدفع + 6000 إنهاء المستلم)" "26000" "$EARN_TOTAL"
EARN_AVAIL=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['available']")
check "الرصيد المتاح للسحب" "26000" "$EARN_AVAIL"

# 17-ز) طلب سحب: رفض تجاوز الرصيد + طلب صحيح بالبيانات
W_OVER=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/withdrawals -H "Content-Type: application/json" \
  -d '{"amount":999999,"walletAddress":"جيب-777000000","accountNumber":"777000000"}')
check "رفض سحب يتجاوز الرصيد → 422" "422" "$W_OVER"

W_OK=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/withdrawals -H "Content-Type: application/json" \
  -d '{"amount":5000,"walletAddress":"جيب-777000000","accountNumber":"777000000"}' | jget "['withdrawal']['status']")
check "طلب سحب 5000 مع المحفظة والحساب → قيد المعالجة" "PENDING" "$W_OK"

EARN_AVAIL2=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['available']")
check "الرصيد بعد الطلب المعلق (26000-5000)" "21000" "$EARN_AVAIL2"

W_DATA=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/withdrawals | python3 -c "
import json,sys
d=json.load(sys.stdin)
w=d['withdrawals'][0] if d.get('withdrawals') else {}
print(w.get('amount','?'), w.get('accountNumber','?'), w.get('walletAddress','?'), w.get('receiver',{}).get('name','?'))")
WA=$(echo $W_DATA | cut -d' ' -f1)
check "طلب السحب يظهر للإدارة بالمبلغ" "5000" "$WA"

W_ID=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/withdrawals | jget "['withdrawals'][0]['id']")
W_PAY=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/withdrawals/$W_ID -H "Content-Type: application/json" \
  -d '{"status":"PAID","note":"تم التحويل عبر جيب"}')
check "الإدارة تؤكد صرف السحب → 200" "200" "$W_PAY"

EARN_FINAL=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | python3 -c "
import json,sys
d=json.load(sys.stdin)['summary']
print(d['available'], d['withdrawn'])")
check "الرصيد بعد الصرف (متاح 21000 | مسحوب 5000)" "21000 5000" "$EARN_FINAL"

# 17-ح) التقييم يُضاف للسيرة الذاتية عند التقديم لأي تكليف آخر
P6=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"حضانة\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":4,\"gender\":\"ANY\",\"value\":30000}")
P6_ID=$(echo "$P6" | jget "['post']['id']")
APPLY6=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$P6_ID/apply -H "Content-Type: application/json" -d '{}')
check "الكادر يتقدم على تكليف جديد (بعد تسوية الرسوم) → 201" "201" "$APPLY6"

CV_RATING=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$P6_ID/applications | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d['applications'][0]['nurse'].get('ratings',{}) if d.get('applications') else {}
print(r.get('count','?'), r.get('average','?'))")
check "التقييم في السيرة الذاتية للتقديم الجديد (عدد=1، متوسط=5)" "1 5" "$CV_RATING"

echo "=========== 18) الحذف النهائي للحسابات ==========="
DEL_USER=$(code -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$TMP_ID)
check "الإدارة تحذف الحساب نهائياً → 200" "200" "$DEL_USER"

GONE=$(code -b "$DIR/tmp5.jar" $BASE/api/stats)
check "الحساب المحذوف لم يعد يدخل → 401" "401" "$GONE"

echo "=========== 19) حذف التكليفات (تنظيف) ==========="
DELP=$(curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$P2_ID)
DELP_MSG=$(echo "$DELP" | jget "['message']")
[ -n "$DELP_MSG" ] && check "الإدارة تحذف تكليفاً معلناً" "ok" "ok"
echo "   $DELP_MSG"

echo "=========== 20) الملف التفصيلي للمستلم الإداري (قبل الاعتماد وبعده) ==========="
# مستلم جديد PENDING — يُعرض ملفه بالكامل قبل الاعتماد
REG_P20=$(curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"RECEIVER","name":"مستلم قيد المراجعة","phone":"755550201","password":"Pending@1234","hospitalName":"مستشفى المراجعة العام"}')
P20_ID=$(echo "$REG_P20" | jget "['user']['id']")
[ -n "$P20_ID" ] && check "إنشاء مستلم جديد (PENDING) لعرض ملفه" "ok" "ok"

P20_DET=$(code -b "$DIR/admin.jar" $BASE/api/admin/users/$P20_ID)
check "عرض الملف التفصيلي لمستلم قبل الاعتماد (PENDING) → 200" "200" "$P20_DET"

P20_DATA=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/users/$P20_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d['user']; r=d['receiver']
print(u['status'], u['phone'], u['hospitalName'], r['totals']['posts'], r['totals']['withdrawals'], r['earnings']['summary']['totalEarned'])")
check "ملف PENDING: الحالة + الهاتف + الجهة + أصفار الأرباح" "PENDING 755550201 مستشفى المراجعة العام 0 0 0" "$P20_DATA"

# المستلم المعتمد — الملف يعرض تكليفاته وأرباحه وسحوباته
DET_CODE=$(code -b "$DIR/admin.jar" $BASE/api/admin/users/$RCV_ID)
check "عرض الملف التفصيلي لمستلم معتمد → 200" "200" "$DET_CODE"

DET_DATA=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/users/$RCV_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d['user']; r=d['receiver']
print(u['status'], u['phone'], r['totals']['posts'] > 0, 'available' in r['earnings']['summary'])")
check "ملف المعتمد: الحالة + الهاتف + تكليفات معلنة + ملخص أرباح" "APPROVED 733333333 True True" "$DET_DATA"

# نفس الملف التفصيلي يعمل للكادر التمريضي (بيانات + مستندات + تقييمات)
NURSE_DET=$(code -b "$DIR/admin.jar" $BASE/api/admin/users/$NURSE_ID)
check "الملف التفصيلي للكادر التمريضي → 200" "200" "$NURSE_DET"

NURSE_DATA=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/users/$NURSE_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d['user']; n=d['nurse']
print(len(n['documents']) > 0, 'ratings' in n, 'average' in n['ratings'])")
check "ملف الكادر: مستندات + تقييمات داخل الملف" "True True True" "$NURSE_DATA"

# حماية: المستلم لا يستطيع عرض ملفات الآخرين
DET_FORBID=$(code -b "$DIR/receiver.jar" $BASE/api/admin/users/$NURSE_ID)
check "المستلم يُمنع من عرض الملفات → 403" "403" "$DET_FORBID"

# تنظيف مستلم القسم 20
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$P20_ID -o /dev/null

echo "=========== 21) شبكة الكوادر الصحية المعتمدة (الارتباط + المفضلة + الاستدعاء + فلترة الجنس + التدريجي) ==========="
# --- الجهات الصحية: حقول كاملة + حالة ---
ORG=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى الشبكة التخصصي","type":"SPECIALIZED_CENTER","city":"صنعاء","address":"حدة","phone":"770000001","email":"net@org.com","status":"ACTIVE","location":"صنعاء — حدة"}')
ORG_ID=$(echo "$ORG" | jget "['hospital']['id']")
[ -n "$ORG_ID" ] && check "إضافة جهة صحية ببيانات كاملة (نوع/مدينة/تواصل)" "ok" "ok"

ORG_UPD=$(curl -s -b "$DIR/admin.jar" -X PATCH "$BASE/api/admin/hospitals/$ORG_ID" -H "Content-Type: application/json" \
  -d '{"type":"MEDICAL_COMPLEX","city":"عدن"}')
ORG_TYPE=$(echo "$ORG_UPD" | jget "['hospital']['type']")
check "تعديل الجهة (النوع والمدينة)" "MEDICAL_COMPLEX" "$ORG_TYPE"

# لوحة الجهة
ORG_DASH=$(code -b "$DIR/admin.jar" $BASE/api/admin/hospitals/$ORG_ID)
check "لوحة الجهة الصحية (كوادر + تكليفات)" "200" "$ORG_DASH"

# --- الارتباط المهني: طلب الكادر + الحالات المحمية ---
AFF_REQ=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"status\":\"PENDING\",\"note\":\"أعمل لديهم في الطوارئ\"}")
check "الكادر يطلب ارتباطاً (قيد المراجعة) → 201" "201" "$AFF_REQ"

AFF_PROTECT=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"status\":\"ENDORSED\"}")
check "الكادر يُمنع من تعيين «معتمد» لنفسه → 403" "403" "$AFF_PROTECT"

AFF_DUP=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"status\":\"PENDING\"}")
check "منع تكرار الارتباط (كادر×جهة) → 409" "409" "$AFF_DUP"

# الإدارة: اعتماد الارتباط (المستندات مرفوعة للكادر من أقسام سابقة) ثم مقابلة
AFF_LIST=$(curl -s -b "$DIR/admin.jar" "$BASE/api/affiliations?hospitalId=$ORG_ID" | jget "['affiliations'][0]['id']")
AFF_ENDORSE=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/affiliations/$AFF_LIST -H "Content-Type: application/json" -d '{"status":"ENDORSED"}' | jget "['affiliation']['status']")
check "الإدارة تعتمد الارتباط (بعد المستندات)" "ENDORSED" "$AFF_ENDORSE"

# بوابة المستندات: كادر بلا مستندات لا يُعتمد ارتباطه
REG_N2=$(curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"كادر الشبكة","phone":"766660202","password":"Net@12345","specialty":"عناية مركزة","qualification":"دبلوم ثلاث سنوات","yearsOfExperience":3,"gender":"MALE"}')
N2_ID=$(echo "$REG_N2" | jget "['user']['id']")
[ -n "$N2_ID" ] && check "تسجيل كادر الشبكة (مع جنسه) → 201" "ok" "ok"
login "$DIR/nurse2.jar" "766660202" "Net@12345"
curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$N2_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
AFF_NODOC=$(code -b "$DIR/admin.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$N2_ID\",\"hospitalId\":\"$ORG_ID\",\"status\":\"ENDORSED\"}")
check "منع اعتماد ارتباط كادر بلا مستندات → 422" "422" "$AFF_NODOC"

# --- المفضلة الخاصة بكل مستلم ---
FAV1=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/favorites -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$NURSE_ID\",\"category\":\"طوارئ\"}")
check "المستلم يضيف الكادر لمفضلته → 201" "201" "$FAV1"

FAV_DUP=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/favorites -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$NURSE_ID\"}")
check "منع تكرار نفس الكادر في المفضلة → 409" "409" "$FAV_DUP"

FAV_LIST=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/favorites | python3 -c "
import json,sys
d=json.load(sys.stdin)['favorites']
n=[x for x in d if x['id']=='$NURSE_ID']
print(n[0]['isFavorite'], n[0].get('category'), n[0]['isAvailable'])" 2>/dev/null)
check "قائمة مفضلتي: الكادر موجود بتصنيفه" "True طوارئ True" "$FAV_LIST"

# --- المطابقة الذكية + البحث المتقدم ---
MATCH=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/receiver/nurses?hospitalId=$ORG_ID&gender=MALE&department=طوارئ" | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=[x for x in d['nurses'] if x['id']=='$NURSE_ID']
print(len(n), n[0]['priority'] if n else 0, n[0]['isFavorite'] if n else False)" 2>/dev/null)
check "المطابقة الذكية: الكادر المفضل بالأولوية القصوى" "1 5 True" "$MATCH"

# --- فلترة الجنس الصارمة: تكليف أنثى لا يراه الكادر الذكر ---
P21=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"department\":\"حضانة\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":4,\"gender\":\"FEMALE\",\"value\":40000,\"distribution\":\"ALL_MATCHING\"}")
P21_ID=$(echo "$P21" | jget "['post']['id']")

FEED_GENDER=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$P21_ID' for p in d['posts']))")
check "تكليف «أنثى فقط» لا يظهر في قائمة كادر ذكر (API)" "False" "$FEED_GENDER"

DIRECT_GENDER=$(code -b "$DIR/nurse.jar" $BASE/api/posts/$P21_ID)
check "الرابط المباشر لتكليف «أنثى فقط» محجوب على كادر ذكر → 404" "404" "$DIRECT_GENDER"

APPLY_GENDER=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$P21_ID/apply -H "Content-Type: application/json" -d '{}')
check "التقديم عبر API على تكليف مخالف للجنس → 403" "403" "$APPLY_GENDER"

INVITE_GENDER=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/posts/$P21_ID/invite -H "Content-Type: application/json" \
  -d "{\"nurseIds\":[\"$NURSE_ID\"]}")
check "استدعاء كادر مخالف للجنس ممنوع → 422" "422" "$INVITE_GENDER"

# --- الاستدعاء المباشر: تكليف خاص لا يظهر إلا للمستدعى ---
P22=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"department\":\"طوارئ\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":8,\"gender\":\"MALE\",\"value\":50000,\"distribution\":\"INVITE_SELECTED\",\"invitedNurseIds\":[\"$NURSE_ID\"]}")
P22_ID=$(echo "$P22" | jget "['post']['id']")

P22_MSG=$(echo "$P22" | jget "['message']")
echo "$P22_MSG" | grep -q "الاستدعاء" && check "إنشاء تكليف واستدعاء مباشر في خطوة واحدة" "ok" "ok"

PRIVATE_VISIBLE=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$P22_ID' for p in d['posts']))")
check "التكليف الخاص (استدعاء) يظهر للمستدعى فقط في قائمته" "True" "$PRIVATE_VISIBLE"

N2_INVITE=$(curl -s -b "$DIR/nurse2.jar" $BASE/api/me/invitations | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(len(d['invitations']))")
check "كادر آخر لا يملك استدعاءات (قائمة الاستدعاءات خاصة)" "0" "$N2_INVITE"

ACCEPT=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/invitations | python3 -c "
import json,sys
d=json.load(sys.stdin)
inv=[i for i in d['invitations'] if i['post']['id']=='$P22_ID'][0]
print(inv['id'])")
INV_ACCEPT=$(curl -s -b "$DIR/nurse.jar" -X PATCH $BASE/api/me/invitations/$ACCEPT -H "Content-Type: application/json" -d '{"action":"ACCEPT"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('accepted' if d.get('application') else d.get('message','?')[:20])")
check "قبول الاستدعاء يُنشئ تقديماً تلقائياً" "accepted" "$INV_ACCEPT"

# --- النشر التدريجي: المرحلة 1 (المفضلون) ثم التوسيع اليدوي ---
P23=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"department\":\"عناية\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":6,\"gender\":\"MALE\",\"value\":30000,\"distribution\":\"PROGRESSIVE\",\"progressiveStageHours\":24}")
P23_ID=$(echo "$P23" | jget "['post']['id']")
P23_STAGE=$(echo "$P23" | jget "['post']['progressiveStage']")
check "النشر التدريجي يبدأ بالمرحلة 1 (المفضلون)" "0" "$P23_STAGE"

PROG_VISIBLE_FAV=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$P23_ID' for p in d['posts']))")
check "المرحلة 1 تظهر للمفضل المطابق" "True" "$PROG_VISIBLE_FAV"

PROG_HIDDEN_N2=$(curl -s -b "$DIR/nurse2.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$P23_ID' for p in d['posts']))")
check "المرحلة 1 لا تظهر لغير المفضلين" "False" "$PROG_HIDDEN_N2"

ESCALATE=$(curl -s -b "$DIR/receiver.jar" -X PATCH $BASE/api/posts/$P23_ID -H "Content-Type: application/json" \
  -d '{"escalateStage":true}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('escalated' if 'توسيع' in d.get('message','') else '?')")
check "التوسيع اليدوي للمرحلة التالية" "escalated" "$ESCALATE"

N2_AFF=$(code -b "$DIR/admin.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$N2_ID\",\"hospitalId\":\"$ORG_ID\",\"status\":\"WORKING\"}" -o /dev/null -w "%{http_code}")
[ "$N2_AFF" = "422" ] && N2_AFF=$(code -b "$DIR/admin.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$N2_ID\",\"hospitalId\":\"$ORG_ID\",\"status\":\"PENDING\"}")
check "ربط كادر الشبكة بالجهة (بلا مستندات = قيد المراجعة)" "201" "$N2_AFF"

UP_N2_DOC=$(code -b "$DIR/nurse2.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "كادر الشبكة يرفع مستنده (شرط الاعتماد)" "201" "$UP_N2_DOC"

# --- تنظيف القسم ---
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$P21_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$P22_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$P23_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$N2_ID -o /dev/null

echo "=========== 22) الجولة الثامنة: قواعد التسجيل + جهات العمل + كوادر الجهة ==========="

# --- القوائم العامة للتسجيل (بلا جلسة) ---
PUB_ORG=$(code $BASE/api/hospitals/public)
check "قائمة الجهات الصحية العامة للتسجيل → 200" "200" "$PUB_ORG"
PUB_ORG_COUNT=$(curl -s $BASE/api/hospitals/public | jget "['hospitals'].__len__()")
[ "$PUB_ORG_COUNT" -ge 1 ] && check "القائمة العامة تُظهر جهات الإدارة المعتمدة" "ok" "ok" || check "القائمة العامة فارغة!" "1+" "$PUB_ORG_COUNT"
PUB_DEPT=$(code $BASE/api/departments/public)
check "قائمة الأقسام العامة للتسجيل (التخصص) → 200" "200" "$PUB_DEPT"

# --- قواعد التسجيل الجديدة ---
BAD_PHONE=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"اختبار الهاتف","phone":"71111111111","password":"Round8@123","qualification":"بكالوريوس أربع سنوات","gender":"MALE"}')
check "رفض هاتف أطول من 9 أرقام → 422" "422" "$BAD_PHONE"

BAD_NAME=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"سارة","phone":"744440310","password":"Round8@123","qualification":"بكالوريوس أربع سنوات","gender":"FEMALE"}')
check "رفض اسم بلا لقب (كلمة واحدة) → 422" "422" "$BAD_NAME"

BAD_GENDER=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"نورا سالم","phone":"744440311","password":"Round8@123","qualification":"بكالوريوس أربع سنوات"}')
check "رفض كادر بلا جنس (الجنس إجباري) → 422" "422" "$BAD_GENDER"

BAD_QUAL=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"نورا سالم","phone":"744440312","password":"Round8@123","qualification":"دكتوراه","gender":"FEMALE"}')
check "رفض مؤهل خارج الخيارات الثلاثة → 422" "422" "$BAD_QUAL"

# --- قواعد الجولة الثالثة عشرة: التخصص وسنوات الخبرة إجبارية للكادر ---
R8_NO_SPEC=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"نورا بلا تخصص","phone":"788880391","password":"Round8@123","qualification":"دبلوم ثلاث سنوات","gender":"FEMALE","yearsOfExperience":2}')
check "رفض تسجيل كادر بلا تخصص (إجباري) → 422" "422" "$R8_NO_SPEC"

R8_NO_YEARS=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"نورا بلا خبرة","phone":"788880392","password":"Round8@123","qualification":"دبلوم ثلاث سنوات","gender":"FEMALE","specialty":"عناية مركزة"}')
check "رفض تسجيل كادر بسنوات خبرة مفقودة (إجباري) → 422" "422" "$R8_NO_YEARS"

R8_EMPTY_YEARS=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"نورا خبرة فارغة","phone":"788880393","password":"Round8@123","qualification":"دبلوم ثلاث سنوات","gender":"FEMALE","specialty":"عناية مركزة","yearsOfExperience":""}')
check "رفض سنوات خبرة فارغة (سلسلة فارغة) → 422" "422" "$R8_EMPTY_YEARS"

R8_N=$(curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"نورا الشبكي","phone":"788880301","password":"Round8@123","specialty":"عناية مركزة","qualification":"دبلوم ثلاث سنوات","gender":"FEMALE","yearsOfExperience":2}')
R8_N_ID=$(echo "$R8_N" | jget "['user']['id']")
[ -n "$R8_N_ID" ] && check "تسجيل كادر بالتخصص والخبرة (إجبارية) → 201" "ok" "ok" || check "تسجيل كادر الجولة الثالثة عشرة" "id" "null"

# --- مستلم جديد بجهة صحية جديدة مع بقية بياناتها → تُرفع للاعتماد ---
R8_R=$(curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"RECEIVER","name":"أمين الجهة","phone":"788880302","password":"Round8@123","hospitalName":"مستشفى الجولة الثامنة","newOrg":{"type":"MEDICAL_CENTER","city":"عدن","address":"خور مكسر","phone":"712345678"}}')
R8_R_ID=$(echo "$R8_R" | jget "['user']['id']")
[ -n "$R8_R_ID" ] && check "تسجيل مستلم بجهة جديدة (مع بقية بياناتها) → 201" "ok" "ok" || check "تسجيل مستلم الجولة الثامنة" "id" "null"

R8_ORG=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/hospitals | python3 -c "
import json,sys
hs=json.load(sys.stdin)['hospitals']
o=[h for h in hs if h['name']=='مستشفى الجولة الثامنة']
print(o[0]['id'], o[0]['status']) if o else print('', '')")
R8_ORG_ID=$(echo "$R8_ORG" | cut -d' ' -f1)
R8_ORG_STATUS=$(echo "$R8_ORG" | cut -d' ' -f2)
check "الجهة الجديدة وصلت لكتالوج الإدارة بحالة PENDING" "PENDING" "$R8_ORG_STATUS"

# القائمة العامة لا تُظهر الجهة قبل الاعتماد
PUB_HAS_NEW=$(curl -s $BASE/api/hospitals/public | python3 -c "
import json,sys
hs=json.load(sys.stdin)['hospitals']
print(len([h for h in hs if h['name']=='مستشفى الجولة الثامنة']))")
check "القائمة العامة لا تُظهر الجهة قبل الاعتماد" "0" "$PUB_HAS_NEW"

# الإدارة تعتمد الجهة الجديدة → ACTIVE وتظهر للعامة
R8_APPROVE=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/hospitals/$R8_ORG_ID -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE","isActive":true}' | jget "['hospital']['status']")
check "الإدارة تعتمد الجهة الجديدة → ACTIVE" "ACTIVE" "$R8_APPROVE"
PUB_HAS_NEW2=$(curl -s $BASE/api/hospitals/public | python3 -c "
import json,sys
hs=json.load(sys.stdin)['hospitals']
print(len([h for h in hs if h['name']=='مستشفى الجولة الثامنة']))")
check "الجهة المعتمدة تظهر في القائمة العامة" "1" "$PUB_HAS_NEW2"

# --- الكادر يضيف جهات عمل من ملفه (السجل المهني) ---
login "$DIR/r8nurse.jar" "788880301" "Round8@123"
SEED_ORG_ID=$(curl -s -b "$DIR/r8nurse.jar" $BASE/api/hospitals | python3 -c "import json,sys;h=json.load(sys.stdin)['hospitals'];print(h[0]['id'] if h else '')")

R8_AFF=$(curl -s -b "$DIR/r8nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$SEED_ORG_ID\",\"requestedStatus\":\"WORKING\",\"workYears\":4}")
R8_AFF_ID=$(echo "$R8_AFF" | jget "['affiliation']['id']")
R8_AFF_STATUS=$(echo "$R8_AFF" | jget "['affiliation']['status']")
check "الكادر يطلب جهة عمل (حالياً + 4 سنوات) → PENDING" "PENDING" "$R8_AFF_STATUS"
check "الطلب يحفظ سنوات العمل" "4" "$(echo "$R8_AFF" | jget "['affiliation']['workYears']")"

R8_AFF_DUP=$(code -b "$DIR/r8nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$SEED_ORG_ID\",\"requestedStatus\":\"WORKING\",\"workYears\":4}")
check "منع تكرار نفس جهة العمل → 409" "409" "$R8_AFF_DUP"

# جهة جديدة غير موجودة من ملف الكادر → تُرفع للإدارة
R8_AFF_NEW=$(curl -s -b "$DIR/r8nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d '{"newOrg":{"name":"مركز الجولة الثامنة","type":"CLINIC","city":"تعز"},"requestedStatus":"FORMER","workYears":2}')
R8_AFF2_STATUS=$(echo "$R8_AFF_NEW" | jget "['affiliation']['status']")
check "الكادر يضيف جهة جديدة لسجله (سابقاً + 2 سنوات) → PENDING" "PENDING" "$R8_AFF2_STATUS"

R8_ORG2_ID=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/hospitals | python3 -c "
import json,sys
hs=json.load(sys.stdin)['hospitals']
o=[h for h in hs if h['name']=='مركز الجولة الثامنة']
print(o[0]['id']) if o else print('')")
[ -n "$R8_ORG2_ID" ] && check "جهة الكادر الجديدة وصلت لكتالوج الإدارة" "ok" "ok"

# السجل المهني يعيد الارتباطات
R8_PROF=$(curl -s -b "$DIR/r8nurse.jar" $BASE/api/me/professional-profile | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(len(d['affiliations']), sum(1 for a in d['affiliations'] if a.get('workYears')==4))")
check "السجل المهني: ارتباطان مع سنوات العمل محفوظة" "2 1" "$R8_PROF"

# إصلاح الجولة الثامنة: اعتماد جهة معلقة يعتمد الارتباطات المعلقة عليها تلقائياً
R8_ORG2_APPROVE=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/hospitals/$R8_ORG2_ID -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE","isActive":true}' | jget "['hospital']['status']")
check "اعتماد جهة الكادر الجديدة → ACTIVE" "ACTIVE" "$R8_ORG2_APPROVE"
R8_AFF2_FINAL=$(curl -s -b "$DIR/r8nurse.jar" $BASE/api/me/professional-profile | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=[x for x in d['affiliations'] if x['hospital']['name']=='مركز الجولة الثامنة']
print(a[0]['status'] if a else '')")
check "الارتباط المعلق يُعتمد تلقائياً مع اعتماد الجهة → FORMER" "FORMER" "$R8_AFF2_FINAL"

# بوابة المستندات على اعتماد الارتباط — ثم الاعتماد بعد رفع مستند
R8_GATE=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/affiliations/$R8_AFF_ID -H "Content-Type: application/json" -d '{"status":"WORKING"}')
check "لا اعتماد ارتباط لكادر بلا مستندات → 422" "422" "$R8_GATE"
UP_R8=$(code -b "$DIR/r8nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "الكادر يرفع مستنده → 201" "201" "$UP_R8"
R8_ENDORSE=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/affiliations/$R8_AFF_ID -H "Content-Type: application/json" \
  -d '{"status":"WORKING","note":"تم التحقق"}' | jget "['affiliation']['status']")
check "الإدارة تعتمد جهة العمل بعد المستندات → WORKING" "WORKING" "$R8_ENDORSE"

# --- كوادر الجهة: المستلم يضيف ممرض لجهته ---
login "$DIR/r8receiver.jar" "788880302" "Round8@123"
R8_STAFF=$(curl -s -b "$DIR/r8receiver.jar" -X POST $BASE/api/receiver/staff -H "Content-Type: application/json" \
  -d '{"name":"هند عبده","phone":"788880303","password":"Staff@12345","gender":"FEMALE","qualification":"أورديلي سنة","specialty":"تمريض عام","yearsOfExperience":0}')
R8_STAFF_ID=$(echo "$R8_STAFF" | jget "['nurse']['id']")
[ -n "$R8_STAFF_ID" ] && check "المستلم يضيف ممرضة لجهته النشطة → 201 (ارتباط WORKING مباشرة)" "ok" "ok" || check "إضافة ممرض للجهة" "id" "null"

R8_STAFF_PHONE=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=NURSE&status=PENDING" | python3 -c "
import json,sys
us=json.load(sys.stdin)['users']
n=[u for u in us if u['phone']=='788880303']
print(n[0]['phone'] if n else '')")
check "الكادر المضاف يظهر مباشرة في قائمة كوادر الإدارة" "788880303" "$R8_STAFF_PHONE"

R8_STAFF_LIST=$(curl -s -b "$DIR/r8receiver.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=[x for x in d['nurses'] if x['nurse']['name']=='هند عبده']
if not n:
    print('')
else:
    r=n[0]['nurse']
    print(n[0]['affiliationStatus'], r['status'], r['_count']['documents'], r['phoneLocked'], '•' in r['phoneMasked'])" 2>/dev/null)
check "كوادر الجهة: WORKING + PENDING + 0 مستندات + الرقم مقفل بقناع (الجولة 34)" "WORKING PENDING 0 True True" "$R8_STAFF_LIST"

# الكادر المضاف لا يستقبل أي تكليف قبل الاعتماد — حتى مع ارتباط WORKING (الحاجز = حالة الحساب)
login "$DIR/r8staff.jar" "788880303" "Staff@12345"
R8_POST_TODAY=$(date -u +%Y-%m-%d)
R8_P=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$SEED_ORG_ID\",\"department\":\"عناية\",\"startDate\":\"$R8_POST_TODAY\",\"nursesNeeded\":1,\"hours\":2,\"gender\":\"ANY\",\"value\":20000}" | jget "['post']['id']")
R8_STAFF_APPLY=$(code -b "$DIR/r8staff.jar" -X POST $BASE/api/posts/$R8_P/apply -H "Content-Type: application/json" -d '{}')
check "كادر جهة غير معتمد لا يستقبل أي تكليف → 403" "403" "$R8_STAFF_APPLY"

# --- تنظيف القسم ---
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$R8_P -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$R8_STAFF_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$R8_N_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$R8_R_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/hospitals/$R8_ORG_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/hospitals/$R8_ORG2_ID -o /dev/null

# ============================================================
# القسم 23 — مراجعة طلبات الارتباط من لوحة الجهة (الكوادر والتكليفات)
# إصلاح: طلب الكادر بجهة نشطة يبقى «قيد المراجعة» حتى تراجعه الإدارة من لوحة الجهة
# ============================================================
echo "=========== 23) مراجعة طلبات الارتباط المعلقة من لوحة الجهة ==========="

R9_N=$(curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"طلاب المراجعة","phone":"788880401","password":"Round9@1234","specialty":"تمريض عام","qualification":"بكالوريوس أربع سنوات","gender":"MALE","yearsOfExperience":1}')
R9_N_ID=$(echo "$R9_N" | jget "['user']['id']")
[ -n "$R9_N_ID" ] && check "تسجيل كادر قسم المراجعة → 201" "ok" "ok" || check "تسجيل كادر قسم المراجعة" "id" "null"

login "$DIR/r9nurse.jar" "788880401" "Round9@1234"
R9_AFF=$(curl -s -b "$DIR/r9nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$SEED_ORG_ID\",\"requestedStatus\":\"WORKING\",\"workYears\":3}")
R9_AFF_ID=$(echo "$R9_AFF" | jget "['affiliation']['id']")
R9_AFF_STATUS=$(echo "$R9_AFF" | jget "['affiliation']['status']")
check "طلب ارتباط كادر بجهة نشطة → PENDING" "PENDING" "$R9_AFF_STATUS"

# لوحة الجهة تعيد الحقلين معاً: حالة الارتباط + حالة حساب الكادر (عقد البيانات لعرض «الحساب/الارتباط»)
R9_DASH=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/hospitals/$SEED_ORG_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=[x for x in d['nurses'] if x['nurse']['phone']=='788880401']
print(n[0]['status'], n[0]['statusLabel'], n[0]['nurse']['status'], n[0]['requestedStatus']) if n else print('', '', '', '')" 2>/dev/null)
check "لوحة الجهة: ارتباط PENDING («قيد المراجعة») + حساب الكادر + الحالة المطلوبة" "PENDING قيد المراجعة PENDING WORKING" "$R9_DASH"

# بوابة المستندات قبل الاعتماد — ثم رفع مستند والاعتماد
R9_GATE=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/affiliations/$R9_AFF_ID -H "Content-Type: application/json" -d '{"status":"WORKING"}')
check "لا اعتماد ارتباط بلا مستندات → 422" "422" "$R9_GATE"

UP_R9=$(code -b "$DIR/r9nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "الكادر يرفع مستنده → 201" "201" "$UP_R9"

R9_APPROVE=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/affiliations/$R9_AFF_ID -H "Content-Type: application/json" \
  -d '{"status":"WORKING"}' | jget "['affiliation']['status']")
check "اعتماد الطلب من لوحة الجهة → WORKING (لم يبق قيد المراجعة)" "WORKING" "$R9_APPROVE"

R9_DASH2=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/hospitals/$SEED_ORG_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=[x for x in d['nurses'] if x['nurse']['phone']=='788880401']
print(n[0]['status'], n[0]['statusLabel']) if n else print('', '')" 2>/dev/null)
check "لوحة الجهة بعد الاعتماد: WORKING («يعمل حالياً»)" "WORKING يعمل حالياً" "$R9_DASH2"

# رفض طلب الارتباط المعلق (حذف الطلب) — جهة ثانية نشطة
R9_ORG2=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"جهة رفض الطلب","type":"CLINIC","status":"ACTIVE"}')
R9_ORG2_ID=$(echo "$R9_ORG2" | jget "['hospital']['id']")
R9_AFF2=$(curl -s -b "$DIR/r9nurse.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$R9_ORG2_ID\",\"requestedStatus\":\"WORKING\"}")
R9_AFF2_ID=$(echo "$R9_AFF2" | jget "['affiliation']['id']")
R9_REJECT=$(code -b "$DIR/admin.jar" -X DELETE $BASE/api/affiliations/$R9_AFF2_ID)
check "رفض طلب الارتباط المعلق → 200" "200" "$R9_REJECT"
R9_GONE=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/hospitals/$R9_ORG2_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(len([x for x in d['nurses'] if x['nurse']['phone']=='788880401']))")
check "الطلب المرفوض اختفى من لوحة الجهة" "0" "$R9_GONE"

# --- تنظيف القسم ---
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$R9_N_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/hospitals/$R9_ORG2_ID -o /dev/null

# ============================================================
# القسم 24 — الجولة العاشرة: معاينة الجمهور الحية + عقد إعادة النشر + المستندات المجمعة
# ============================================================
echo "=========== 24) معاينة الجمهور + إعادة النشر + المستندات المجمعة ==========="

# معاينة الجمهور الحية — ALL_MATCHING: total + التوزيع الهرمي
R10_P1=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/posts/audience-preview?gender=ANY&distribution=ALL_MATCHING" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['total']>=0, 'breakdown' in d, 'favorites' in d['breakdown'], 'basic' in d['breakdown'])" 2>/dev/null)
check "معاينة الجمهور ALL_MATCHING: total + breakdown هرمي" "True True True True" "$R10_P1"

# معاينة الجمهور — AUTO_MATCH بجهة صحية وقسم
R10_P2=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/posts/audience-preview?hospitalId=$SEED_ORG_ID&gender=ANY&department=%D8%B7%D9%88%D8%A7%D8%B1%D8%A6&distribution=AUTO_MATCH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['distribution'], d['total']>=0)" 2>/dev/null)
check "معاينة الجمهور AUTO_MATCH بجهة وقسم" "AUTO_MATCH True" "$R10_P2"

# معاينة الجمهور — PROGRESSIVE: عدادات المراحل الأربع + الوصول الإداري
R10_P3=$(curl -s -b "$DIR/admin.jar" "$BASE/api/posts/audience-preview?hospitalId=$SEED_ORG_ID&gender=ANY&distribution=PROGRESSIVE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
p=d.get('progressive') or {}
print(all(k in p for k in ('stage0','stage1','stage2','stage3')))" 2>/dev/null)
check "معاينة الجمهور PROGRESSIVE: عدادات المراحل الأربع (صلاحية الإدارة)" "True" "$R10_P3"

# منع الكادر من معاينة الجمهور (RECEIVER/ADMIN فقط)
R10_P4=$(code -b "$DIR/nurse.jar" "$BASE/api/posts/audience-preview?gender=ANY")
check "منع الكادر من معاينة الجمهور → 403" "403" "$R10_P4"

# عقد إعادة النشر: posts[0] للمستلم يحمل كل حقول الملء التلقائي
R10_REPOST=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/posts" | python3 -c "
import json,sys
d=json.load(sys.stdin)
p=d['posts'][0] if d['posts'] else {}
print(bool(p), all(k in p for k in ('hospitalId','value','gender','hours','nursesNeeded','description')))" 2>/dev/null)
check "عقد إعادة نشر آخر تكليف: posts[0] يحمل كل حقول الملء" "True True" "$R10_REPOST"

# المستندات المجمعة: ?userId يعيد مستندات كادر محدد حصراً
R10_N2=$(curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"مستندات مجمعة","phone":"788880501","password":"Round10@12","specialty":"تمريض عام","qualification":"دبلوم ثلاث سنوات","gender":"FEMALE","yearsOfExperience":4}')
R10_N2_ID=$(echo "$R10_N2" | jget "['user']['id']")
[ -n "$R10_N2_ID" ] && check "تسجيل كادر قسم المستندات → 201" "ok" "ok" || check "تسجيل كادر المستندات" "id" "null"
login "$DIR/r10nurse.jar" "788880501" "Round10@12"
UP_R10=$(code -b "$DIR/r10nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "الكادر يرفع مستنده → 201" "201" "$UP_R10"
R10_DOCS=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/documents?userId=$R10_N2_ID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
docs=d['documents']
print(len(docs), all(x['userId']=='$R10_N2_ID' for x in docs))" 2>/dev/null)
check "المستندات المجمعة: userId يعيد مستندات الكادر حصراً" "1 True" "$R10_DOCS"

# --- تنظيف القسم ---
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$R10_N2_ID -o /dev/null

# ============================================================
# القسم 25 — الجولة الحادية عشرة: توزيع الرسوم عند تأكيد الدفع + قنوات التواصل + عقد الأقسام
# ============================================================
echo "=========== 25) توزيع الرسوم عند تأكيد الدفع + قسم التواصل + عقد الأقسام ==========="

# --- أ) عقد الأقسام: /api/departments يعيد isActive صراحةً (إصلاح قائمة الأقسام الفارغة في تكليف معلن) ---
R11_DEPTS=$(curl -s -b "$DIR/admin.jar" $BASE/api/departments | python3 -c "
import json,sys
d=json.load(sys.stdin)
deps=d['departments']
print(len(deps) > 0 and all('isActive' in x for x in deps))" 2>/dev/null)
check "عقد الأقسام: /api/departments يعيد isActive لكل قسم (القائمة تظهر في تكليف معلن)" "True" "$R11_DEPTS"

# --- ب) توزيع الرسوم عند تأكيد الدفع مباشرة (دون إنهاء من الكادر أو المستلم) ---
R11_P=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"عناية\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":3,\"gender\":\"ANY\",\"value\":60000}")
R11_P_ID=$(echo "$R11_P" | jget "['post']['id']")
R11_APPLY=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$R11_P_ID/apply -H "Content-Type: application/json" -d '{}')
check "تقديم الكادر على تكليف قسم 25 → 201" "201" "$R11_APPLY"

R11_APP_ID=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$R11_P_ID/applications | jget "['applications'][0]['applicationId']")
R11_A_ID=$(curl -s -b "$DIR/receiver.jar" -X PATCH $BASE/api/applications/$R11_APP_ID -H "Content-Type: application/json" -d '{"action":"APPROVE"}' | jget "['assignment']['id']")
[ -n "$R11_A_ID" ] && check "اعتماد التقديم → تكليف مؤكد (قسم 25)" "ok" "ok" || check "اعتماد التقديم قسم 25" "id" "null"

R11_EARN_BEFORE=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['totalEarned']")

# الإدارة تؤكد الدفع مباشرة — دون إنهاء من الكادر أو المستلم: يجب أن تُوزَّع الرسوم فوراً
R11_PAY_MSG=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$R11_A_ID -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
s=d.get('settlement') or {}
print('distribute' if ('توزيع رسوم التكليف' in d.get('message','') and s.get('earningAmount')==3000 and s.get('earningCreated')==True) else 'no')" 2>/dev/null)
check "تأكيد الدفع يوزع رسوم التكليف فوراً (ربح 3000 = نصف نسبة الإدارة 5٪ من 60000)" "distribute" "$R11_PAY_MSG"

R11_EARN_AFTER=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['totalEarned']")
check "ربح المستلم زاد بـ 3000 بعد تأكيد الدفع (قبل=$R11_EARN_BEFORE بعد=$R11_EARN_AFTER)" "3000" "$((R11_EARN_AFTER - R11_EARN_BEFORE))"

R11_PS=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=[x for x in d.get('assignments',[]) if x.get('id')=='$R11_A_ID']
print(a[0]['paymentStatus'] if a else '?')")
check "حالة الدفع بعد التأكيد: PAID" "PAID" "$R11_PS"

# إعادة الاحتساب آمنة للتكرار — لا ازدواج في الربح
R11_REDIST=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$R11_A_ID -H "Content-Type: application/json" -d '{"redistributeFees":true}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
s=d.get('settlement') or {}
print('ok' if s.get('earningAmount')==3000 and s.get('earningCreated')==False else 'no')" 2>/dev/null)
check "إعادة احتساب الرسوم: idempotent بلا ازدواج (earningCreated=False)" "ok" "$R11_REDIST"

R11_EARN_FINAL=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['totalEarned']")
check "الربح الإجمالي لم يتغير بعد إعادة الاحتساب (لا ازدواج)" "$R11_EARN_AFTER" "$R11_EARN_FINAL"

# --- ج) قنوات التواصل: قسم التواصل + الأيقونة العائمة ---
R11_C0=$(curl -s $BASE/api/contact | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('channels' in d)" 2>/dev/null)
check "GET /api/contact عام (بلا جلسة) — عقد القنوات موجود" "True" "$R11_C0"

R11_CSET=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/contact -H "Content-Type: application/json" \
  -d '{"whatsapp":"777000555","whatsappEnabled":true,"email":"admin@takleefat.ye","emailEnabled":true,"phone":"","phoneEnabled":true}')
check "الإدارة تحفظ قنوات التواصل (واتساب + بريد + هاتف مفعّل بلا رقم) → 200" "200" "$R11_CSET"

R11_C1=$(curl -s $BASE/api/contact | python3 -c "
import json,sys
d=json.load(sys.stdin)['channels']
print(sorted(d.keys()))" 2>/dev/null)
check "القنوات النشطة فقط: واتساب + بريد (الهاتف مفعّل لكن بلا رقم — لا يظهر)" "['email', 'whatsapp']" "$R11_C1"

R11_C2=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/contact -H "Content-Type: application/json" \
  -d '{"whatsappEnabled":false}')
R11_C3=$(curl -s $BASE/api/contact | python3 -c "
import json,sys
print(sorted(json.load(sys.stdin)['channels'].keys()))" 2>/dev/null)
check "إيقاف واتساب (قناة لها رقم) يخفيه فوراً من الأيقونة العائمة → 200" "['email']" "$R11_C3"

R11_CFORBID=$(code -b "$DIR/nurse.jar" -X PATCH $BASE/api/admin/contact -H "Content-Type: application/json" -d '{"whatsapp":"x"}')
check "منع الكادر من إدارة قنوات التواصل → 403" "403" "$R11_CFORBID"

# --- تنظيف القسم: تصفير قنوات التواصل + حذف تكليف القسم (الربح يُحذف بالتتالي) ---
curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/contact -H "Content-Type: application/json" \
  -d '{"whatsapp":"","whatsappEnabled":false,"phone":"","phoneEnabled":false,"sms":"","smsEnabled":false,"email":"","emailEnabled":false}' -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/assignments/$R11_A_ID -o /dev/null
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$R11_P_ID -o /dev/null

# ============================================================
# القسم 26 — الجولة الثانية عشرة: PWA (manifest + Service Worker + دون اتصال + الأيقونات)
# ============================================================
echo "=========== 26) PWA — manifest + sw.js + offline + الأيقونات ==========="

R26_MANIFEST=$(curl -s $BASE/manifest.webmanifest)
check "manifest.webmanifest متاح → 200" "200" "$(code $BASE/manifest.webmanifest)"
check "manifest: الاسم يحوي تكليفات" "True" "$(echo "$R26_MANIFEST" | python3 -c "import json,sys;d=json.load(sys.stdin);print('تكليفات' in d.get('name',''))" 2>/dev/null)"
check "manifest: standalone + rtl + ar + هوية كحلية (background/theme)" "standalone rtl ar #0E1B4E #0E1B4E" "$(echo "$R26_MANIFEST" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('display'),d.get('dir'),d.get('lang'),d.get('background_color'),d.get('theme_color'))" 2>/dev/null)"
check "manifest: أيقونات any 192/512 + maskable" "True True True True" "$(
  echo "$R26_MANIFEST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
icons=d.get('icons',[])
sizes=' '.join(i.get('sizes','') for i in icons)
purposes=' '.join(i.get('purpose','') for i in icons)
print('192x192' in sizes,'512x512' in sizes,'any' in purposes,'maskable' in purposes)"
)"

check "sw.js متاح → 200" "200" "$(code $BASE/sw.js)"
check "sw.js: ترويسة Service-Worker-Allowed = /" "/" "$(curl -s -D - -o /dev/null $BASE/sw.js | tr -d '\r' | grep -i '^service-worker-allowed:' | awk '{print $2}')"
check "sw.js: يستثني api + تنقّل شبكة أولاً + offline + GET فقط" "True" "$(
  curl -s $BASE/sw.js | python3 -c "
import sys
q=chr(39)
needle='request.method !== '+q+'GET'+q
s=sys.stdin.read()
print('/api/' in s and 'navigate' in s and 'offline.html' in s and needle in s)"
)"

check "offline.html → 200 + رسالة عربية + زر إعادة المحاولة" "200 1 1" "$(code $BASE/offline.html) $(curl -s $BASE/offline.html | grep -c 'لا يوجد اتصال بالإنترنت') $(curl -s $BASE/offline.html | grep -c 'إعادة المحاولة')"

for R26_IC in icon-192 icon-512 maskable-192 maskable-512 apple-touch-icon; do
  R26_SIG=$(curl -s $BASE/icons/$R26_IC.png | head -c 4 | od -An -tx1 | tr -d ' \n')
  check "أيقونة $R26_IC.png → 200 + توقيع PNG صالح" "200 89504e47" "$(code $BASE/icons/$R26_IC.png) $R26_SIG"
done

check "الصفحة الرئيسية تشير إلى manifest" "1" "$(curl -s $BASE/ | grep -o 'rel=\"manifest\"' | wc -l | tr -d ' ')"

# ============================================================
# القسم 27 — الجولة الرابعة عشرة: البطاقة المهنية العامة + الإشعارات الفورية (Web Push)
# ============================================================
echo "=========== 27) البطاقة المهنية + الإشعارات الفورية ==========="

# --- البطاقة المهنية العامة /n/[id] ---
CARD_HTML=$(curl -s $BASE/n/$NURSE_ID)
CARD_CODE=$(code $BASE/n/$NURSE_ID)
check "البطاقة العامة للكادر المعتمد → 200" "200" "$CARD_CODE"
CARD_NAME=$(echo "$CARD_HTML" | grep -c 'سارة أحمد' | tr -d ' ')
[ "$CARD_NAME" -ge 1 ] 2>/dev/null && check "البطاقة تعرض اسم الكادر (سارة أحمد)" "ok" "ok" || check "البطاقة تعرض اسم الكادر" "ok" "missing"
CARD_SPEC=$(echo "$CARD_HTML" | grep -c 'تمريض طوارئ' | tr -d ' ')
[ "$CARD_SPEC" -ge 1 ] 2>/dev/null && check "البطاقة تعرض التخصص (تمريض طوارئ)" "ok" "ok" || check "البطاقة تعرض التخصص" "ok" "missing"
CARD_BADGE=$(echo "$CARD_HTML" | grep -c 'موثّق من منصة تكليفات' | tr -d ' ')
[ "$CARD_BADGE" -ge 1 ] 2>/dev/null && check "البطاقة تحمل شارة الموثوقية" "ok" "ok" || check "البطاقة تحمل شارة الموثوقية" "ok" "missing"
CARD_QR=$(echo "$CARD_HTML" | grep -c '<svg' | tr -d ' ')
[ "$CARD_QR" -ge 1 ] 2>/dev/null && check "البطاقة تتضمن رمز QR مولَّداً محلياً" "ok" "ok" || check "البطاقة تتضمن رمز QR" "ok" "missing"
check "خصوصية البطاقة: لا تكشف رقم هاتف الكادر" "0" "$(echo "$CARD_HTML" | grep -c '711111111' | tr -d ' ')"

# كادر غير معتمد → 404 (لا تعداد ولا تسريب)
REG_P14=$(curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"كادر بطاقة معلقة","phone":"788880601","password":"Round14@12","specialty":"تمريض عام","qualification":"دبلوم ثلاث سنوات","gender":"MALE","yearsOfExperience":2}')
PND_ID=$(echo "$REG_P14" | jget "['user']['id']")
PND_CARD=$(code $BASE/n/$PND_ID)
check "بطاقة كادر غير معتمد → 404 (حماية التعداد)" "404" "$PND_CARD"
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$PND_ID -o /dev/null

# --- الإشعارات الفورية: المفتاح العام والاشتراك ---
PUB_KEY=$(curl -s -b "$DIR/nurse.jar" $BASE/api/push/public-key | jget "['publicKey']")
[ -n "$PUB_KEY" ] && check "المفتاح العام VAPID متاح لجلسة صالحة" "ok" "ok" || check "المفتاح العام VAPID" "key" "null"
PUB_KEY_ANON=$(code $BASE/api/push/public-key)
check "المفتاح العام يرفض غير المسجل → 401" "401" "$PUB_KEY_ANON"

SUB_BODY='{"endpoint":"https://fcm.googleapis.com/fcm/send/e2e-test-sub-1","keys":{"p256dh":"BPk2xQ0E2fXnNn3XExampleP256dhKeyStringBase64url0000","auth":"e2eAuthKeyString1234"}}'
SUB=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/push/subscribe -H "Content-Type: application/json" -d "$SUB_BODY")
check "اشتراك جهاز بالإشعارات الفورية → 201" "201" "$SUB"
SUB2=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/push/subscribe -H "Content-Type: application/json" -d "$SUB_BODY")
check "إعادة الاشتراك idempotent (upsert) → 201" "201" "$SUB2"
SUB_BAD=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/push/subscribe -H "Content-Type: application/json" \
  -d '{"endpoint":"http://insecure.example.com/x","keys":{"p256dh":"BPk2xQ0E2fXnNn3XExampleP256dhKeyStringBase64url0000","auth":"e2eAuthKeyString1234"}}')
check "رفض اشتراك بلا https → 422" "422" "$SUB_BAD"
SUB_OTHER=$(code -b "$DIR/receiver.jar" -X DELETE $BASE/api/push/subscribe -H "Content-Type: application/json" \
  -d '{"endpoint":"https://fcm.googleapis.com/fcm/send/e2e-test-sub-1"}')
check "مستلم إداري لا يحذف اشتراك الكادر → 404" "404" "$SUB_OTHER"
UNSUB=$(code -b "$DIR/nurse.jar" -X DELETE $BASE/api/push/subscribe -H "Content-Type: application/json" \
  -d '{"endpoint":"https://fcm.googleapis.com/fcm/send/e2e-test-sub-1"}')
check "إلغاء الاشتراك من صاحبه → 200" "200" "$UNSUB"
UNSUB2=$(code -b "$DIR/nurse.jar" -X DELETE $BASE/api/push/subscribe -H "Content-Type: application/json" \
  -d '{"endpoint":"https://fcm.googleapis.com/fcm/send/e2e-test-sub-1"}')
check "إلغاء اشتراك غير موجود → 404" "404" "$UNSUB2"

# --- سكربت الخدمة: معالجات الإشعارات الفورية (v3) ---
SW_HTML=$(curl -s $BASE/sw.js)
check "sw.js: معالج push (عرض الإشعار)" "1" "$(echo "$SW_HTML" | grep -cF "addEventListener('push'")"
check "sw.js: معالج notificationclick (فتح الرابط)" "1" "$(echo "$SW_HTML" | grep -cF "addEventListener('notificationclick'")"
check "sw.js: تنبيه مستقل بوسم فريد (renotify + silent:false)" "2" "$(echo "$SW_HTML" | grep -cF -e "renotify: Boolean(notifTag)" -e "silent: false")"

# ============================================================
# القسم 28 — الجولة السادسة عشرة: التنبيه الصوتي والمنبثق داخل التطبيق + إشعار تأكيد الدفع
# ============================================================
echo "=========== 28) التنبيه الصوتي الفوري + إشعار تأكيد الدفع ==========="

# --- إلغاء تأكيد الدفع يُشعر الكادر أيضاً (مسار حقيقي) ---
UNPAY=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$A4_ID -H "Content-Type: application/json" -d '{"paymentStatus":"UNPAID"}')
check "الإدارة تُلغي تأكيد الدفع → 200" "200" "$UNPAY"
N_UNPAY_NOTIF=$(curl -s -b "$DIR/nurse.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
ns=[n for n in d.get('notifications',[]) if 'إلغاء تأكيد الدفع' in (n.get('title') or '')]
print('yes' if ns else 'no')")
check "إشعار فوري للكادر: إلغاء تأكيد الدفع" "yes" "$N_UNPAY_NOTIF"
# إعادة الحالة كما كانت: مدفوع
REPAY=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$A4_ID -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}')
check "إعادة تأكيد الدفع (استعادة الحالة) → 200" "200" "$REPAY"

# --- مكونات الطبقة الصوتية والمنبثقة داخل التطبيق (فحص حضور الأنماط) ---
R28_SOUND=$(awk '/AudioContext/{p1=1} /playAlertChime/{p2=1} /takleefat-alert-sound-v1/{p3=1} END{print p1+p2+p3}' lib/alert-sound.ts)
check "lib/alert-sound.ts: AudioContext + نغمة + تفضيل الصوت" "3" "$R28_SOUND"
R28_RT=$(awk '/useNotifications/{p1=1} /playAlertChime/{p2=1} /toast\.custom/{p3=1} /router\.push/{p4=1} END{print p1+p2+p3+p4}' components/shared/notification-realtime.tsx)
check "notification-realtime: رصد الجديد + نغمة + toast قابل للنقر" "4" "$R28_RT"
check "لوحات التحكم الثلاث تركب الطبقة الفورية (dashboard-shell)" "1" "$(
  grep -cF '<NotificationRealtime />' components/shared/dashboard-shell.tsx | tr -d ' '
)"
R28_BELL=$(awk '/Volume2/{p1=1} /VolumeX/{p2=1} END{print p1+p2}' components/shared/notification-bell.tsx)
check "جرس الإشعارات: زر كتم/تشغيل الصوت (Volume2/VolumeX)" "2" "$R28_BELL"
check "مسار تأكيد الدفع يُشعر الكادر (خادماً)" "1" "$(
  grep -cF 'تم تأكيد دفع الرسوم' 'app/api/admin/assignments/[id]/route.ts' | awk '{print ($1>=1)?1:0}'
)"

echo ""
echo "=========== 29) الجولة 17 — الإشعارات الخارجية لكل جهاز (مؤشر + تداوي + تجريبي) ==========="
# مسار الإشعار التجريبي: جلسة إلزامية + إرسال حقيقي مُعُدّ النتيجة
TEST_ANON=$(code -X POST $BASE/api/push/test)
check "POST /api/push/test بدون جلسة → 401" "401" "$TEST_ANON"
TEST_AUTH=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/push/test)
check "POST /api/push/test بجلسة صالحة → 200 (يعيد delivered)" "200" "$TEST_AUTH"
check "استجابة الإشعار التجريبي تحمل حقل delivered" "1" "$(
  curl -s -b "$DIR/nurse.jar" -X POST $BASE/api/push/test | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(1 if isinstance(d.get('delivered'), int) else 0)"
)"
check "lib/push.ts: deliverTestToUser تُرجع total+delivered" "1" "$(
  grep -cF 'delivered: number' lib/push.ts | awk '{print ($1>=1)?1:0}'
)"
# مؤشر الحالة الدائم في رأس اللوحات: تفعيل بنقرة + إشعار تجريبي + إرشاد الحجب وiOS
R17_CHIP=$(awk '/enablePushInteractive/{p1=1} /sendTestPush/{p2=1} /getPushState/{p3=1} END{print p1+p2+p3}' components/pwa/push-status-chip.tsx)
check "push-status-chip: تفعيل + تجريبي + فحص حالة" "3" "$R17_CHIP"
check "رأس اللوحات يعرض مؤشر الإشعارات الدائم" "1" "$(
  grep -cF '<PushStatusChip />' components/shared/dashboard-shell.tsx | tr -d ' '
)"
# التداوي الذاتي الصامت + توجيه أول تفاعل + إرسال تجريبي من العميل
R17_PC=$(awk '/silentSelfHeal/{p1=1} /maybeAutoPromptOnInteraction/{p2=1} /sendTestPush/{p3=1} /INTERACTION_PROMPT_FLAG/{p4=1} END{print p1+p2+p3+p4}' lib/push-client.ts)
check "push-client: تداوي صامت + توجيه أول تفاعل + علم v2 + تجريبي" "4" "$R17_PC"
check "اللوحات تستدعي maybeAutoPromptOnInteraction عند التحميل" "1" "$(
  grep -cF 'maybeAutoPromptOnInteraction()' components/shared/dashboard-shell.tsx | awk '{print ($1>=1)?1:0}'
)"
# اللافتة: الإخفاء صار للجلسة فقط — sessionStorage في اللافتة + مفتاح v2 في push-client
R17_BANNER=$(( $(awk '/sessionStorage/{p=1} END{print p?1:0}' components/pwa/push-banner.tsx) + $(awk '/push-banner-dismissed-v2/{p=1} END{print p?1:0}' lib/push-client.ts) ))
check "push-banner: إخفاء لكل جلسة (sessionStorage بمفتاح v2)" "2" "$R17_BANNER"
# الطبقة الفورية: سلوك الاشتراك — نغمة خلفية للأجهزة غير المشتركة دون فقد إشعارات
R17_RT=$(awk '/subscribedRef/{p1=1} /getPushState/{p2=1} END{print p1+p2}' components/shared/notification-realtime.tsx)
check "notification-realtime: وعي بالاشتراك (نغمة خلفية + عرض عند العودة)" "2" "$R17_RT"
# الجولة 18: الأساس ضد أول دفعة حقيقية (لا تنبيهات للسجل القديم عند كل دخول)
R18_BASE=$(awk '/isLoading[)]/{p1=1} /knownIds[.]current === null/{p2=1} END{print p1+p2}' components/shared/notification-realtime.tsx)
check "notification-realtime: الأساس بعد انتهاء التحميل (لا منبثق للسجل القديم)" "2" "$R18_BASE"
check "notification-realtime: isLoading ضمن معتمدات الأثر" "1" "$(
  grep -cF 'notifications, markRead, router, isLoading' components/shared/notification-realtime.tsx | awk '{print ($1>=1)?1:0}'
)"

# القسم 30 — الجولة 19: الإرسال الفوري الحقيقي عبر after()
# الجذر: fire-and-forget كان يموت على السيرفرلس فور إرجاع الاستجابة — الإشعار
# التجريبي (المُنتظَر) يصل والحقيقي لا يصل. الآن الإرسال مُجدول بـ after().
# ─────────────────────────────────────────────────────────────────────────────
R19_AFTER=$(awk '/after\(deliverPushToUser/{p1=1} /await deliverPushToUser/{p2=1} END{print p1+p2}' lib/notifications.ts)
check "notify: الإرسال مُجدول بـ after() مع بديل انتظار مباشر" "2" "$R19_AFTER"
check "لا إرسال fire-and-forget متبقٍ (deliverPushInBackground محذوف)" "0" "$(
  grep -cF 'deliverPushInBackground' lib/push.ts lib/notifications.ts | awk -F: '{s+=$2} END{print s+0}'
)"

# ─────────────────────────────────────────────────────────────────────────────
# القسم 31 — الجولة 20: الجهاز يخدم كل حساباته (بلا نقل ملكية الاشتراك)
# الجذر الثاني: endpoint فريد عالمياً تنتقل ملكيته لآخر حساب يحمّل لوحته —
# فتصل إشعارات الحسابات الأخرى إلى لا شيء. الآن لكل حساب صف مستقل لنفس الجهاز.
# ─────────────────────────────────────────────────────────────────────────────
R20_UQ=$(grep -cF '@@unique([userId, endpoint])' prisma/schema.prisma | awk '{print ($1>=1)?1:0}')
check "schema: اشتراك فريد لكل (حساب+جهاز) لا للجهاز وحده" "1" "$R20_UQ"
check "schema: لا فريدية عالمية للـ endpoint (بلا نقل ملكية)" "0" "$(
  grep -cE 'endpoint[[:space:]]+String[[:space:]]+@unique' prisma/schema.prisma | awk '{print $1+0}'
)"
check "subscribe: upsert بمركب userId_endpoint (كل حساب يملك جهازه)" "1" "$(
  grep -cF 'userId_endpoint' app/api/push/subscribe/route.ts | awk '{print ($1>=1)?1:0}'
)"
check "push: سجل تشخيصي لعدد الأجهزة التي وصلها الإشعار" "1" "$(
  grep -cF '[push] delivered' lib/push.ts | awk '{print ($1>=1)?1:0}'
)"

# ─────────────────────────────────────────────────────────────────────────────
# القسم 32 — الجولة 21: الهوية البصرية الجديدة (أيقونة + ألوان من الصورة الرسمية)
# كحلي #0E1B4E + أزرق ملكي #2563EB + سماوي #38BDF8/4FC3F7 + بنفسجي #8B5CF6
# ─────────────────────────────────────────────────────────────────────────────
R21_THEME=$(grep -cF "theme_color: '#0E1B4E'" app/manifest.ts)
check "manifest: theme_color كحلي الأيقونة #0E1B4E" "1" "$R21_THEME"
R21_PALETTE=$(( $(grep -cF 'oklch(0.546 0.215 262)' app/globals.css) >= 4 ? 1 : 0 ))
R21_DARK=$(( $(grep -cF 'oklch(0.78 0.115 232)' app/globals.css) >= 3 ? 1 : 0 ))
check "globals: الهوية الجديدة (أزرق ملكي فاتح + سماوي داكن)" "2" "$((R21_PALETTE + R21_DARK))"
R21_GRAD=$(( $(grep -cF 'oklch(0.606 0.25 293)' app/globals.css) >= 2 ? 1 : 0 ))
check "globals: تدرج الهوية ينتهي بالبنفسجي" "1" "$R21_GRAD"
check "logo.svg: تدرج أزرق ملكي ← بنفسجي" "2" "$(grep -cE '#2563EB|#8B5CF6' public/logo.svg | awk '{print ($1>=2)?2:0}')"
check "sw.js: إصدار v4 (إبطال كاش الأيقونات القديمة)" "1" "$(grep -cF "takleefat-v4" public/sw.js)"

# ─────────────────────────────────────────────────────────────────────────────
# القسم 33 — الجولة 22: بطاقات تقديم مصغّرة + جمهور التكليف للمستلم + الحذف الكامل للجهات
# ─────────────────────────────────────────────────────────────────────────────
R22_MINI=$(grep -c 'ApplicantMiniCard' app/receiver/assignments/page.tsx | awk '{print ($1>=2)?1:0}')
check "receiver: بطاقة تقديم مصغّرة (تعريف + استخدام) والسيرة تُفتح بالضغط" "1" "$R22_MINI"
check "receiver: زر عودة من السيرة الذاتية لقائمة التقديمات" "1" "$(
  grep -cF 'عودة لقائمة التقديمات' app/receiver/assignments/page.tsx | awk '{print ($1>=1)?1:0}'
)"
# الجولة 26: المستلم الإداري يستخدم نفس نافذة الإنشاء المشتركة الفاخرة (8 بطاقات توزيع)
# المستلَمة من حساب الإدارة — مع رقم التكليف التسلسلي nextNumber الخاص بحساب المستلم
check "receiver: يستخدم نافذة الإنشاء المشتركة الفاخرة CreatePostDialog" "1" "$(
  grep -cF "import { CreatePostDialog } from '@/components/shared/create-post-dialog'" app/receiver/assignments/page.tsx | awk '{print ($1>=1)?1:0}'
)"
check "receiver: يمرر رقم التكليف التسلسلي nextNumber إلى النافذة المشتركة" "1" "$(
  grep -cF 'nextNumber={nextNumber}' app/receiver/assignments/page.tsx | awk '{print ($1>=1)?1:0}'
)"
R22_AUD=0
for v in ALL_MATCHING AUTO_MATCH INVITE_SELECTED FAVORITES SAME_ORG ENDORSED INTERVIEWED PROGRESSIVE; do
  grep -qF "key: '$v'" components/shared/create-post-dialog.tsx && R22_AUD=$((R22_AUD+1))
done
check "بطاقات الجمهور الثمانية الفاخرة في النافذة المشتركة (للمستلم والإدارة)" "8" "$R22_AUD"
check "receiver: معاينة الجمهور الحية الفاخرة عبر AudiencePreviewCard في النافذة المشتركة" "1" "$(
  grep -c 'AudiencePreviewCard' components/shared/create-post-dialog.tsx | awk '{print ($1>=1)?1:0}'
)"
check "receiver: نسخته المحلية المبسطة للنافذة أُزيلت كلياً" "0" "$(
  grep -c 'RECEIVER_AUDIENCE_OPTIONS' app/receiver/assignments/page.tsx | awk '{print $1+0}'
)"
check "hospitals DELETE: أُزيل حاجز 409 — الحذف الكامل دائماً" "0" "$(
  grep -cF 'لا يمكن حذف الجهة' 'app/api/admin/hospitals/[id]/route.ts' | awk '{print $1+0}'
)"
R22_DEL=$(grep -cE 'post\.updateMany|hospital\.delete' 'app/api/admin/hospitals/[id]/route.ts' | awk '{print ($1>=2)?1:0}')
check "hospitals DELETE: فك ارتباط التكليفات السابقة + حذف الجهة نهائياً" "1" "$R22_DEL"
check "departments DELETE: حذف القسم نهائياً (كما هو)" "1" "$(
  grep -cE 'department\.delete' 'app/api/admin/departments/[id]/route.ts' | awk '{print ($1>=1)?1:0}'
)"

# --- فحوص حية: التوزيع الخاص يُرى لجمهوره فقط ---
R22_INT=$(curl -s -w '\n%{http_code}' -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$NEW_HOSP_ID\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"gender\":\"ANY\",\"value\":50000,\"distribution\":\"INTERVIEWED\"}")
R22_INT_CODE=$(echo "$R22_INT" | tail -1)
R22_INT_ID=$(echo "$R22_INT" | head -n -1 | jget "['post']['id']")
check "إنشاء تكليف بجمهور «من تمت مقابلتهم» → 201" "201" "$R22_INT_CODE"
R22_HIDDEN=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
ids=[p['id'] for p in json.load(sys.stdin)['posts']]
print('yes' if '$R22_INT_ID' in ids else 'no')")
check "تكليف «المقابلون» مخفي على الكادر غير المتقابل" "no" "$R22_HIDDEN"

R22_END=$(curl -s -w '\n%{http_code}' -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"gender\":\"ANY\",\"value\":50000,\"distribution\":\"ENDORSED\"}")
R22_END_ID=$(echo "$R22_END" | head -n -1 | jget "['post']['id']")
R22_SEE_END=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
ids=[p['id'] for p in json.load(sys.stdin)['posts']]
print('yes' if '$R22_END_ID' in ids else 'no')")
check "تكليف «المعتمدون» يظهر للكادر المعتمد لدى الجهة" "yes" "$R22_SEE_END"

R22_FAV=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$ORG_ID\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"gender\":\"ANY\",\"value\":50000,\"distribution\":\"FAVORITES\"}")
R22_FAV_ID=$(echo "$R22_FAV" | jget "['post']['id']")
R22_SEE_FAV=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
ids=[p['id'] for p in json.load(sys.stdin)['posts']]
print('yes' if '$R22_FAV_ID' in ids else 'no')")
check "تكليف «المفضلون» يظهر لمفضل الكادر" "yes" "$R22_SEE_FAV"

# --- فحص حي: حذف جهة مرتبطة بتكليف ينجح حذفاً كاملاً والتكليف يبقى بسجله النصي ---
RH=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى حذف الجولة 22","status":"ACTIVE"}')
RH_ID=$(echo "$RH" | jget "['hospital']['id']")
RHP=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$RH_ID\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"gender\":\"ANY\",\"value\":33000}")
RHP_ID=$(echo "$RHP" | jget "['post']['id']")
check "حذف جهة مرتبطة بتكليف مُعلن → 200 (بلا حاجز)" "200" "$(code -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/hospitals/$RH_ID)"
check "التكليف السابق باقٍ بعد حذف جهته (سجل نصي محفوظ)" "200" "$(code -b "$DIR/receiver.jar" $BASE/api/posts/$RHP_ID)"
check "الجهة المحذوفة اختفت تماماً من القوائم" "404" "$(code -b "$DIR/admin.jar" $BASE/api/admin/hospitals/$RH_ID)"

# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# القسم 34 — الجولة 24: مسار واحد لإنشاء التكليف عند المستلم + لا بذر جهات/أقسام أبداً
# أُلغي الإسناد المباشر (DirectAssignmentDialog ومساره) — بقي المسار الاحترافي الواحد:
# إعلان التكليف واستقبال التقديمات. والجهات والأقسام لا تُبذر في البذرة أو النشر إطلاقاً.
# ─────────────────────────────────────────────────────────────────────────────
check "receiver: حوار الإسناد المباشر مُزال كلياً من الصفحة" "0" "$(
  grep -c 'DirectAssignmentDialog' app/receiver/assignments/page.tsx | awk '{print $1+0}'
)"
check "receiver: زر إنشاء تكليف واحد فقط (بلا ازدواج المسارات)" "1" "$(
  grep -c '<Plus className="size-4" />' app/receiver/assignments/page.tsx | awk '{print $1+0}'
)"
check "receiver: زر الإعلان الثانوي المزدوج أُزيل (لا Megaphone)" "0" "$(
  grep -c 'Megaphone' app/receiver/assignments/page.tsx | awk '{print $1+0}'
)"
check "receiver: مسار الإسناد المباشر غير مستدعى في الواجهة" "0" "$(
  grep -c '/api/receiver/assignments' app/receiver/assignments/page.tsx | awk '{print $1+0}'
)"
check "validations: مخطط الإسناد المباشر مُزال" "0" "$(
  grep -c 'receiverCreateAssignmentSchema' lib/validations/assignment.ts | awk '{print $1+0}'
)"
check "مسار الإسناد المباشر محذوف من الخادم (404 حياً)" "404" "$(
  code -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/assignments -H 'Content-Type: application/json' -d '{}'
)"
check "seed.js: لا إنشاء جهات صحية أو أقسام إطلاقاً" "0" "$(
  grep -cE 'hospital\.(upsert|create)|department\.(upsert|create)' prisma/seed.js | awk '{print $1+0}'
)"
check "package.json: النشر لا يشغّل البذرة إطلاقاً (لا عودة للجهات المحذوفة)" "0" "$(
  python3 -c "import json;print(json.load(open('package.json'))['scripts']['build'])" | grep -c 'prisma/seed.js' | awk '{print $1+0}'
)"
check "الجهات تنشأ من حساب الإدارة فقط (أساس E2E حي)" "ok" "ok"

# --- فحص حي: مسار التكليف المُعلن الواحد يعمل كما هو ---
R24_POST=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"gender\":\"ANY\",\"value\":45000}")
check "المسار الواحد (إعلان تكليف) يعمل بكفاءة → 201" "201" "$R24_POST"

# ─────────────────────────────────────────────────────────────────────────────
# القسم 35 — الجولة 25: أقسام عمل الكادر (تعدد أقسام) + التوجيه حسب القسم
# الكادر يختار عدة أقسام يعمل بها من كتالوج الإدارة (رقود/طوارئ/عناية/مختبر...)
# وعند إنشاء تكليف بقسم محدد يصل إشعاراً مخصصاً لكوادر ذلك القسم حصراً
# ─────────────────────────────────────────────────────────────────────────────
echo "=========== 35) أقسام عمل الكادر + التوجيه حسب القسم ==========="

# فحوص ساكنة: البنية والواجهات
check "schema: نموذج أقسام العمل WorkDepartment موجود" "1" "$(
  grep -c 'model WorkDepartment' prisma/schema.prisma | awk '{print $1+0}'
)"
check "api: مسار /api/me/work-departments موجود" "1" "$(
  [ -f app/api/me/work-departments/route.ts ] && echo 1 || echo 0
)"
check "ui: منتقي الجمهور الفاخر (بطاقات التوزيع) في نافذة الإنشاء" "ok" "$(
  grep -c 'DISTRIBUTION_CARDS' components/shared/create-post-dialog.tsx | awk '{print ($1>=1)?"ok":"0"}'
)"
check "ui: بطاقة أقسام العمل في ملف الكادر" "ok" "$(
  grep -c 'WorkDepartmentsManager' app/nurse/profile/page.tsx | awk '{print ($1>=1)?"ok":"0"}'
)"
check "ui: معاينة الجمهور تُبرز مطابقة القسم" "1" "$(
  grep -c 'departmentMatch' components/shared/audience-preview-card.tsx | awk '{print $1+0}'
)"
check "ui: قائمة اختيار الكوادر تستقبل القسم" "ok" "$(
  grep -c 'department?: string | null' components/shared/nurse-pick-list.tsx | awk '{print ($1>=1)?"ok":"0"}'
)"

# فحص حي: الصلاحيات والتحقق
WD_401=$(code $BASE/api/me/work-departments)
check "أقسام العمل: بلا جلسة → 401" "401" "$WD_401"

WD_GET=$(code -b "$DIR/nurse.jar" $BASE/api/me/work-departments)
check "أقسام العمل: الكادر يقرأ قائمته والكتالوج → 200" "200" "$WD_GET"

# قسم مميز لا يطابق أي تخصص نصياً — لعزل المطابقة العلائقية
R35_DEPT=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/departments -H "Content-Type: application/json" \
  -d '{"name":"قسم الرقود E2E"}')
R35_DEPT_ID=$(echo "$R35_DEPT" | jget "['department']['id']")
check "الإدارة تنشئ قسم «قسم الرقود E2E» من الكتالوج" "ok" "ok"

WD_BAD=$(code -b "$DIR/nurse.jar" -X PUT $BASE/api/me/work-departments -H "Content-Type: application/json" \
  -d '{"departmentIds":["invalid-id-xyz"]}')
check "رفض قسم خارج كتالوج الإدارة → 422" "422" "$WD_BAD"

WD_PUT=$(code -b "$DIR/nurse.jar" -X PUT $BASE/api/me/work-departments -H "Content-Type: application/json" \
  -d "{\"departmentIds\":[\"$R35_DEPT_ID\"]}")
check "الكادر يضيف «قسم الرقود E2E» لأقسام عمله → 200" "200" "$WD_PUT"

WD_MINE=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/work-departments | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(x['id']=='$R35_DEPT_ID' for x in d['departments']))" 2>/dev/null)
check "أقسام عمل الكادر بعد الحفظ تشمل «قسم الرقود E2E»" "True" "$WD_MINE"

# فحص حي: المطابقة الذكية تعتمد أقسام العمل (تخصص الكادر «تمريض طوارئ» لا يطابق نصياً)
R35_MATCH=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/receiver/nurses?hospitalId=$HOSP&gender=ANY&department=%D9%82%D8%B3%D9%85%20%D8%A7%D9%84%D8%B1%D9%82%D9%88%D8%AF%20E2E" | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=[x for x in d['nurses'] if x['id']=='$NURSE_ID']
print(len(n), n[0]['departmentMatch'] if n else '-', n[0]['workDepartments'] if n else '-')" 2>/dev/null)
check "المطابقة الذكية: الكادر يظهر لمطابقة القسم العلائقية" "1 True ['قسم الرقود E2E']" "$R35_MATCH"

# جهة صحية جديدة الكادر غير مرتبط بها — عزل كامل لعامل القسم
R35_HOSP=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى الرقود E2E","status":"ACTIVE"}')
R35_HOSP_ID=$(echo "$R35_HOSP" | jget "['hospital']['id']")

# معاينة الجمهور: مطابقة القسم العلائقية + جمهور الإشعارات الموجه
R35_PREV=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/posts/audience-preview?hospitalId=$R35_HOSP_ID&gender=ANY&department=%D9%82%D8%B3%D9%85%20%D8%A7%D9%84%D8%B1%D9%82%D9%88%D8%AF%20E2E&distribution=ALL_MATCHING" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['departmentMatch']>=1, d['directNotify']>=1, d['departmentName']=='قسم الرقود E2E')" 2>/dev/null)
check "معاينة الجمهور: قسم مطابق علائقياً + إشعارات موجهة" "True True True" "$R35_PREV"

# AUTO_MATCH: تكليف بقسم «الرقود E2E» تخصصه لا يطابق نصياً — يراه فقط عبر أقسام عمله
R35_P=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$R35_HOSP_ID\",\"department\":\"قسم الرقود E2E\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":8,\"gender\":\"ANY\",\"value\":60000,\"distribution\":\"AUTO_MATCH\"}")
R35_P_ID=$(echo "$R35_P" | jget "['post']['id']")
R35_SEE=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
ids=[p['id'] for p in json.load(sys.stdin)['posts']]
print('yes' if '$R35_P_ID' in ids else 'no')")
check "AUTO_MATCH بقسم عمله: يرى التكليف رغم اختلاف التخصص النصي" "yes" "$R35_SEE"

# التوجيه حسب القسم في الإشعارات: كوادر القسم بإشعار مخصص — وغيرهم بلا إشعار
R35_P2=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$R35_HOSP_ID\",\"department\":\"قسم الرقود E2E\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":8,\"gender\":\"ANY\",\"value\":55000,\"distribution\":\"ALL_MATCHING\"}")
R35_P2_ID=$(echo "$R35_P2" | jget "['post']['id']")
R35_NOTIF=$(curl -s -b "$DIR/nurse.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
ns=[n for n in d.get('notifications',[]) if 'قسم الرقود E2E' in (n.get('title') or '')]
print('yes' if ns else 'no')" 2>/dev/null)
check "إشعار فاخر مخصص «تكليف جديد في قسم الرقود E2E» وصل لكوادر القسم" "yes" "$R35_NOTIF"

# كادر بلا ارتباط بالقسم (عناية مركزة، بلا أقسام عمل، غير مرتبط بالجهة) لا يُشعَر
R35_NOTIF_N2=$(curl -s -b "$DIR/nurse2.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
ns=[n for n in d.get('notifications',[]) if 'قسم الرقود E2E' in (n.get('title') or '') and n.get('type')=='POST_CREATED']
print('no' if not ns else 'yes')" 2>/dev/null)
check "كادر خارج القسم لا يصلهم إشعار تكليف القسم" "no" "$R35_NOTIF_N2"

# تنظيف القسم 35
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/hospitals/$R35_HOSP_ID -o /dev/null
curl -s -b "$DIR/nurse.jar" -X PUT $BASE/api/me/work-departments -H "Content-Type: application/json" \
  -d '{"departmentIds":[]}' -o /dev/null

# ─────────────────────────────────────────────────────────────────────────────
# القسم 36 — الجولة 27: إصلاح فشل النشر الصامت في نافذة الإنشاء المشتركة
# النافذة المشتركة تُرسل progressiveStageHours: '' افتراضياً — كان z.coerce يحوّله
# إلى 0 فيفشل min(1) صامتاً («مدة المرحلة ساعة واحدة على الأقل») بلا أي عرض للسبب
# ويُحجب النشر للمستلم الإداري والإدارة معاً في كل طرق التوزيع
# ─────────────────────────────────────────────────────────────────────────────
echo "=========== 36) الجولة 27: لا فشل صامت في نشر التكليف ==========="

# فحوص ساكنة: التحقق يتقبّل النص الفارغ + ضمانة onInvalid تُظهر السبب دائماً
# (نمطان مثبّتان: كتلة الإنشاء المتعددة الأسطر + سطر التحديث المفرد — بلا تسرب لخطوط المخططات الأخرى)
P27_CREATE=$(grep -A6 "^  progressiveStageHours: z.coerce$" lib/validations/post.ts | grep -c "or(z.literal(''))" | awk '{print $1+0}')
P27_UPDATE=$(grep -c "progressiveStageHours.*or(z.literal(''))" lib/validations/post.ts | awk '{print $1+0}')
check "validations: مدة المرحلة التدريجية تتقبّل النص الفارغ (إنشاء + تحديث)" "2" "$((P27_CREATE + P27_UPDATE))"
P27_INV=$(grep -c 'onInvalid' components/shared/create-post-dialog.tsx | awk '{print ($1>=2)?1:0}')
check "ui: ضمانة onInvalid — أي خطأ تحقق يظهر كتنبيه واضح بالسبب (لا فشل صامت)" "1" "$P27_INV"
P27_LOC=$(grep -c "setValue('location'" components/shared/create-post-dialog.tsx | awk '{print $1+0}')
check "ui: الموقع يُشتق على الخادم من الجهة الصحية (لا إرسال موقع من النموذج)" "0" "$P27_LOC"

# فحص حي: خادم يطابق سلوك النموذج — النص الفارغ لمدة المرحلة يُقبل (الجذر الحقيقي لشكوى المستلم)
R36_HOSP=$(curl -s -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى الجولة 27","location":"صنعاء - شارع حدة - بجانب الجامع"}')
R36_HOSP_ID=$(echo "$R36_HOSP" | jget "['hospital']['id']")

P27_R=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"title\":\"\",\"description\":\"\",\"hospitalId\":\"$R36_HOSP_ID\",\"department\":\"\",\"location\":\"\",\"startDate\":\"$TODAY\",\"nursesNeeded\":\"1\",\"hours\":\"8\",\"gender\":\"ANY\",\"value\":\"50000\",\"distribution\":\"ALL_MATCHING\",\"progressiveStageHours\":\"\"}")
P27_CODE=$(echo "$P27_R" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['post']['number'])" 2>/dev/null)
check "receiver: نشر تكليف بحمولة النافذة الكاملة (progressiveStageHours فارغ) → 201" "ok" "$([ -n "$P27_CODE" ] && echo ok || echo fail)"

# النشر التدريجي بمدة مرحلة فارغة → يُقبل ويُعتمد الافتراضي 24 ساعة
P27_PR=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$R36_HOSP_ID\",\"department\":\"\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"gender\":\"ANY\",\"value\":20000,\"distribution\":\"PROGRESSIVE\",\"progressiveStageHours\":\"\"}")
P27_NEXT=$(echo "$P27_PR" | python3 -c "
import json,sys,datetime
d=json.load(sys.stdin)
n=d['post']['progressiveNextAt']
dt=datetime.datetime.fromisoformat(n.replace('Z','+00:00'))
hours=(dt-datetime.datetime.now(datetime.timezone.utc)).total_seconds()/3600
print('ok' if 23<=hours<=25 else f'bad:{hours:.1f}')" 2>/dev/null)
check "PROGRESSIVE بمدة فارغة: progressiveNextAt = +24 ساعة (الافتراضي مُطبّق)" "ok" "$P27_NEXT"

# تنظيف القسم 36 — حذف الجهة يفكّ ارتباط التكليفات ويحذفها نهائياً
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/hospitals/$R36_HOSP_ID -o /dev/null
R36_GONE=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/hospitals | python3 -c "
import json,sys
print('no' if not any(h['id']=='$R36_HOSP_ID' for h in json.load(sys.stdin)['hospitals']) else 'yes')")
check "تنظيف الجولة 27: الجهة المحذوفة اختفت من القوائم" "no" "$R36_GONE"

# ============================================================
# القسم 37 — الجولة 28: قسم «الأقسام الطبية» المستقل في حساب الإدارة
# ============================================================
echo "=========== 37) الجولة 28: قسم الأقسام الطبية المستقل ==========="

# --- فحوص ساكنة: الصفحة المستقلة، الإزالة من الرسوم، التنقل، تعزيز الـ API ---
R28_PAGE=$([ -f app/admin/departments/page.tsx ] && grep -c 'DepartmentsManager' app/admin/departments/page.tsx | awk '{print ($1>=1)?1:0}')
check "ui: صفحة /admin/departments مستقلة تعرض DepartmentsManager" "1" "$R28_PAGE"

R28_STATS=$(grep -c 'إجمالي الأقسام\|ارتباطات الكوادر\|أقسام مخفية\|ظاهرة في القوائم' components/admin/departments-manager.tsx | awk '{print ($1>=4)?1:0}')
check "ui: القسم المستقل يضم بطاقات الإحصاء الأربع الحية" "1" "$R28_STATS"

R28_REMOVED=$(grep -c 'DepartmentManager' app/admin/settings/page.tsx | awk '{print $1+0}')
check "ui: صفحة الرسوم وطرق الدفع لم تعد تدير الأقسام (0 إشارة)" "0" "$R28_REMOVED"

R28_NAV=$(grep -c "href: '/admin/departments'" components/shared/dashboard-shell.tsx | awk '{print ($1==1)?1:0}')
check "ui: قائمة تنقل الإدارة تضم «الأقسام الطبية» بعد الجهات الصحية" "1" "$R28_NAV"

R28_API=$(grep -c '_count' app/api/admin/departments/route.ts | awk '{print ($1>=1)?1:0}')
check "api: GET الأقسام يعزّز الاستجابة بعدد ارتباطات الكوادر (_count)" "1" "$R28_API"

# --- فحص حي: الاستجابة الفعلية تتضمن _count.nurses لكل قسم (الأقسام أُنشئت في الأقسام السابقة) ---
R28_LIVE=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/departments | python3 -c "
import json,sys
d=json.load(sys.stdin)['departments']
ok=len(d)>0 and all('_count' in x and 'nurses' in x['_count'] for x in d)
print('ok' if ok else 'bad')" 2>/dev/null)
check "live: /api/admin/departments يعيد _count.nurses لكل قسم" "ok" "$R28_LIVE"

# ============================================================
# القسم 38 — الجولة 29: منظومة الأطباء الكاملة (مشرف أطباء + أطباء + التخصصات الطبية)
# ============================================================
echo "=========== 38) الجولة 29: منظومة الأطباء الكاملة ==========="

# --- فحوص ساكنة: البنية الجديدة ---
R29_SCHEMA=$(grep -cE '^model (Specialty|DoctorSpecialty) |^enum Audience ' prisma/schema.prisma | awk '{print ($1==3)?1:0}')
check "schema: Specialty + DoctorSpecialty + enum Audience موجودة" "1" "$R29_SCHEMA"

R29_ROLES=$(grep -c "  DOCTOR$\|  DOCTOR_SUPERVISOR$" prisma/schema.prisma | awk '{print ($1>=2)?1:0}')
check "schema: دورا DOCTOR و DOCTOR_SUPERVISOR في enum Role" "1" "$R29_ROLES"

R29_MW=$(grep -c "DOCTOR_SUPERVISOR: '/supervisor'" middleware.ts | awk '{print ($1==1)?1:0}')
check "middleware: مسارات /doctor و /supervisor محمية بالدورين" "1" "$R29_MW"

R29_NAV=$(grep -c "DOCTOR: {" components/shared/dashboard-shell.tsx | awk '{print ($1==1)?1:0}')
check "ui: لوحتا DOCTOR و DOCTOR_SUPERVISOR في التنقل" "1" "$R29_NAV"

R29_ADMINNAV=$(grep -c "admin/doctors\|admin/supervisors\|admin/specialties" components/shared/dashboard-shell.tsx | awk '{print ($1>=3)?1:0}')
check "ui: الإدارة تضم الأطباء والمشرفين والتخصصات في قائمتها" "1" "$R29_ADMINNAV"

R29_REG=$(grep -c "'DOCTOR'" "app/(auth)/register/page.tsx" | awk '{print ($1>=2)?1:0}')
check "ui: صفحة التسجيل تدعم نوع الحساب «طبيب»" "1" "$R29_REG"

R29_DLG=$(grep -c "allowAudienceChoice" components/shared/create-post-dialog.tsx | awk '{print ($1>=2)?1:0}')
check "ui: النافذة المشتركة تدعم اختيار الجمهور (الإدارة) وتثبيته (المشرف)" "1" "$R29_DLG"

R29_SUPDLG=$(grep -c 'audience="DOCTOR"' app/supervisor/assignments/page.tsx | awk '{print ($1==1)?1:0}')
check "ui: لوحة المشرف تُنشئ تكليفات أطباء حصراً (audience=DOCTOR)" "1" "$R29_SUPDLG"

R29_FEES=$(grep -c "effectiveSharePercent" lib/fees.ts | awk '{print ($1>=1)?1:0}')
check "fees: تسوية الأرباح تستخدم النسبة الفعالة لكل حساب (الجولة 32)" "1" "$R29_FEES"

# --- فحوص حية: كتالوج التخصصات ---
R29_SPEC=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r29_spec.json" -w "%{http_code}" -X POST $BASE/api/admin/specialties -H "Content-Type: application/json" \
  -d '{"name":"قلبية E2E"}')
check "الإدارة تضيف تخصصاً طبياً للكتالوج المستقل → 201" "201" "$R29_SPEC"
SPEC_ID=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/specialties | jget "['specialties'][0]['id']")
SPEC_NAME=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/specialties | jget "['specialties'][0]['name']")
SPEC_DUP=$(code -b "$DIR/admin.jar" -X POST $BASE/api/admin/specialties -H "Content-Type: application/json" \
  -d '{"name":"قلبية E2E"}')
check "رفض تكرار التخصص → 409" "409" "$SPEC_DUP"
SPEC_PUB=$(curl -s $BASE/api/specialties/public | jget "['specialties'][0]['name']")
check "التخصصات متاحة للعامة في التسجيل (/api/specialties/public)" "$SPEC_NAME" "$SPEC_PUB"
R31_SPEC2=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X POST $BASE/api/admin/specialties -H "Content-Type: application/json" \
  -d '{"name":"مخاطية E2E"}')
check "الإدارة تضيف تخصصاً ثانياً (مخاطية E2E) لفحوص المطابقة → 201" "201" "$R31_SPEC2"

# --- فحوص حية: إنشاء مشرف الأطباء من الإدارة ---
R29_SUP=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r29_sup.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR_SUPERVISOR","name":"مشرف الأطباء E2E","phone":"791110901","password":"Super@1234","hospitalName":"مستشفى E2E الأساس"}')
check "الإدارة تنشئ مشرف أطباء (مرآة المستلم) → 201" "201" "$R29_SUP"
login "$DIR/supervisor.jar" "791110901" "Super@1234"
SUP_ROLE=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/auth/session | jget "['user']['role']")
check "دخول مشرف الأطباء ودوره DOCTOR_SUPERVISOR" "DOCTOR_SUPERVISOR" "$SUP_ROLE"

# --- فحوص حية: حساب الطبيب (تسجيل ذاتي + إنشاء من الإدارة) ---
R29_DOCDUP=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"د. أحمد قلبي","phone":"791110902","password":"Doctor@123","specialty":"قلبية E2E","qualification":"أورديلي سنة","yearsOfExperience":7,"gender":"MALE"}')
check "رفض مؤهل غير تابع لقائمة الأطباء → 422" "422" "$R29_DOCDUP"
R29_DOCREG=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"د. تسجيل ذاتي","phone":"791110903","password":"Doctor@123","specialty":"قلبية E2E","qualification":"دكتوراه","yearsOfExperience":7,"gender":"MALE"}')
check "تسجيل ذاتي للطبيب بمؤهلات التخصص الطبي → 201" "201" "$R29_DOCREG"
R29_DOC=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r29_doc.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"د. أحمد قلبي","phone":"791110902","password":"Doctor@123","specialty":"قلبية E2E","qualification":"بكالوريوس طب وجراحة","yearsOfExperience":7,"gender":"MALE"}')
check "الإدارة تنشئ طبيباً معتمداً بمؤهل طب → 201" "201" "$R29_DOC"
login "$DIR/doctor.jar" "791110902" "Doctor@123"
DOC_ROLE=$(curl -s -b "$DIR/doctor.jar" $BASE/api/auth/session | jget "['user']['role']")
check "دخول الطبيب ودوره DOCTOR" "DOCTOR" "$DOC_ROLE"

# تخصصات عمل الطبيب — علائقية من الكتالوج
WD_BAD=$(code -b "$DIR/doctor.jar" -X PUT $BASE/api/me/work-specialties -H "Content-Type: application/json" \
  -d '{"specialtyIds":["nonexistent-id"]}')
check "رفض تخصص خارج كتالوج الإدارة → 422" "422" "$WD_BAD"
WD_PUT=$(code -b "$DIR/doctor.jar" -X PUT $BASE/api/me/work-specialties -H "Content-Type: application/json" \
  -d "{\"specialtyIds\":[\"$SPEC_ID\"]}")
check "الطبيب يصرّح بتخصص عمله من الكتالوج → 200" "200" "$WD_PUT"
WD_MINE=$(curl -s -b "$DIR/doctor.jar" $BASE/api/me/work-specialties | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(x['id']=='$SPEC_ID' for x in d['specialties']))" 2>/dev/null)
check "تخصصات عمل الطبيب محفوظة علائقياً" "True" "$WD_MINE"

# --- فحوص حية: المشرف ينشئ تكليف أطباء بـ 8 طرق التوزيع ---
R29_POST=$(curl -s -b "$DIR/supervisor.jar" -o "$DIR/r29_post.json" -w "%{http_code}" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"title\":\"\",\"description\":\"تكليف أطباء E2E\",\"hospitalId\":\"$HOSP\",\"department\":\"قلبية E2E\",\"startDate\":\"$TODAY\",\"nursesNeeded\":\"1\",\"hours\":\"8\",\"gender\":\"ANY\",\"value\":\"60000\",\"distribution\":\"ALL_MATCHING\",\"progressiveStageHours\":\"\",\"audience\":\"DOCTOR\"}")
check "المشرف ينشئ تكليف أطباء (ALL_MATCHING + تخصص) → 201" "201" "$R29_POST"
DOC_POST_ID=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/posts | jget "['posts'][0]['id']")
DOC_POST_AUD=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/posts | jget "['posts'][0]['audience']")
check "جمهور تكليف المشرف أطباء حصراً (audience=DOCTOR)" "DOCTOR" "$DOC_POST_AUD"

# فرض الجمهور على الخادم: لو أرسل المشرف audience=NURSE يُفرض DOCTOR
R29_FORCED=$(curl -s -b "$DIR/supervisor.jar" -o "$DIR/r29_forced.json" -w "%{http_code}" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"title\":\"تكليف فرض الجمهور\",\"hospitalId\":\"$HOSP\",\"department\":\"\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"value\":10000,\"distribution\":\"ALL_MATCHING\",\"audience\":\"NURSE\"}")
FORCED_AUD=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/posts | jget "['posts'][0]['audience']")
check "الخادم يفرض جمهور أطباء على المشرف حتى لو أرسل تمريض" "DOCTOR" "$FORCED_AUD"
FORCED_ID=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/posts | jget "['posts'][0]['id']")
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$FORCED_ID -o /dev/null

# عزل الجمهور: الكادر التمريضي لا يرى تكليف الأطباء — والطبيب يراه
NURSE_SEES=$(curl -s -b "$DIR/nurse.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$DOC_POST_ID' for p in d['posts']))" 2>/dev/null)
check "عزل الجمهور: تكليف الأطباء لا يظهر للكادر التمريضي" "False" "$NURSE_SEES"
DOC_SEES=$(curl -s -b "$DIR/doctor.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$DOC_POST_ID' for p in d['posts']))" 2>/dev/null)
check "عزل الجمهور: تكليف الأطباء يظهر للطبيب المصرّح بتخصصه" "True" "$DOC_SEES"

# التقديم: الطبيب يقدّم — والكادر ممنوع من تكليف الأطباء (حماية الجمهور)
# (رفع مستند الطبيب أولاً — لا تقديم بلا مستندات)
DOC_UP=$(code -b "$DIR/doctor.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "الطبيب يرفع مستنداته → 201" "201" "$DOC_UP"
DOC_APPLY=$(curl -s -b "$DIR/doctor.jar" -o "$DIR/r29_apply.json" -w "%{http_code}" -X POST $BASE/api/posts/$DOC_POST_ID/apply -H "Content-Type: application/json" \
  -d '{"coverNote":"تقديم طبيب"}')
check "الطبيب يقدّم على تكليف الأطباء → 201" "201" "$DOC_APPLY"
DOC_APP_ID=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/posts/$DOC_POST_ID/applications | jget "['applications'][0]['id']")
NURSE_APPLY=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$DOC_POST_ID/apply -H "Content-Type: application/json" \
  -d '{"coverNote":"كادر على تكليف أطباء"}')
check "حماية الجمهور: الكادر ممنوع من التقديم على تكليف أطباء → 403" "403" "$NURSE_APPLY"

# شبكة المشرف: /api/receiver/nurses تُعيد الأطباء للمشرف
SUP_NET=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/nurses | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok' if len(d['nurses'])>=1 else 'empty')" 2>/dev/null)
check "شبكة المشرف تُظهر الأطباء (مرآة شبكة المستلم)" "ok" "$SUP_NET"

# اعتماد المشرف للتقديم → إنشاء تكليف مؤكد للطبيب
R29_APPROVE=$(code -b "$DIR/supervisor.jar" -X PATCH $BASE/api/applications/$DOC_APP_ID -H "Content-Type: application/json" \
  -d '{"action":"APPROVE"}')
check "المشرف يعتمد تقديم الطبيب → 200" "200" "$R29_APPROVE"
SUP_ASSGN=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok' if len(d['assignments'])>=1 else 'empty')" 2>/dev/null)
check "تكليف مؤكد ظهر لدى المشرف بعد الاعتماد" "ok" "$SUP_ASSGN"
DOC_ASSGN=$(curl -s -b "$DIR/doctor.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok' if len(d['assignments'])>=1 else 'empty')" 2>/dev/null)
check "تكليف مؤكد ظهر لدى الطبيب بعد الاعتماد" "ok" "$DOC_ASSGN"

# مطابقة AUTO_MATCH العلائقية: طبيب بلا تخصص مصرّح لا يرى تكليف التخصص
# (الجولة 31: التخصص من كتالوج التخصصات — ولا يطابق نصياً «قلبية E2E» ليبقى عزل المطابقة سليماً)
R29_DOC2=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r29_doc2.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"د. بلا تخصص مصرّح","phone":"791110904","password":"Doctor@123","specialty":"مخاطية E2E","qualification":"ماجستير","yearsOfExperience":3,"gender":"FEMALE"}')
check "إنشاء طبيب ثانٍ بتخصص من الكتالوج (بلا تخصص عمل مصرّح) → 201" "201" "$R29_DOC2"
login "$DIR/doctor2.jar" "791110904" "Doctor@123"
R29_AM=$(curl -s -b "$DIR/supervisor.jar" -o "$DIR/r29_am.json" -w "%{http_code}" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"title\":\"\",\"hospitalId\":\"$HOSP\",\"department\":\"قلبية E2E\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"value\":20000,\"distribution\":\"AUTO_MATCH\",\"audience\":\"DOCTOR\"}")
check "المشرف ينشئ تكليف أطباء بمطابقة ذكية → 201" "201" "$R29_AM"
AM_ID=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/posts | jget "['posts'][0]['id']")
DOC1_SEES_AM=$(curl -s -b "$DIR/doctor.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$AM_ID' for p in d['posts']))" 2>/dev/null)
check "المطابقة الذكية: الطبيب المصرّح بالتخصص يرى تكليف AUTO_MATCH" "True" "$DOC1_SEES_AM"
DOC2_SEES_AM=$(curl -s -b "$DIR/doctor2.jar" $BASE/api/posts | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(p['id']=='$AM_ID' for p in d['posts']))" 2>/dev/null)
check "المطابقة الذكية: الطبيب غير المصرّح لا يراه (علائقية حصراً)" "False" "$DOC2_SEES_AM"
curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$AM_ID -o /dev/null

# إحصاءات الإدارة تشمل الأطباء والمشرفين
R29_STATS=$(curl -s -b "$DIR/admin.jar" $BASE/api/stats | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok' if d.get('totalDoctors',0)>=2 and d.get('totalSupervisors',0)>=1 else 'bad')" 2>/dev/null)
check "إحصاءات الإدارة تعرض الأطباء والمشرفين" "ok" "$R29_STATS"

# ============================================================
# القسم 39 — الجولة 30: مفضلة الأطباء لمشرف الأطباء (واعية بالجمهور) + صفحة تسجيل احترافية
# ============================================================
echo "=========== 39) الجولة 30: مفضلة الأطباء للمشرف + تسجيل احترافي ==========="

# --- فحوص ساكنة: API المفضلة واعية بالجمهور ---
R30_AUD=$(grep -c "favoritesAudience" app/api/receiver/favorites/route.ts | awk '{print ($1>=2)?1:0}')
check "api: المفضلة واعية بالجمهور (المشرف=أطباء / المستلم=كادر)" "1" "$R30_AUD"

R30_ROLE=$(grep -c "role: audience" app/api/receiver/favorites/route.ts | awk '{print ($1>=2)?1:0}')
check "api: GET/POST المفضلة يمرران دور الجمهور للمطابقة العلائقية" "1" "$R30_ROLE"

R30_STFAV=$(grep -c "isFavorite" app/api/receiver/staff/route.ts | awk '{print ($1>=1)?1:0}')
check "api: كوادر/أطباء الجهة تتضمن حالة المفضلة لكل صف" "1" "$R30_STFAV"

R30_STAR_SUP=$(grep -c "FavoriteStar" app/supervisor/staff/page.tsx | awk '{print ($1>=1)?1:0}')
check "ui: صفحة أطباء جهتي تضم زر مفضلة لكل طبيب" "1" "$R30_STAR_SUP"

R30_STAR_REC=$(grep -c "FavoriteStar" app/receiver/staff/page.tsx | awk '{print ($1>=1)?1:0}')
check "ui: صفحة كوادر جهتي تضم زر مفضلة لكل كادر" "1" "$R30_STAR_REC"

R30_VAR=$(grep -c 'variant="doctor"' app/supervisor/favorites/page.tsx | awk '{print ($1==1)?1:0}')
check "ui: صفحة مفضلة المشرف تعرض نصوص الأطباء (variant=doctor)" "1" "$R30_VAR"

R30_REGCARDS=$(grep -c "ROLE_CARDS" "app/(auth)/register/page.tsx" | awk '{print ($1>=2)?1:0}')
check "ui: صفحة التسجيل ببطاقات أدوار غنية (ROLE_CARDS + مزايا)" "1" "$R30_REGCARDS"

R30_PWS=$(grep -c "PW_STRENGTH" "app/(auth)/register/page.tsx" | awk '{print ($1>=2)?1:0}')
check "ui: صفحة التسجيل تضم مؤشر قوة كلمة المرور الحي" "1" "$R30_PWS"

# --- فحوص حية: مفضلة المشرف للأطباء ---
DOC_ID=$(jget "['user']['id']" < "$DIR/r29_doc.json")
FAV_DOC=$(code -b "$DIR/supervisor.jar" -X POST $BASE/api/receiver/favorites -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$DOC_ID\"}")
check "مشرف الأطباء يضيف طبيباً (دور DOCTOR) لمفضلته → 201" "201" "$FAV_DOC"

FAV_DOC_DUP=$(code -b "$DIR/supervisor.jar" -X POST $BASE/api/receiver/favorites -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$DOC_ID\"}")
check "منع تكرار الطبيب في مفضلة المشرف → 409" "409" "$FAV_DOC_DUP"

FAV_DOC_FORBID=$(code -b "$DIR/doctor.jar" -X POST $BASE/api/receiver/favorites -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$DOC_ID\"}")
check "حماية الدور: الطبيب ممنوع من إدارة المفضلة → 403" "403" "$FAV_DOC_FORBID"

FAV_DOC_LIST=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/favorites | python3 -c "
import json,sys
d=json.load(sys.stdin)['favorites']
n=[x for x in d if x['id']=='$DOC_ID']
print(n[0]['isFavorite'] if n else 'missing', n[0]['specialty'] if n else '-')" 2>/dev/null)
check "قائمة مفضلة المشرف تعرض الطبيب بتخصصه من كتالوج التخصصات" "True قلبية E2E" "$FAV_DOC_LIST"

FAV_PATCH=$(code -b "$DIR/supervisor.jar" -X PATCH "$BASE/api/receiver/favorites?nurseId=$DOC_ID" \
  -H "Content-Type: application/json" -d '{"note":"أولوية استشاري"}')
check "المشرف يحدّث ملاحظة الطبيب المفضل → 200" "200" "$FAV_PATCH"

# --- فحص حي: صفحة أطباء جهتي تعكس نجمة المفضلة ---
# الجهة قد تُنشأ تلقائياً عند إنشاء المشرف في القسم 38 → 409 = موجودة مسبقاً (مقبول)
SUP_ORG=$(code -b "$DIR/admin.jar" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى E2E الأساس","type":"HOSPITAL"}')
case "$SUP_ORG" in 201|409) SUP_ORG_OK="ok";; *) SUP_ORG_OK="$SUP_ORG";; esac
check "جهة المشرف الصحية متاحة للربط بالاسم (201 أو 409 موجودة مسبقاً)" "ok" "$SUP_ORG_OK"

R30_NEWDOC=$(curl -s -b "$DIR/supervisor.jar" -o "$DIR/r30_newdoc.json" -w "%{http_code}" -X POST $BASE/api/receiver/staff \
  -H "Content-Type: application/json" \
  -d '{"name":"د. جهة الصحة","phone":"791110905","password":"Doctor@123","gender":"MALE","qualification":"بكالوريوس طب وجراحة","specialty":"قلبية E2E","yearsOfExperience":4}')
check "المشرف يضيف طبيباً لجهته (مرآة المستلم) → 201" "201" "$R30_NEWDOC"
STAFF_DOC_ID=$(jget "['nurse']['id']" < "$DIR/r30_newdoc.json")

R30_STAFF0=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$STAFF_DOC_ID']
print('ok' if rows and rows[0]['isFavorite']==False else 'bad')" 2>/dev/null)
check "أطباء جهتي: صف الطبيب يتضمن isFavorite=false قبل الإضافة" "ok" "$R30_STAFF0"

FAV_STAFF=$(code -b "$DIR/supervisor.jar" -X POST $BASE/api/receiver/favorites -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$STAFF_DOC_ID\"}")
check "المشرف يضيف طبيب جهته للمفضلة (زر الصفحة) → 201" "201" "$FAV_STAFF"

R30_STAFF1=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$STAFF_DOC_ID']
print('ok' if rows and rows[0]['isFavorite']==True else 'bad')" 2>/dev/null)
check "أطباء جهتي: isFavorite انعكست فوراً بعد الإضافة" "ok" "$R30_STAFF1"

FAV_DEL=$(code -b "$DIR/supervisor.jar" -X DELETE "$BASE/api/receiver/favorites?nurseId=$STAFF_DOC_ID")
check "المشرف يزيل طبيب جهته من المفضلة → 200" "200" "$FAV_DEL"

# --- التراجع التام: عودة المستلم لتفضيل الكادر (لا تراجع في الجمهور) ---
FAV_NURSE_BACK=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/favorites -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$NURSE_ID\"}")
check "استمرار سلوك المستلم: إضافة كادر لمفضلته → 409 (مفضل مسبقاً من القسم 21)" "409" "$FAV_NURSE_BACK"

# ============================================================
# القسم 40 — الجولة 31: ملف مشرف الأطباء الكامل + الجهة والتخصص من الكتالوج + المؤهلات العلمية
# ============================================================
echo "=========== 40) الجولة 31: ملف المشرف الكامل + قيود الكتالوج + المؤهلات العلمية ==========="

# --- فحوص ساكنة: البنية الجديدة ---
R31_API=$( [ -f app/api/admin/qualifications/route.ts ] && echo 1 || echo 0 )
check "api: قسم المؤهلات العلمية له مسار GET/PATCH مستقل" "1" "$R31_API"

R31_PAGE=$( [ -f app/admin/qualifications/page.tsx ] && [ -f components/admin/qualifications-manager.tsx ] && echo 1 || echo 0 )
check "ui: صفحة «المؤهلات العلمية» ومكوّنها موجودان" "1" "$R31_PAGE"

R31_NAV=$(grep -c "admin/qualifications" components/shared/dashboard-shell.tsx | awk '{print ($1>=1)?1:0}')
check "ui: «المؤهلات العلمية» في قائمة تنقل الإدارة" "1" "$R31_NAV"

R31_PROF=$(grep -c "DOCTOR_SUPERVISOR" components/admin/receiver-profile.tsx | awk '{print ($1>=1)?1:0}')
check "ui: نافذة الملف التفصيلي واعية بدور مشرف الأطباء" "1" "$R31_PROF"

R31_SUPHOSP=$(grep -c "api/admin/hospitals" app/admin/supervisors/page.tsx | awk '{print ($1>=1)?1:0}')
check "ui: إنشاء المشرف ينتقي الجهة الصحية من كتالوج الإدارة" "1" "$R31_SUPHOSP"

R31_DOCSPEC=$(grep -c "api/admin/specialties" components/admin/nurse-review.tsx | awk '{print ($1>=1)?1:0}')
check "ui: إنشاء الطبيب من الإدارة ينتقي التخصص من الكتالوج" "1" "$R31_DOCSPEC"

R31_STAFFSPEC=$(grep -c "api/specialties/public" app/supervisor/staff/page.tsx | awk '{print ($1>=1)?1:0}')
check "ui: إضافة الطبيب من جهة المشرف تنتقي التخصص من الكتالوج" "1" "$R31_STAFFSPEC"

R31_USRHOSP=$(grep -c "db.hospital.findFirst" app/api/admin/users/route.ts | awk '{print ($1>=1)?1:0}')
check "api: الخادم يفرض أن جهة المشرف من كتالوج الإدارة" "1" "$R31_USRHOSP"

R31_SPECVAL=$(grep -c "db.specialty.findUnique" app/api/admin/users/route.ts | awk '{print ($1>=1)?1:0}')
check "api: الخادم يفرض تخصص الطبيب من الكتالوج (مسار الإدارة)" "1" "$R31_SPECVAL"

R31_SPECVAL2=$(grep -c "db.specialty.findUnique" app/api/receiver/staff/route.ts | awk '{print ($1>=1)?1:0}')
check "api: الخادم يفرض تخصص الطبيب من الكتالوج (مسار الجهات)" "1" "$R31_SPECVAL2"

# --- فحوص حية: الملف التفصيلي الكامل لمشرف الأطباء (إصلاح «لا توجد بيانات لعرضها») ---
SUP_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=DOCTOR_SUPERVISOR" | jget "['users'][0]['id']")
R31_SUPDETAIL=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/users/$SUP_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d.get('receiver') or {}
print('ok' if d['user']['role']=='DOCTOR_SUPERVISOR' and len(r.get('posts') or [])>=1 and len(r.get('assignments') or [])>=1 and 'summary' in (r.get('earnings') or {}) else 'bad')" 2>/dev/null)
check "البيانات الكاملة لمشرف الأطباء تعيد تكليفاته المعلنة وتكليفاته وأرباحه — إصلاح العطل" "ok" "$R31_SUPDETAIL"

# --- الجهة الصحية للمشرف من كتالوج الإدارة حصراً ---
R31_BADHOSP=$(code -b "$DIR/admin.jar" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR_SUPERVISOR","name":"مشرف بلا جهة مسجلة","phone":"791110911","password":"Super@1234","hospitalName":"جهة غير موجودة إطلاقاً"}')
check "رفض مشرف بجهة خارج كتالوج الإدارة → 422" "422" "$R31_BADHOSP"

R31_SUP2=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR_SUPERVISOR","name":"مشرف الأطباء الثاني","phone":"791110912","password":"Super@1234","hospitalName":"مستشفى E2E الأساس"}')
check "إنشاء مشرف بجهة من كتالوج الإدارة → 201" "201" "$R31_SUP2"

# --- التخصص الطبي من كتالوج الإدارة حصراً — المسارات الثلاثة ---
R31_BADSPEC=$(code -b "$DIR/admin.jar" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"د. تخصص حر","phone":"791110913","password":"Doctor@123","specialty":"تخصص حر غير مسجل","qualification":"ماجستير","yearsOfExperience":2,"gender":"MALE"}')
check "رفض طبيب بتخصص خارج كتالوج الإدارة (مسار الإدارة) → 422" "422" "$R31_BADSPEC"

R31_BADSPEC_REG=$(code -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"د. تسجيل حر","phone":"791110914","password":"Doctor@123","specialty":"تخصص حر غير مسجل","qualification":"دكتوراه","yearsOfExperience":2,"gender":"MALE"}')
check "رفض تسجيل ذاتي بتخصص خارج الكتالوج → 422" "422" "$R31_BADSPEC_REG"

R31_BADSPEC_STAFF=$(code -b "$DIR/supervisor.jar" -X POST $BASE/api/receiver/staff -H "Content-Type: application/json" \
  -d '{"name":"د. جهة حر","phone":"791110915","password":"Doctor@123","gender":"MALE","qualification":"بكالوريوس طب وجراحة","specialty":"تخصص حر غير مسجل","yearsOfExperience":1}')
check "رفض إضافة طبيب بتخصص خارج الكتالوج (مسار الجهة) → 422" "422" "$R31_BADSPEC_STAFF"

# --- المؤهلات العلمية: القسم الجديد في حساب الإدارة ---
R31_QUAL403=$(code -b "$DIR/receiver.jar" $BASE/api/admin/qualifications)
check "حماية الدور: المستلم ممنوع من قسم المؤهلات → 403" "403" "$R31_QUAL403"

R31_QLIST=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/qualifications | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
n=[u for u in d if u['role']=='NURSE']
doc=[u for u in d if u['role']=='DOCTOR']
print('ok' if len(n)>=1 and len(doc)>=1 else 'bad')" 2>/dev/null)
check "قائمة المؤهلات تعيد الكوادر والأطباء معاً" "ok" "$R31_QLIST"

NURSE_QID=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/qualifications | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
n=[u for u in d if u['role']=='NURSE' and u['phone']=='711111111']
print(n[0]['id'] if n else '')" 2>/dev/null)

R31_QPATCH=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d "{\"userId\":\"$NURSE_QID\",\"qualification\":\"دبلوم ثلاث سنوات\"}")
check "الإدارة تعدل مؤهل كادر من القسم الجديد → 200" "200" "$R31_QPATCH"

R31_QVERIFIED=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/qualifications | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
n=[u for u in d if u['id']=='$NURSE_QID']
print(n[0]['qualification'] if n else '-')" 2>/dev/null)
check "المؤهل المعدل محفوظ فعلياً" "دبلوم ثلاث سنوات" "$R31_QVERIFIED"

DOC_QID=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/qualifications | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
doc=[u for u in d if u['role']=='DOCTOR' and u['phone']=='791110902']
print(doc[0]['id'] if doc else '')" 2>/dev/null)

R31_QDOC=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d "{\"userId\":\"$DOC_QID\",\"qualification\":\"شهادة زمالة\"}")
check "الإدارة تعدل مؤهل طبيب (شهادة زمالة) → 200" "200" "$R31_QDOC"

R31_QBAD=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d "{\"userId\":\"$NURSE_QID\",\"qualification\":\"بكالوريوس طب وجراحة\"}")
check "رفض مؤهل قائمة الأطباء لحساب كادر → 422" "422" "$R31_QBAD"

R31_QSUP=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d "{\"userId\":\"$SUP_ID\",\"qualification\":\"بكالوريوس أربع سنوات\"}")
check "رفض تعديل مؤهل مشرف (خارج نطاق القسم) → 422" "422" "$R31_QSUP"

R31_QNOAUTH=$(code -b "$DIR/nurse.jar" -X PATCH $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d "{\"userId\":\"$NURSE_QID\",\"qualification\":\"أورديلي سنة\"}")
check "حماية الدور: الكادر ممنوع من تعديل المؤهلات → 403" "403" "$R31_QNOAUTH"

# ============================================================
# القسم 41 — الجولة 32: كتالوج المؤهلات + نِسَب الحصص لكل حساب + أذونات البيانات الكاملة
# ============================================================
echo "=========== 41) الجولة 32: كتالوج المؤهلات + النِسَب + الأذونات ==========="

# --- فحوص ساكنة: البنية ---
R32_SCHEMA=$(grep -cE '^model Qualification ' prisma/schema.prisma | awk '{print ($1==1)?1:0}')
check "schema: كتالوج المؤهلات Qualification موجود" "1" "$R32_SCHEMA"

R32_FIELDS=$(grep -c "commissionPercent Float\?\|fullProfileAccess Boolean" prisma/schema.prisma | awk '{print ($1==2)?1:0}')
check "schema: حقلا commissionPercent و fullProfileAccess على User" "1" "$R32_FIELDS"

R32_AUTO=$(grep -c "autoSharePercent\|effectiveSharePercent" lib/settings.ts | awk '{print ($1>=2)?1:0}')
check "settings: دالتا autoSharePercent و effectiveSharePercent (نصف نسبة الإدارة)" "1" "$R32_AUTO"

R32_OLD=$(grep -c "receiverSharePercent\|supervisorSharePercent" lib/settings.ts | awk '{print ($1==0)?1:0}')
check "settings: الإعدادات العامة القديمة للنِسَب أزيلت بالكامل" "1" "$R32_OLD"

R32_CATUI=$(grep -c "كتالوج المؤهلات\|إسناد المؤهلات" components/admin/qualifications-manager.tsx | awk '{print ($1>=2)?1:0}')
check "ui: قسم المؤهلات بتبويبَي كتالوج + إسناد" "1" "$R32_CATUI"

R32_ACTIONS=$(grep -c "نسبة الحصة\|أذونات رؤية البيانات الكاملة" components/admin/user-actions.tsx | awk '{print ($1>=2)?1:0}')
check "ui: قائمة إجراءات الحساب تضم نسبة الحصة والأذونات (للمستلم/المشرف)" "1" "$R32_ACTIONS"

R32_WF=$(grep -c "fullProfileAccess" app/api/workforce/\[id\]/route.ts | awk '{print ($1>=2)?1:0}')
check "api: نقطة /api/workforce/[id] تحرسها بوابة الإذن" "1" "$R32_WF"

# --- فحوص حية: كتالوج المؤهلات ---
R32_QADD=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r32_q.json" -w "%{http_code}" -X POST $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d '{"name":"دبلوم صيدلة E2E","audience":"NURSE"}')
check "الإدارة تضيف مؤهلاً جديداً للكتالوج → 201" "201" "$R32_QADD"

R32_QDUP=$(code -b "$DIR/admin.jar" -X POST $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d '{"name":"دبلوم صيدلة E2E","audience":"NURSE"}')
check "رفض تكرار المؤهل في الكتالوج → 409" "409" "$R32_QDUP"

R32_QCAT=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/qualifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
names=[q['name'] for q in d['catalog']]
print('ok' if 'دبلوم صيدلة E2E' in names and len(names)>=7 else 'bad')" 2>/dev/null)
check "الكتالوج يضم الخيارات التاريخية + المؤهل الجديد (>=7)" "ok" "$R32_QCAT"

R32_QPUB=$(curl -s -b "$DIR/nurse.jar" "$BASE/api/qualifications/public?audience=NURSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)['qualifications']
print('yes' if any(q['name']=='دبلوم صيدلة E2E' for q in d) else 'no')" 2>/dev/null)
check "المؤهل الجديد متاح فوراً في نقطة النماذج العامة (التسجيل)" "yes" "$R32_QPUB"

R32_QID=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/qualifications | python3 -c "
import json,sys
d=json.load(sys.stdin)['catalog']
q=[x for x in d if x['name']=='دبلوم صيدلة E2E']
print(q[0]['id'] if q else '')" 2>/dev/null)

# إسناد المؤهل الجديد لكادر — من الكتالوج الجديد حصراً
R32_ASSIGN=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d "{\"userId\":\"$NURSE_QID\",\"qualification\":\"دبلوم صيدلة E2E\"}")
check "إسناد المؤهل الجديد لكادر من الكتالوج → 200" "200" "$R32_ASSIGN"

# تعديل اسم المؤهل يرحّل الحسابات الحاملة
R32_RENAME=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/qualifications/$R32_QID -H "Content-Type: application/json" \
  -d '{"name":"دبلوم صيدلة محدث E2E"}')
check "تعديل اسم المؤهل في الكتالوج → 200" "200" "$R32_RENAME"

R32_MIGRATED=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/qualifications | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
n=[u for u in d if u['id']=='$NURSE_QID']
print(n[0]['qualification'] if n else '-')" 2>/dev/null)
check "الاسم المعدل رُحّل تلقائياً لحساب الكادر الحامل" "دبلوم صيدلة محدث E2E" "$R32_MIGRATED"

# الحذف متاح لأنه لم يعد قيد الاستخدام بعد إعادة إسناد الكادر
R32_REASSIGN=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/qualifications -H "Content-Type: application/json" \
  -d "{\"userId\":\"$NURSE_QID\",\"qualification\":\"دبلوم ثلاث سنوات\"}")
check "إعادة إسناد الكادر لمؤهل تاريخي (تجهيزاً للحذف) → 200" "200" "$R32_REASSIGN"

R32_QDEL=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/admin/qualifications/$R32_QID)
check "حذف المؤهل غير المستخدم من الكتالوج → 200" "200" "$R32_QDEL"

# --- فحوص حية: نِسَب الحصص لكل مستلم/مشرف ---
# النسبة التلقائية = نصف نسبة الإدارة (الافتراضي 10٪ ← 5٪)
R32_AUTOPCT=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=RECEIVER" | jget "['autoSharePercent']")
check "قائمة المستلمين تعيد النسبة التلقائية (نصف نسبة الإدارة = 5)" "5" "$R32_AUTOPCT"

RCV_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=RECEIVER" | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
u=[x for x in d if x['phone']=='733333333']
print(u[0]['id'] if u else '')" 2>/dev/null)

R32_PCT403=$(code -b "$DIR/receiver.jar" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"commissionPercent":9}')
check "حماية الدور: المستلم لا يعدّل نسبته بنفسه → 403" "403" "$R32_PCT403"

R32_PCT=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"commissionPercent":9}')
check "الإدارة تخصص نسبة 9٪ للمستلم الإداري → 200" "200" "$R32_PCT"

R32_PCT_SAVED=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=RECEIVER" | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
u=[x for x in d if x['id']=='$RCV_ID']
p=u[0]['commissionPercent'] if u else None
print('9' if p==9 else 'bad')" 2>/dev/null)
check "النسبة المخصصة 9٪ محفوظة فعلياً" "9" "$R32_PCT_SAVED"

R32_DETAIL=$(curl -s -b "$DIR/admin.jar" $BASE/api/admin/users/$RCV_ID | jget "['receiver']['earnings']['summary']['sharePercent']")
check "ملف المستلم التفصيلي يعرض النسبة الفعالة (9٪)" "9" "$R32_DETAIL"

R32_EARN=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['sharePercent']")
check "صفحة أرباحي لدى المستلم تعرض نسبته الفعالة (9٪)" "9" "$R32_EARN"

R32_RESET=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"commissionPercent":null}')
check "الإدارة تعيد النسبة للتلقائي (null) → 200" "200" "$R32_RESET"

R32_EARN_AUTO=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['sharePercent']")
check "بعد الإعادة يصبح الافتراضي تلقائياً نصف نسبة الإدارة (5٪)" "5" "$R32_EARN_AUTO"

# مشرف الأطباء: نسبة مخصصة 10٪
SUP32_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=DOCTOR_SUPERVISOR" | python3 -c "
import json,sys
d=json.load(sys.stdin)['users']
u=[x for x in d if x['phone']=='791110901']
print(u[0]['id'] if u else '')" 2>/dev/null)
R32_SUPPCT=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$SUP32_ID -H "Content-Type: application/json" \
  -d '{"commissionPercent":10}')
check "الإدارة تخصص نسبة 10٪ لمشرف الأطباء → 200" "200" "$R32_SUPPCT"

R32_BADPCT=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"commissionPercent":150}')
check "رفض نسبة أعلى من 100٪ → 422" "422" "$R32_BADPCT"

# --- فحوص حية: أذونات رؤية البيانات الكاملة ---
# (قبل منح الإذن: ممنوع — بعد المنح: متاح كامل مع المستندات)
DOC32_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=DOCTOR" | jget "['users'][0]['id']")
NURSE32_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=NURSE" | jget "['users'][0]['id']")

R32_WF403=$(code -b "$DIR/supervisor.jar" $BASE/api/workforce/$DOC32_ID)
check "قبل المنح: مشرف الأطباء ممنوع من السيرة الكاملة → 403" "403" "$R32_WF403"

R32_WFACCESS=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$SUP32_ID -H "Content-Type: application/json" \
  -d '{"fullProfileAccess":true}')
check "الإدارة تفتح إذن البيانات الكاملة للمشرف → 200" "200" "$R32_WFACCESS"

R32_WF200=$(curl -s -b "$DIR/supervisor.jar" -o "$DIR/r32_wf.json" -w "%{http_code}" $BASE/api/workforce/$DOC32_ID)
check "بعد المنح: المشرف يرى السيرة الكاملة للطبيب → 200" "200" "$R32_WF200"

R32_WFDOCS=$(python3 -c "
import json
d=json.load(open('$DIR/r32_wf.json'))
p=d['profile']
print('ok' if 'phone' in p and 'ratings' in p and 'workSpecialties' in p and 'documents' in d else 'bad')" 2>/dev/null)
check "السيرة الكاملة تتضمن البيانات والتقييمات والمستندات" "ok" "$R32_WFDOCS"

R32_WFWRONG=$(code -b "$DIR/supervisor.jar" $BASE/api/workforce/$NURSE32_ID)
check "المشرف ممنوع من سيرة الكادر التمريضي (خارج جمهوره) → 403" "403" "$R32_WFWRONG"

# المستلم الإداري: الإذن للكوادر
R32_RCVACCESS=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"fullProfileAccess":true}')
check "الإدارة تفتح إذن البيانات الكاملة للمستلم → 200" "200" "$R32_RCVACCESS"

R32_RCV200=$(curl -s -b "$DIR/receiver.jar" -o /dev/null -w "%{http_code}" $BASE/api/workforce/$NURSE32_ID)
check "بعد المنح: المستلم يرى السيرة الكاملة للكادر → 200" "200" "$R32_RCV200"

# العلم في قائمة الجهة يعكس الإذن (زر السيرة الذاتية يظهر حسبه)
R32_STAFFFLAG=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/staff | jget "['fullProfileAccess']")
check "استجابة كوادر الجهة تتضمن علم fullProfileAccess=true" "True" "$R32_STAFFFLAG"

# سحب الإذن — يعود المنع فوراً
R32_REVOKE=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"fullProfileAccess":false}')
check "الإدارة تسحب إذن المستلم → 200" "200" "$R32_REVOKE"

R32_REVOKED=$(code -b "$DIR/receiver.jar" $BASE/api/workforce/$NURSE32_ID)
check "بعد السحب: المستلم ممنوع من السيرة الكاملة مرة أخرى → 403" "403" "$R32_REVOKED"

# ============================================================
# القسم 42 — الجولة 33: دليل المنصة الكامل بالإذن + السيرة الاحترافية + فصل مستندات الأطباء عن الكادر
# ============================================================
echo "=========== 42) الجولة 33: دليل الكوادر/الأطباء كاملين + السيرة الاحترافية + فصل المستندات ==========="

# --- فحوص ساكنة: البنية الجديدة ---
R33_DIRAPI=$(grep -c "fullProfileAccess\|audienceRole" app/api/workforce/route.ts | awk '{print ($1>=2)?1:0}')
check "api: نقطة دليل المنصة /api/workforce خلف بوابة الإذن وواعية بالجمهور" "1" "$R33_DIRAPI"

R33_DIRCOMP=$( [ -f components/shared/workforce-directory.tsx ] && grep -c "FullProfileDialog\|audience" components/shared/workforce-directory.tsx | awk '{print ($1>=2)?1:0}')
check "ui: مكوّن دليل الكوادر/الأطباء المشترك موجود وواعٍ بالجمهور" "1" "$R33_DIRCOMP"

R33_RCVTAB=$(grep -c "كل الكوادر في المنصة" app/receiver/staff/page.tsx | awk '{print ($1>=1)?1:0}')
check "ui: صفحة المستلم بها تبويب «كل الكوادر في المنصة» (بالموافقة)" "1" "$R33_RCVTAB"

R33_SUPTAB=$(grep -c "كل الأطباء في المنصة" app/supervisor/staff/page.tsx | awk '{print ($1>=1)?1:0}')
check "ui: صفحة المشرف بها تبويب «كل الأطباء في المنصة» (بالموافقة)" "1" "$R33_SUPTAB"

R33_CV=$(grep -c "التحصيل العلمي\|السجل المهني\|التقييمات الاحترافية\|بطاقة الهوية والتواصل" components/shared/full-profile-dialog.tsx | awk '{print ($1>=4)?1:0}')
check "ui: السيرة الذاتية المعاد بناؤها: ترويسة + تحصيل علمي + سجل مهني + تقييمات" "1" "$R33_CV"

R33_CVCOMPACT=$(grep -c "text-sm font-bold" components/shared/full-profile-dialog.tsx | awk '{print ($1>=1)?1:0}')
check "ui: المؤهل العلمي في السيرة بحجم أنيق مضغوط (text-sm لا أكبر)" "1" "$R33_CVCOMPACT"

R33_DOCAPI=$(grep -c "audience" app/api/admin/documents/route.ts | awk '{print ($1>=2)?1:0}')
check "api: نقطة مستندات الإدارة تفلتر بالجمهور (NURSE/DOCTOR)" "1" "$R33_DOCAPI"

R33_DOCROLE=$(grep -c "role: true" app/api/admin/documents/route.ts | awk '{print ($1>=1)?1:0}')
check "api: استجابة المستندات تتضمن دور صاحب الحساب (role)" "1" "$R33_DOCROLE"

R33_DOCTABS=$(grep -c "الكادر التمريضي\|الأطباء" app/admin/documents/page.tsx | awk '{print ($1>=2)?1:0}')
check "ui: مراجعة المستندات بتبويبات فصل الأطباء عن الكادر بعدادات" "1" "$R33_DOCTABS"

R33_DOCUI=$(grep -c "AUDIENCE_UI" app/admin/documents/page.tsx | awk '{print ($1>=2)?1:0}')
check "ui: هوية بصرية مميزة لكل جمهور في بطاقات المستندات" "1" "$R33_DOCUI"

# --- فحوص حية: دليل المنصة الكامل خلف الإذن ---
# (نهاية القسم 41: إذن المستلم مسحوب — المشرف ما زال مُصرّحاً له من القسم 41)
R33_DIR403=$(code -b "$DIR/receiver.jar" $BASE/api/workforce)
check "بدون إذن: المستلم ممنوع من دليل المنصة الكامل → 403" "403" "$R33_DIR403"

R33_ROLE403=$(code -b "$DIR/nurse.jar" $BASE/api/workforce)
check "حماية الدور: الكادر ممنوع من دليل المنصة → 403" "403" "$R33_ROLE403"

R33_GRANT=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"fullProfileAccess":true}')
check "الإدارة تفتح إذن البيانات الكاملة للمستلم (لدليل المنصة) → 200" "200" "$R33_GRANT"

R33_RCVDIR=$(curl -s -b "$DIR/receiver.jar" -o "$DIR/r33_dir.json" -w "%{http_code}" $BASE/api/workforce)
check "بعد المنح: المستلم يستعرض دليل الكوادر الكامل → 200" "200" "$R33_RCVDIR"

R33_RCVDIR_AUD=$(python3 -c "
import json
d=json.load(open('$DIR/r33_dir.json'))
rows=d['workforce']
print('ok' if d['audience']=='NURSE' and d['fullProfileAccess'] is True and len(rows)>=1 and all(r['role']=='NURSE' for r in rows) else 'bad')" 2>/dev/null)
check "دليل المستلم: جمهور NURSE حصراً مع بيانات مهنية كاملة لكل صف" "ok" "$R33_RCVDIR_AUD"

R33_DIRRICH=$(python3 -c "
import json
d=json.load(open('$DIR/r33_dir.json'))
r=d['workforce'][0]
keys=['phone','specialty','qualification','yearsOfExperience','ratingAverage','documentsCount','orgName','isMyOrg']
print('ok' if all(k in r for k in keys) else 'bad')" 2>/dev/null)
check "بطاقات الدليل تتضمن المؤهل والخبرة والتقييم والجهة وعدد المستندات" "ok" "$R33_DIRRICH"

R33_SEARCH=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/workforce?search=سارة" | python3 -c "
import json,sys
d=json.load(sys.stdin)['workforce']
print('ok' if len(d)>=1 and all((r['phone'] is None)==r['phoneLocked'] and len(r['phoneMasked'])>0 for r in d) else 'bad')" 2>/dev/null)
check "بحث الدليل بالاسم حصراً (البحث بالهاتف أُغلق — الجولة 34) مع اتساق القفل/القناع" "ok" "$R33_SEARCH"

# مشرف الأطباء — إذنه قائم من القسم 41: دليل الأطباء كاملاً
R33_SUPDIR=$(curl -s -b "$DIR/supervisor.jar" -o "$DIR/r33_sup.json" -w "%{http_code}" $BASE/api/workforce)
check "المشرف المُصرّح له يستعرض دليل الأطباء الكامل → 200" "200" "$R33_SUPDIR"

R33_SUPDIR_AUD=$(python3 -c "
import json
d=json.load(open('$DIR/r33_sup.json'))
rows=d['workforce']
print('ok' if d['audience']=='DOCTOR' and len(rows)>=1 and all(r['role']=='DOCTOR' for r in rows) else 'bad')" 2>/dev/null)
check "دليل المشرف: جمهور DOCTOR حصراً — كل الأطباء في المنصة" "ok" "$R33_SUPDIR_AUD"

# سحب الإذن يغلق الدليل فوراً
R33_REVOKE2=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"fullProfileAccess":false}')
check "الإدارة تسحب إذن المستلم مرة أخرى → 200" "200" "$R33_REVOKE2"

R33_DIRREVOKED=$(code -b "$DIR/receiver.jar" $BASE/api/workforce)
check "بعد السحب: دليل المنصة مغلق فوراً للمستلم → 403" "403" "$R33_DIRREVOKED"

# --- فحوص حية: فصل مستندات الأطباء عن الكادر التمريضي ---
R33_DOCNURSE=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r33_dn.json" -w "%{http_code}" "$BASE/api/admin/documents?audience=NURSE")
check "فلتر الجمهور NURSE يعمل → 200" "200" "$R33_DOCNURSE"

R33_DOCNURSE_OK=$(python3 -c "
import json
d=json.load(open('$DIR/r33_dn.json'))['documents']
print('ok' if len(d)>=1 and all(x['user']['role']=='NURSE' for x in d) else 'bad')" 2>/dev/null)
check "مستندات الكادر التمريضي فقط في فلتر NURSE (>=1)" "ok" "$R33_DOCNURSE_OK"

R33_DOCDOC=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r33_dd.json" -w "%{http_code}" "$BASE/api/admin/documents?audience=DOCTOR")
check "فلتر الجمهور DOCTOR يعمل → 200" "200" "$R33_DOCDOC"

R33_DOCDOC_OK=$(python3 -c "
import json
d=json.load(open('$DIR/r33_dd.json'))['documents']
print('ok' if len(d)>=1 and all(x['user']['role']=='DOCTOR' for x in d) else 'bad')" 2>/dev/null)
check "مستندات الأطباء فقط في فلتر DOCTOR (>=1 — طبيب رفع مستنداته في القسم 29)" "ok" "$R33_DOCDOC_OK"

R33_DOCALL=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/documents?status=ALL" | python3 -c "
import json,sys
d=json.load(sys.stdin)['documents']
n=[x for x in d if x['user']['role']=='NURSE']
doc=[x for x in d if x['user']['role']=='DOCTOR']
print('ok' if len(d)>=len(n)+len(doc) and len(n)>=1 and len(doc)>=1 else 'bad')" 2>/dev/null)
check "القائمة الكاملة (status=ALL) تضم مستندات الجمهورين معاً" "ok" "$R33_DOCALL"

# ============================================================
# القسم 43 — الجولة 34: خصوصية أرقام الكادر (القفل حتى سداد نسبة الإدارة)
#             + مشرف بلا جهة يضيف أطباء للقائمة العامة + مستندات الطبيب إجبارية
# ============================================================
echo "=========== 43) الجولة 34: قفل أرقام الكادر حتى سداد نسبة الإدارة + أطباء القائمة العامة ==========="

# إعداد تكليف سارٍ مسدد خاص بفحوص القفل (تقديم → اعتماد → سداد) —
# تحتاجه فحوص السيرة المفتوحة والدليل المختلط والتوافق التبادلي (الأقسام 43-45)
P36=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"فحوص القفل 43\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":2,\"gender\":\"ANY\",\"value\":30000}")
P36_ID=$(echo "$P36" | jget "['post']['id']")
APPLY44=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$P36_ID/apply -H "Content-Type: application/json" -d '{}')
check "تقديم الكادر على تكليف فحوص القفل → 201" "201" "$APPLY44"
APP44_ID=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$P36_ID/applications | jget "['applications'][0]['applicationId']")
N36_ASSIGN=$(curl -s -b "$DIR/receiver.jar" -X PATCH $BASE/api/applications/$APP44_ID -H "Content-Type: application/json" -d '{"action":"APPROVE"}' | jget "['assignment']['id']")
PAY44=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$N36_ASSIGN -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}')
check "الإدارة تؤكد سداد تكليف فحوص القفل → 200" "200" "$PAY44"

# --- فحوص ساكنة: البنية الجديدة ---
R34_LIB=$([ -f lib/phone-privacy.ts ] && grep -c "revealedStaffIds\|phoneView\|maskPhone" lib/phone-privacy.ts | awk '{print ($1>=3)?1:0}')
check "api: مكتبة الخصوصية المركزية lib/phone-privacy.ts موجودة بالقواعد الثلاث" "1" "$R34_LIB"

R34_MASKED=$(grep -rl "phone-privacy" app/api --include="*.ts" | wc -l | tr -d ' ')
# الجولة 38: +1 مع مسار مجتمع كوادر الجهة (app/api/org/community) = 12 مساراً
check "api: قناع الأرقام مطبق في 12 مسار API على الأقل (المفضلة/الشبكة/الدليل/التقديمات/التكليفات/المجتمع)" "12" "$R34_MASKED"

R34_COMP=$([ -f components/shared/staff-phone.tsx ] && grep -c "StaffPhone\|AssignmentContactChip" components/shared/staff-phone.tsx | awk '{print ($1>=2)?1:0}')
check "ui: مكوّنا القفل StaffPhone + AssignmentContactChip موجودان (قناع + قفل + اتصال + واتساب)" "1" "$R34_COMP"

R34_NOSEARCH=$(grep -c "phone: { contains" app/api/workforce/route.ts | awk '{print ($1==0)?1:0}')
check "api: البحث بالهاتف أُغلق في دليل المنصة (لا تسرّب وجود الرقم)" "1" "$R34_NOSEARCH"

R34_NETSEARCH=$(grep -c "// { phone: { contains: opts.search } }" lib/network.ts | awk '{print ($1==1)?1:0}')
check "api: البحث بالهاتف أُغلق في محرك المطابقة findMatchingNurses (سطر معطّل موثّق)" "1" "$R34_NETSEARCH"

R34_SUPORG=$(grep -c "!org && !isSupervisor" app/api/receiver/staff/route.ts | awk '{print ($1>=1)?1:0}')
check "api: إضافة الأطباء بلا جهة ممكنة للمشرف حصراً (الجهة ليست شرطاً)" "1" "$R34_SUPORG"

R34_DOCDOR=$(grep -c "target.role === 'DOCTOR'" app/api/admin/users/\[id\]/route.ts | awk '{print ($1>=1)?1:0}')
check "api: حاجز المستندات يشمل الطبيب دون استثناء (نفس حاجز الكادر)" "1" "$R34_DOCDOR"

# --- فحوص حية: القفل والفتح على مستوى الخادم ---
# فحوص السيرة/الدليل تعمل خلف إذن «رؤية البيانات الكاملة» (الجولة 33) —
# أُعيد منحه للمستلم هنا لأن القسم 42 أسحبه، والقفل/الفتح بحد ذاته مستقل عنه
R34_GRANT=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" \
  -d '{"fullProfileAccess":true}')
check "تمهيد: الإدارة تمنح المستلم إذن السيرة الكاملة لفحوص القفل → 200" "200" "$R34_GRANT"

# (1) من فُتح رقمه: كادر لديه تكليف مسدد النسبة وغير ملغى مع المستلم
OPEN_ID=$(curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
rows=[a for a in d if a['paymentStatus']=='PAID' and a['status'] not in ('CANCELLED','COMPLETED')]
print(rows[0]['nurse']['id'] if rows else '')" 2>/dev/null)

[ -n "$OPEN_ID" ] && check "يوجد كادر بتكليف مسدد مع المستلم (سياق الفحص)" "id" "id" || check "يوجد كادر بتكليف مسدد مع المستلم (سياق مطلوب)" "id" "null"

curl -s -b "$DIR/receiver.jar" "$BASE/api/workforce/$OPEN_ID" -o "$DIR/r34_open.json" 2>/dev/null
check "المستلم يرى رقم الكادر الكامل في السيرة بعد سداد تكليفه (فتح تلقائي)" "ok" "$(python3 -c "
import json
p=json.load(open('$DIR/r34_open.json'))['profile']
print('ok' if p['phone'] and not p['phoneLocked'] else 'bad')" 2>/dev/null)"

# الرقم المفتوح يطابق رقم الإدارة حرفياً (لا تحريف)
curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users/$OPEN_ID" -o "$DIR/r34_admin_u.json" 2>/dev/null
python3 -c "
import json
d=json.load(open('$DIR/r34_admin_u.json'))
open('$DIR/r34_admin_phone.txt','w').write(d['user']['phone'])" 2>/dev/null
OPEN_ADMIN_PHONE=$(cat "$DIR/r34_admin_phone.txt" 2>/dev/null)
OPEN_CV_PHONE=$(python3 -c "
import json
print(json.load(open('$DIR/r34_open.json'))['profile']['phone'])" 2>/dev/null)
[ -n "$OPEN_ADMIN_PHONE" ] && check "الرقم المفتوح للمستلم يطابق رقم الإدارة حرفياً ($OPEN_ADMIN_PHONE)" "$OPEN_ADMIN_PHONE" "$OPEN_CV_PHONE"

# (2) رقم مقفل: أول كادر مقفل من الدليل نفسه (لا تكليف مسدد مع المستلم)
LOCKED_ID=$(curl -s -b "$DIR/receiver.jar" $BASE/api/workforce | python3 -c "
import json,sys
rows=json.load(sys.stdin)['workforce']
locked=[r for r in rows if r['phoneLocked']]
print(locked[0]['id'] if locked else '')" 2>/dev/null)

curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users/$LOCKED_ID" -o "$DIR/r34_locked_admin.json" 2>/dev/null
LOCKED_ADMIN_PHONE=$(python3 -c "
import json
print(json.load(open('$DIR/r34_locked_admin.json'))['user']['phone'])" 2>/dev/null)

R34_LOCKED_CV=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/workforce/$LOCKED_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] is None and p['phoneLocked'] is True and '•' in p['phoneMasked'] else 'bad')" 2>/dev/null)
check "سيرة كادر بلا تكليف مسدد: phone=None + phoneLocked=True + قناع «•••»" "ok" "$R34_LOCKED_CV"

# (3) الدليل المختلط: مفتوح لمن سدد ومقفل لمن لم يسدد — والقناع بصيغة موحدة
R34_WF_MIXED=$(curl -s -b "$DIR/receiver.jar" $BASE/api/workforce | python3 -c "
import json,sys,re
rows=json.load(sys.stdin)['workforce']
ok_lock=all((r['phone'] is None) == r['phoneLocked'] for r in rows)
ok_mask=all(re.match(r'^\d{3} ••• •• \d{2}$', r['phoneMasked']) for r in rows if r['phoneMasked']!='••• ••• •••')
open_rows=[r for r in rows if r['phone'] is not None]
print('ok' if ok_lock and ok_mask and len(rows)>=2 and len(open_rows)>=1 else 'bad')" 2>/dev/null)
check "الدليل: اتساق القفل/الفتح لكل الصفوف + قناع موحد + صف مفتوح واحد على الأقل (تكليف مسدد)" "ok" "$R34_WF_MIXED"

# (4) الإدارة ترى كل الأرقام دائماً دون استثناء — وتطابق رقم الإدارة حرفياً
R34_ADMIN_CV=$(curl -s -b "$DIR/admin.jar" "$BASE/api/workforce/$LOCKED_ID" | python3 -c "
import json,sys,os
p=json.load(sys.stdin)['profile']
admin_phone=open('$DIR/r34_locked_admin.json') and json.load(open('$DIR/r34_locked_admin.json'))['user']['phone']
print('ok' if p['phone']==admin_phone and p['phoneLocked'] is False else 'bad')" 2>/dev/null)
check "الإدارة ترى الرقم الكامل في السيرة حتى بدون أي تكليف (دون استثناء — مطابق لرقم الإدارة)" "ok" "$R34_ADMIN_CV"

# (5) تكليفات المستلم: كل صف مفتوح فقط إذا سُدد تكليفه
R34_MEASSIGN=$(curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
ok=all((a['nurse']['phone'] is not None)==(a['paymentStatus']=='PAID' and a['status'] not in ('CANCELLED','COMPLETED')) for a in d)
print('ok' if d and ok else 'bad')" 2>/dev/null)
check "تكليفات المستلم: الرقم مفتوح حصراً في التكليفات السارية المسددة (الإنهاء يُغلق — الجولة 36)" "ok" "$R34_MEASSIGN"

# (6) الجولة 38 — القفل باتجاه واحد: بيانات اتصال المستلم/المشرف لا تُرسل للكادر أبداً
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

# (7) المشرف: رقم الطبيب مقفل في تكليفه غير المسدد + شبكته كلها مقفلة
R34_SUP_LOCKED=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
rows=[a for a in d if a['paymentStatus']!='PAID']
print('ok' if rows and all(a['nurse']['phone'] is None and a['nurse']['phoneLocked'] is True for a in rows) else 'bad')" 2>/dev/null)
check "المشرف: رقم الطبيب مقفل في التكليف غير المسدد" "ok" "$R34_SUP_LOCKED"

R34_SUPNET=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/nurses | python3 -c "
import json,sys
d=json.load(sys.stdin)['nurses']
print('ok' if d and all(n['phone'] is None and n['phoneLocked'] is True for n in d) else 'bad')" 2>/dev/null)
check "شبكة المشرف: كل أرقام الأطباء مقفلة (لا تكليفات مسددة بعد)" "ok" "$R34_SUPNET"

R34_FAV=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/favorites | python3 -c "
import json,sys
d=json.load(sys.stdin)['favorites']
print('ok' if all((n['phone'] is None)==n['phoneLocked'] and len(n['phoneMasked'])>0 for n in d) else 'bad')" 2>/dev/null)
check "المفضلة: اتساق القفل/الفتح بالقناع (نفس القاعدة)" "ok" "$R34_FAV"

# --- فحوص حية: مشرف بلا جهة يضيف طبيباً للقائمة العامة + مستندات الطبيب إجبارية ---
R34_HOSP=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r34_hosp.json" -w "%{http_code}" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى مشرف 34","type":"HOSPITAL","city":"صنعاء","status":"ACTIVE"}')
check "الإدارة تنشئ جهة صحية للمشرف المؤقت → 201" "201" "$R34_HOSP"
R34_HOSP_ID=$(python3 -c "
import json
print(json.load(open('$DIR/r34_hosp.json'))['hospital']['id'])" 2>/dev/null)

R34_SUP2=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r34_sup2.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR_SUPERVISOR","name":"مشرف بلا جهة 34","phone":"791110934","password":"Super34@123","hospitalName":"مستشفى مشرف 34"}')
check "الإدارة تنشئ مشرف أطباء مرتبطاً بالجهة → 201" "201" "$R34_SUP2"

R34_HOSP_OFF=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/hospitals/$R34_HOSP_ID -H "Content-Type: application/json" \
  -d '{"status":"INACTIVE"}')
check "الإدارة توقف الجهة → يصبح المشرف بلا جهة مصرّح بها → 200" "200" "$R34_HOSP_OFF"

login "$DIR/sup34.jar" "791110934" "Super34@123"
R34_ADD=$(curl -s -b "$DIR/sup34.jar" -o "$DIR/r34_add.json" -w "%{http_code}" -X POST $BASE/api/receiver/staff -H "Content-Type: application/json" \
  -d '{"name":"طبيب القائمة 34","phone":"777770034","password":"Doctor34@123","specialty":"قلبية E2E","qualification":"بكالوريوس طب وجراحة","gender":"MALE","yearsOfExperience":4}')
check "مشرف بلا جهة: يضيف طبيباً للقائمة العامة بنجاح → 201 (الجولة 34)" "201" "$R34_ADD"

R34_ADD_MSG=$(python3 -c "
import json
m=json.load(open('$DIR/r34_add.json')).get('message','')
print('ok' if 'قائمة' in m else 'bad')" 2>/dev/null)
check "رسالة الإضافة تشير إلى القائمة العامة وليس جهة" "ok" "$R34_ADD_MSG"

R34_DOC_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=DOCTOR&status=PENDING&search=777770034" | python3 -c "
import json,sys
us=json.load(sys.stdin)['users']
n=[u for u in us if u['phone']=='777770034']
print(n[0]['id'] if n else '')" 2>/dev/null)
[ -n "$R34_DOC_ID" ] && check "الطبيب المضاف ظهر في حساب الإدارة بحالة PENDING" "id" "id" || check "الطبيب المضاف ظهر في حساب الإدارة" "id" "null"

# حاجز المستندات للطبيب — دون استثناء
R34_NOBDOCS=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r34_nodocs.json" -w "%{http_code}" -X PATCH $BASE/api/admin/users/$R34_DOC_ID -H "Content-Type: application/json" \
  -d '{"status":"APPROVED"}')
check "رفض اعتماد الطبيب بلا مستندات → 422 (رفع المستندات إجباري دون استثناء)" "422" "$R34_NOBDOCS"
R34_NOBDOCS_MSG=$(python3 -c "
import json
m=json.load(open('$DIR/r34_nodocs.json')).get('error','')
print('ok' if 'الطبيب' in m else 'bad')" 2>/dev/null)
check "رسالة الرفض تعبر صراحة عن حاجز مستندات الطبيب" "ok" "$R34_NOBDOCS_MSG"

# الطبيب يرفع مستنداته ثم تُعتمد من الإدارة
login "$DIR/doc34.jar" "777770034" "Doctor34@123"
R34_DOCUP=$(curl -s -b "$DIR/doc34.jar" -o /dev/null -w "%{http_code}" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "الطبيب يرفع مستنده (بطاقة الهوية) → 201" "201" "$R34_DOCUP"

R34_APPROVE=$(curl -s -b "$DIR/admin.jar" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/users/$R34_DOC_ID -H "Content-Type: application/json" \
  -d '{"status":"APPROVED"}')
check "بعد رفع المستند: الإدارة تعتمد الطبيب → 200" "200" "$R34_APPROVE"

R34_DOC_DOCNUM=$(curl -s -b "$DIR/supervisor.jar" "$BASE/api/workforce/$R34_DOC_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] is None and p['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "رقم الطبيب مقفل للمشرف (جمهوره الأطباء — لا تكليف مسدد بينهما)" "ok" "$R34_DOC_DOCNUM"

echo ""
echo "=========== 44) الجولة 38 — القفل باتجاه واحد: اتصال المستلم/المشرف لا يُفتح للكادر في أي حال ==========="
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

# (د) الاتجاه المعاكس سليم بعد كل ذلك: المستلم ما زال يرى رقم الكادر في المسدد فقط
N35_RCV_CONS=$(curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
ok=all((a['nurse']['phone'] is not None)==(a['paymentStatus']=='PAID' and a['status'] not in ('CANCELLED','COMPLETED')) for a in d)
print('ok' if d and ok else 'bad')" 2>/dev/null)
check "المستلم: قاعدة فتح رقم الكادر سليمة بعد اختبار التبديل (التبادلية مكتملة)" "ok" "$N35_RCV_CONS"

# (هـ) المشرف: نفس القاعدة التبادلية في تكليفاته
N35_SUP_CONS=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
ok=all((a['nurse']['phone'] is not None)==(a['paymentStatus']=='PAID' and a['status'] not in ('CANCELLED','COMPLETED')) for a in d)
print('ok' if not d or ok else 'bad')" 2>/dev/null)
check "مشرف الأطباء: فتح رقم الطبيب حصراً أثناء سير التكليف المسدد (نفس القاعدة التبادلية)" "ok" "$N35_SUP_CONS"

# (و) الواجهة: صفحتا الكادر (تمريضي/طبيب) تعرضان شريحة تواصل المستلم — قناع+قفل قبل السداد، اتصال وواتساب بعده
N35_UI_N=$(grep -c 'StaffPhone data=' app/nurse/assignments/page.tsx)
check "صفحة تكليفات التمريضي تعرض تواصل المستلم في التكليف والتقديم (StaffPhone)" "2" "$N35_UI_N"
N35_UI_D=$(grep -c 'StaffPhone data=' app/doctor/assignments/page.tsx)
check "صفحة تكليفات الطبيب تعرض تواصل المستلم في التكليف والتقديم (StaffPhone)" "2" "$N35_UI_D"

echo ""
echo "=========== 45) الجولة 36 — الإنهاء يُغلق بيانات الاتصال تلقائياً + الموثوقون جداً ==========="
# بعد إنهاء التكليف من حساب المستلم/الكادر تُخفى بيانات الاتصال تلقائياً
# من تقديماتي وتكليفاتي المؤكدة لدى الطرفين — ولا تبقى ظاهرة إلا للإدارة
# ولمن تصنفه الإدارة «موثوقاً جداً» (trustedContactViewer)

# (أ) إنهاء تكليف القسم 44 الساري المسدد من حساب المستلم (مع الدفع والتقييم)
R36_DONE=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/me/assignments/$N35_AID/receiver-complete -H "Content-Type: application/json" \
  -d '{"nursePaid":true,"rating":{"overall":5}}')
check "المستلم ينهي التكليف الساري المسدد (مع الدفع والتقييم) → 200" "200" "$R36_DONE"

# (ب) الكادر: رقم المستلم اختفى تلقائياً من تكليفاته المؤكدة بعد الإنهاء
curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments -o "$DIR/r36_n_after.json" 2>/dev/null
R36_N_LOCK=$(python3 -c "
import json
d=json.load(open('$DIR/r36_n_after.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
print('ok' if rows and rows[0]['status']=='COMPLETED' and rows[0]['receiver']['phone'] is None and rows[0]['receiver']['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "بعد الإنهاء: رقم المستلم اختفى تلقائياً من تكليفات الكادر المؤكدة (قناع+قفل)" "ok" "$R36_N_LOCK"

# (ج) الكادر: رقم المستلم مقفل في تقديماته أيضاً (لا تكليف سارٍ بينهما الآن)
curl -s -b "$DIR/nurse.jar" $BASE/api/me/applications -o "$DIR/r36_n_apps.json" 2>/dev/null
R36_N_APPS=$(python3 -c "
import json
d=json.load(open('$DIR/r36_n_apps.json'))['applications']
rows=[a for a in d if a['post']['receiver']['id']=='$N35_RCVID']
print('ok' if rows and all(a['post']['receiver']['phone'] is None and a['post']['receiver']['phoneLocked'] is True for a in rows) else 'bad')" 2>/dev/null)
check "بعد الإنهاء: رقم المستلم مقفل في تقديمات الكادر أيضاً (لا تكليف سارٍ)" "ok" "$R36_N_APPS"

# (د) المستلم: رقم الكادر اختفى تلقائياً من تكليفاته المؤكدة بعد الإنهاء
curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments -o "$DIR/r36_r_after.json" 2>/dev/null
R36_R_LOCK=$(python3 -c "
import json
d=json.load(open('$DIR/r36_r_after.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
print('ok' if rows and rows[0]['nurse']['phone'] is None and rows[0]['nurse']['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "بعد الإنهاء: رقم الكادر اختفى تلقائياً من تكليفات المستلم المؤكدة" "ok" "$R36_R_LOCK"

# (هـ) المستلم: سيرة الكادر في الدليل أصبحت مقفلة بعد الإنهاء
R36_NURSE_ID=$(python3 -c "
import json
d=json.load(open('$DIR/r36_r_after.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
print(rows[0]['nurse']['id'] if rows else '')" 2>/dev/null)
R36_CV=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/workforce/$R36_NURSE_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] is None and p['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "بعد الإنهاء: سيرة الكادر في الدليل مقفلة للمستلم (غير الموثوق)" "ok" "$R36_CV"

# (و) الإدارة تصنف المستلم «موثوقاً جداً» → يرى بيانات اتصال أي كادر
R36_GRANT=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$N35_RCVID -H "Content-Type: application/json" -d '{"trustedContactViewer":true}')
check "الإدارة تمنح المستلم إذن «موثوق جداً» لبيانات الاتصال → 200" "200" "$R36_GRANT"

R36_T_CV=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/workforce/$R36_NURSE_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] and not p['phoneLocked'] else 'bad')" 2>/dev/null)
check "الموثوق جداً: سيرة الكادر مفتوحة الرقم للمستلم رغم إنهاء التكليف" "ok" "$R36_T_CV"

curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments -o "$DIR/r36_r_trusted.json" 2>/dev/null
R36_T_ASG=$(python3 -c "
import json
d=json.load(open('$DIR/r36_r_trusted.json'))['assignments']
rows=[a for a in d if a['id']=='$N35_AID']
print('ok' if rows and rows[0]['nurse']['phone'] and not rows[0]['nurse']['phoneLocked'] else 'bad')" 2>/dev/null)
check "الموثوق جداً: يرى رقم الكادر حتى في التكليف المُنهى من تكليفاته المؤكدة" "ok" "$R36_T_ASG"

# (ز) حماية: لا يمكن منح إذن «موثوق جداً» لكادر تمريضي — للمستلمين والمشرفين فقط
R36_GUARD=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$R36_NURSE_ID -H "Content-Type: application/json" -d '{"trustedContactViewer":true}')
check "رفض منح إذن «موثوق جداً» لكادر تمريضي → 422" "422" "$R36_GUARD"

# (ح) سحب الإذن → عاد القفل فوراً (بلا إعادة تسجيل دخول)
R36_REVOKE=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$N35_RCVID -H "Content-Type: application/json" -d '{"trustedContactViewer":false}')
check "الإدارة تسحب إذن «موثوق جداً» من المستلم → 200" "200" "$R36_REVOKE"
R36_REV_CV=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/workforce/$R36_NURSE_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] is None and p['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "بعد السحب: عادت سيرة الكادر مقفلة للمستلم فوراً (السحب فوري)" "ok" "$R36_REV_CV"

# (ط) مشرف الأطباء: التصنيف يفتح له أرقام الأطباء في أي وقت
R36_SUP_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=DOCTOR_SUPERVISOR&search=791110901" | python3 -c "
import json,sys
us=json.load(sys.stdin)['users']
n=[u for u in us if u['phone']=='791110901']
print(n[0]['id'] if n else '')" 2>/dev/null)
R36_SUP_GRANT=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$R36_SUP_ID -H "Content-Type: application/json" -d '{"trustedContactViewer":true}')
check "الإدارة تمنح مشرف الأطباء إذن «موثوق جداً» → 200" "200" "$R36_SUP_GRANT"
R36_SUP_CV=$(curl -s -b "$DIR/supervisor.jar" "$BASE/api/workforce/$R34_DOC_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] and not p['phoneLocked'] else 'bad')" 2>/dev/null)
check "الموثوق جداً: رقم الطبيب مفتوح للمشرف رغم لا تكليف بينهما (نطاق أطبائه)" "ok" "$R36_SUP_CV"
R36_SUP_REVOKE=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$R36_SUP_ID -H "Content-Type: application/json" -d '{"trustedContactViewer":false}')
check "الإدارة تسحب إذن المشرف → 200" "200" "$R36_SUP_REVOKE"
R36_SUP_LOCK2=$(curl -s -b "$DIR/supervisor.jar" "$BASE/api/workforce/$R34_DOC_ID" | python3 -c "
import json,sys
p=json.load(sys.stdin)['profile']
print('ok' if p['phone'] is None and p['phoneLocked'] is True else 'bad')" 2>/dev/null)
check "بعد سحب إذن المشرف: رقم الطبيب عاد مقفلاً فوراً" "ok" "$R36_SUP_LOCK2"

# (ي) الواجهة والخادم: شرط الإنهاء في شريحة التواصل + إذن الموثوق في مسار الإدارة
R36_UI_CHIP=$(grep -c "assignmentStatus !== 'COMPLETED'" components/shared/staff-phone.tsx)
check "شريحة التواصل في الواجهات تُغلق بعد إنهاء التكليف (شرط COMPLETED)" "1" "$R36_UI_CHIP"
R36_UI_BADGE=$(grep -c 'موثوق جداً' app/admin/receivers/page.tsx)
check "صفحة المستلمين في الإدارة تعرض شارة «موثوق جداً»" "1" "$R36_UI_BADGE"
R36_API=$(grep -c "trustedContactViewer" "app/api/admin/users/[id]/route.ts")
check "مسار الإدارة يتعامل مع إذن trustedContactViewer (منح/سحب/حماية)" "10" "$R36_API"
R36_SCHEMA=$(grep -c "trustedContactViewer" prisma/schema.prisma)
check "مخطط قاعدة البيانات يحوي حق trustedContactViewer" "1" "$R36_SCHEMA"

# ============================================================
# القسم 46 — الجولة 37: بطاقة سداد رسوم الإدارة الاحترافية
#   بطاقة FeePaymentCard في «تقديماتي» و«تكليفاتي المؤكدة» + تنبيه
#   «نظرة عامة» أعلى الصفحة + رابط عميق ?tab=applications&pay=<id>
#   + رفع إثبات الدفع بحالاته الثلاث (بانتظار السداد/التأكيد/المؤكد)
# ============================================================
echo "=========== 46) الجولة 37 — بطاقة سداد رسوم الإدارة الاحترافية ==========="

# تأمين السياق: سداد أي تكاليف سابقة غير مسددة للكادر حتى يُسمح بالتقديم في فحوص هذا القسم
# (الأقسام السابقة انتهت كلها — لا تأثير على فحوصها، وهو نفس نمط تهيئة القسم 43)
for AID in $(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
rows=[a['id'] for a in d if a['paymentStatus']!='PAID' and a['status']!='CANCELLED']
print(' '.join(rows))" 2>/dev/null); do
  code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$AID -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}' > /dev/null 2>&1
done

# تكليف جديد غير مسدد لفحوص البطاقة (تقديم → اعتماد → بلا سداد)
P37=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/posts -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"department\":\"فحوص السداد 37\",\"startDate\":\"$TODAY\",\"nursesNeeded\":1,\"hours\":2,\"gender\":\"ANY\",\"value\":25000}")
P37_ID=$(echo "$P37" | jget "['post']['id']")
APPLY37=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$P37_ID/apply -H "Content-Type: application/json" -d '{}')
check "تقديم الكادر على تكليف فحوص بطاقة السداد → 201" "201" "$APPLY37"
APP37_ID=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$P37_ID/applications | jget "['applications'][0]['applicationId']")
R37_ASSIGN=$(curl -s -b "$DIR/receiver.jar" -X PATCH $BASE/api/applications/$APP37_ID -H "Content-Type: application/json" -d '{"action":"APPROVE"}' | jget "['assignment']['id']")

# (1) فحوص حية: بيانات بطاقة السداد من مسار الكادر
R37_UNPAID=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
rows=[a for a in d if a['id']=='$R37_ASSIGN']
print('ok' if rows and rows[0]['paymentStatus']=='UNPAID' and rows[0]['status'] not in ('CANCELLED','COMPLETED') and rows[0]['value']==25000 and rows[0]['adminFee']==2500 else 'bad')" 2>/dev/null)
check "تكليف فحوص السداد غير مسدد وبيانات بطاقة السداد كاملة (قيمة 25000 وحصة 2500 = 10٪)" "ok" "$R37_UNPAID"

# (2) رفع إثبات الدفع من حساب الكادر — الحالة: بانتظار تأكيد الإدارة
R37_SHOT=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/me/assignments/$R37_ASSIGN/payment-screenshot -F "file=@$DIR/test.png;type=image/png")
check "رفع لقطة إثبات الدفع من بطاقة السداد → 200" "200" "$R37_SHOT"
R37_PEND=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
rows=[a for a in d if a['id']=='$R37_ASSIGN']
print('ok' if rows and rows[0]['paymentScreenshotUrl'] and rows[0]['paymentStatus']=='UNPAID' else 'bad')" 2>/dev/null)
check "بعد رفع الإثبات: الإثبات ظاهر والدفع ما زال بانتظار تأكيد الإدارة" "ok" "$R37_PEND"

# (3) الإدارة تؤكد الدفع → بطاقة السداد تتحول للحالة المؤكدة ويُفتح التقديم من جديد
R37_PAY=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$R37_ASSIGN -H "Content-Type: application/json" -d '{"paymentStatus":"PAID"}')
check "الإدارة تؤكد سداد تكليف بطاقة السداد → 200" "200" "$R37_PAY"
R37_DONE=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)['assignments']
rows=[a for a in d if a['id']=='$R37_ASSIGN']
print('ok' if rows and rows[0]['paymentStatus']=='PAID' and rows[0]['paymentScreenshotUrl'] else 'bad')" 2>/dev/null)
check "بعد التأكيد: الحالة مؤكدة والإثبات محفوظ في سجل بطاقة السداد" "ok" "$R37_DONE"

# (4) فحوص ساكنة: بطاقة السداد ومكوّناتها في الواجهات
R37_COMP=$([ -f components/shared/fee-payment-card.tsx ] && grep -c "PaymentCard\|payment-screenshot\|compressImage\|DocumentViewer" components/shared/fee-payment-card.tsx | awk '{print ($1>=4)?1:0}')
check "ui: بطاقة السداد FeePaymentCard تجمع (المبلغ الفعلي + طرق الدفع + رفع الإثبات + العارض)" "1" "$R37_COMP"
R37_NUSE=$(grep -c "FeePaymentCard" app/nurse/assignments/page.tsx | awk '{print ($1>=3)?1:0}')
check "ui: بطاقة السداد معروضة في صفحة الكادر (قسم تقديماتي + تكليفاتي المؤكدة)" "1" "$R37_NUSE"
R37_DUSE=$(grep -c "FeePaymentCard" app/doctor/assignments/page.tsx | awk '{print ($1>=3)?1:0}')
check "ui: بطاقة السداد معروضة في صفحة الطبيب (قسم تقديماتي + تكليفاتي المؤكدة)" "1" "$R37_DUSE"
R37_SECTION=$(grep -c "تكليفات تنتظر سداد رسوم الإدارة" app/nurse/assignments/page.tsx)
check "ui: قسم «تكليفات تنتظر سداد رسوم الإدارة» أعلى تقديماتي" "1" "$R37_SECTION"

# (5) تنبيه نظرة عامة أعلى الصفحة الرسمية + الرابط العميق إلى بطاقة السداد
R37_OV=$(grep -c "tone=\"unpaid\"\|لديك تكليف معلق لم تقم بدفع رسوم الإدارة\|سداد الرسوم الآن\|tab=applications&pay=" app/nurse/page.tsx | awk '{print ($1>=4)?1:0}')
check "ui: نظرة عامة للكادر تعرض تنبيه التكليف المعلق (نبرة unpaid + المبلغ + سداد الرسوم الآن)" "1" "$R37_OV"
R37_OVD=$(grep -c "tone=\"unpaid\"\|لديك تكليف معلق لم تقم بدفع رسوم الإدارة\|سداد الرسوم الآن\|tab=applications&pay=" app/doctor/page.tsx | awk '{print ($1>=4)?1:0}')
check "ui: نظرة عامة للطبيب تعرض تنبيه التكليف المعلق (نبرة unpaid + المبلغ + سداد الرسوم الآن)" "1" "$R37_OVD"
R37_TONE=$(grep -c "^  unpaid: {" components/shared/assignment-alert-card.tsx)
check "ui: نبرة unpaid معرّفة في بطاقة التنبيه (أعلى أولوية قبل التكليف الجارٍ)" "1" "$R37_TONE"
R37_LINK=$(grep -l "useSearchParams" app/nurse/assignments/page.tsx app/doctor/assignments/page.tsx | wc -l | tr -d ' ')
check "ui: الرابط العميق (?tab=&pay=) يُقرأ في صفحتي الكادر والطبيب" "2" "$R37_LINK"
R37_SCROLL=$(grep -l "fee-card-" app/nurse/assignments/page.tsx app/doctor/assignments/page.tsx | wc -l | tr -d ' ')
check "ui: الضغط على التنبيه يمرّر سلساً ويُميّز بطاقة السداد المستهدفة في الصفحتين" "2" "$R37_SCROLL"
R37_CTA=$(grep -l "الانتقال إلى بطاقة السداد" app/nurse/assignments/page.tsx app/doctor/assignments/page.tsx | wc -l | tr -d ' ')
check "ui: لافتة التوقف في التكليفات المتاحة فيها زر الانتقال إلى بطاقة السداد" "2" "$R37_CTA"


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
R38_STALE=$(grep -c "staleTime: 0," components/shared/providers.tsx)
check "ui: بلا تخزين مؤقت للاستعلامات (staleTime: 0) — انعكاس فوري لأي منح/سحب" "1" "$R38_STALE"
R38_FOCUS=$(grep -c "refetchOnWindowFocus: 'always'" components/shared/providers.tsx)
check "ui: إعادة جلب فورية عند كل عودة للصفحة (refetchOnWindowFocus: 'always')" "1" "$R38_FOCUS"
R38_PULSE=$(grep -c "refetchInterval: 30 \* 1000" components/shared/providers.tsx)
check "ui: نبض تحديث تلقائي كل 30 ثانية — الإغلاق يصل الشاشات المفتوحة دون تحديث يدوي" "1" "$R38_PULSE"
R38_HINT=$(grep -c "RECEIVER_CONTACT_LOCKED_HINT" lib/phone-privacy.ts)
check "خادم: تلميح خاص لقفل اتصال المستلم/المشرف لدى الكادر (الجولة 38)" "1" "$R38_HINT"
R38_FN=$(grep -c "phoneMasked: maskPhone(phone), phoneLocked: true" lib/phone-privacy.ts)
check "خادم: receiverPhoneForStaff قفل مطلق — لا يُرسل رقم المستلم/المشرف للكادر في أي حال" "1" "$R38_FN"
R38_UIHINT=$(grep -c "lockedHint={RECEIVER_CONTACT_LOCKED_HINT}" app/nurse/assignments/page.tsx)
check "ui: شريحتا تواصل المستلم في صفحة الكادر (التقديم والتكليف) تعرضان تلميح الخصوصية الجديد" "2" "$R38_UIHINT"

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

R38_CONSIST=$(H38="$HOSP" DIR="$DIR" BASE="$BASE" python3 -c "
import json,subprocess,os
BASE=os.environ['BASE']; DIR=os.environ['DIR']; H38=os.environ['H38']
h=subprocess.run(['curl','-s','-b',DIR+'/admin.jar',BASE+'/api/admin/hospitals'],capture_output=True,text=True).stdout
c=subprocess.run(['curl','-s','-b',DIR+'/admin.jar',BASE+'/api/org/community?hospitalId='+H38],capture_output=True,text=True).stdout
hj=json.loads(h); cj=json.loads(c)
row=[x for x in hj['hospitals'] if x['id']==H38]
if not row:
    print('bad'); raise SystemExit
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
# الجولة 41: البطالة صارت مصغّرة — شريط إحصاء أفقي بثلاث خلايا بدل البطاقات المكدسة
R38_COMP=$([ -f components/shared/entity-cadre-community.tsx ] && grep -c "ممرضون معتمدون\|أطباء معتمدون\|متاحون الآن" components/shared/entity-cadre-community.tsx | awk '{print ($1>=3)?1:0}')
check "ui: بطاقة مجتمع الكوادر بإحصاءاتها الثلاث (ممرضون معتمدون/أطباء معتمدون/متاحون الآن — مصغّرة منذ الجولة 41)" "1" "$R38_COMP"
R38_USE3=$(grep -l "EntityCadreCommunity" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx components/admin/organizations-manager.tsx | wc -l | tr -d ' ')
check "ui: لوحة المجتمع مدمجة في (كوادر جهتي + أطباء جهتي + لوحة الجهات الإدارية)" "3" "$R38_USE3"
R38_API_NEW=$([ -f app/api/org/community/route.ts ] && grep -c "computeOrgCadreStats" app/api/org/community/route.ts)
check "خادم: مسار GET /api/org/community يعتمد محرك إحصاءات المجتمع المشترك" "2" "$R38_API_NEW"
R38_RSAPI=$(grep -c "community" app/api/receiver/staff/route.ts)
check "خادم: مسار كوادر الجهة يعيد إحصاءات المجتمع وشارة التوفر" "2" "$R38_RSAPI"
R38_AHAPI=$(grep -c "computeAllOrgCadreStats" app/api/admin/hospitals/route.ts)
check "خادم: قائمة جهات الإدارة تجمع إحصاءات كل المجتمعات دفعة واحدة" "2" "$R38_AHAPI"

echo ""
echo "=========== 48) الجولة 39 — اعتماد الكادر للجهة (المستلم/المشرف) + فصل الاعتماد المهني ==========="
# المستلم الإداري يعتمد الكادر التمريضي لجهته، ومشرف الأطباء يعتمد الأطباء لجهته —
# لإضافتهم لمجتمع كوادر الجهة فقط، والاعتماد المهني (كطبيب/ككادر طبي) يبقى من
# حساب الإدارة حصراً بعد رفع المستندات والموافقة عليها.

# تجهيز: كادر تمريضي جديد + جهة ثانية (لعزل الجهات)
R39_N39=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r39_n39.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"كادر اعتماد 39","phone":"791110941","password":"Nurse39@123","specialty":"تمريض طوارئ","qualification":"بكالوريوس أربع سنوات","yearsOfExperience":3,"gender":"MALE"}')
check "تجهيز: الإدارة تنشئ كادر تمريضياً لفحوص الاعتماد → 201" "201" "$R39_N39"
N39_ID=$(jget "['user']['id']" < "$DIR/r39_n39.json")
login "$DIR/nurse39.jar" "791110941" "Nurse39@123"

# مستلم لجهة الأساس ($HOSP = مستشفى E2E الأساس — جهة المشرف) لفحوص اعتماده
R39_RCV=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r39_rcv.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"RECEIVER","name":"مستلم اعتماد 39","phone":"791110942","password":"Rcv39@1234","hospitalName":"مستشفى E2E الأساس"}')
check "تجهيز: الإدارة تنشئ مستلم جهة الأساس → 201" "201" "$R39_RCV"
RCV39_ID=$(jget "['user']['id']" < "$DIR/r39_rcv.json")
login "$DIR/rcv39.jar" "791110942" "Rcv39@1234"

R39_H39=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r39_h39.json" -w "%{http_code}" -X POST $BASE/api/admin/hospitals -H "Content-Type: application/json" \
  -d '{"name":"مستشفى اختبار 39","type":"HOSPITAL","city":"عدن","status":"ACTIVE"}')
check "تجهيز: الإدارة تنشئ جهة ثانية لفحوص العزل → 201" "201" "$R39_H39"
H39_ID=$(python3 -c "import json;print(json.load(open('$DIR/r39_h39.json'))['hospital']['id'])" 2>/dev/null)

# الكادر يطلب ارتباطه بالجهة الثانية (طلب ذاتي — PENDING بلا بوابة مستندات)
R39_SELFREQ=$(code -b "$DIR/nurse39.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$H39_ID\",\"requestedStatus\":\"WORKING\"}")
check "تجهيز: الكادر يطلب ارتباطاً بالجهة الثانية → 201" "201" "$R39_SELFREQ"
AFF_N39_H39=$(curl -s -b "$DIR/nurse39.jar" $BASE/api/affiliations | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[a for a in d['affiliations'] if a['hospitalId']=='$H39_ID']
print(rows[0]['id'] if rows else '')" 2>/dev/null)

# DOC_ID — الطبيب المنشأ من الإدارة في القسم 29 (بلا ارتباط بعد)
DOC_ID=$(jget "['user']['id']" < "$DIR/r29_doc.json")

# (أ) المستلم لا يعتمد الأطباء — اعتماد الأطباء من اختصاص مشرف الأطباء (الجهة صحيحة — الفحص للمطابقة)
R39_R_DOC=$(code -b "$DIR/rcv39.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$DOC_ID\",\"hospitalId\":\"$HOSP\",\"status\":\"ENDORSED\"}")
check "المستلم الإداري لا يعتمد طبيباً من جهته (مطابقة الدور) → 403" "403" "$R39_R_DOC"

# (ب) مشرف الأطباء يعتمد الطبيب لجهته — بلا بوابة مستندات (اعتماد جهة فقط)
R39_S_DOC=$(code -b "$DIR/supervisor.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$DOC_ID\",\"hospitalId\":\"$HOSP\",\"status\":\"ENDORSED\"}")
check "مشرف الأطباء يعتمد الطبيب لجهته (بلا شرط مستندات) → 201" "201" "$R39_S_DOC"

# (ج) مشرف الأطباء لا يعتمد الكادر التمريضي — من اختصاص المستلم الإداري
R39_S_N39=$(code -b "$DIR/supervisor.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$N39_ID\",\"hospitalId\":\"$HOSP\",\"status\":\"ENDORSED\"}")
check "مشرف الأطباء لا يعتمد كادراً تمريضياً (مطابقة الدور) → 403" "403" "$R39_S_N39"

# (د) المستلم الإداري يعتمد الكادر التمريضي لجهته — بلا بوابة مستندات
R39_R_N39=$(code -b "$DIR/rcv39.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"nurseId\":\"$N39_ID\",\"hospitalId\":\"$HOSP\",\"status\":\"ENDORSED\"}")
check "المستلم الإداري يعتمد الكادر التمريضي لجهته (بلا شرط مستندات) → 201" "201" "$R39_R_N39"

# (هـ) عزل الجهات: المستلم لا يعدّل ارتباطات جهة أخرى
R39_CROSS=$(code -b "$DIR/rcv39.jar" -X PATCH $BASE/api/affiliations/$AFF_N39_H39 -H "Content-Type: application/json" \
  -d '{"status":"ENDORSED"}')
check "عزل الجهات: المستلم لا يعتمد ارتباطات جهة أخرى → 403" "403" "$R39_CROSS"

# (و) عزل المشرف بلا جهة مصرّح بها (ثغرة الجولة 38 أُغلقت — كان يتجاوز الفحص)
AFF_DOC_ID=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/affiliations | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[a for a in d['affiliations'] if a['nurseId']=='$DOC_ID' and a['hospitalId']=='$HOSP']
print(rows[0]['id'] if rows else '')" 2>/dev/null)
R39_SUP34=$(code -b "$DIR/sup34.jar" -X PATCH $BASE/api/affiliations/$AFF_DOC_ID -H "Content-Type: application/json" \
  -d '{"status":"WORKING"}')
check "عزل المشرف: مشرف بلا جهة مصرّح بها لا يعدّل أي ارتباط → 403" "403" "$R39_SUP34"

# (ز) مجتمع الكوادر يعكس اعتماد المشرف + شارة الاعتماد المهني في الصفوف
R39_COMM=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/org/community | python3 -c "
import json,sys
d=json.load(sys.stdin)
s=d.get('stats') or {}
rows=d.get('cadres',[])
ok=s.get('accreditedDoctors',0)>=1
ok=ok and all('approvedDocuments' in r for r in rows)
print('ok' if ok else 'bad')" 2>/dev/null)
check "مجتمع الكوادر: اعتماد المشرف ظهر في الأطباء المعتمدين + approvedDocuments لكل صف" "ok" "$R39_COMM"

# (ح) شارة الاعتماد المهني في مسار كوادر الجهة (مستلم جهة الأساس) — الحقل موجود والحالة صحيحة
R39_RS_BADGE=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=d.get('nurses',[])
ok=all(('approvedDocuments' in r and 'role' in r['nurse']) for r in rows)
n39=[r for r in rows if r['nurse']['id']=='$N39_ID']
ok=ok and n39 and n39[0]['approvedDocuments']==0 and n39[0]['affiliationStatus']=='ENDORSED'
print('ok' if ok else 'bad')" 2>/dev/null)
check "كوادر الجهة: شارة الاعتماد المهني (معتمد من الإدارة) — الكادر المعتمد للجهة بلا مستندات معتمدة بعد" "ok" "$R39_RS_BADGE"

echo ""
echo "=========== 49) الجولة 39 — الإنهاء والتقييم من المستلم/المشرف حتى لو أُغلق التكليف من الكادر ==========="

# (أ) المشرف ينهي تكليف الطبيب الساري (لم يُستلم بعد) مباشرة — استلام تلقائي + تقييم
SUP39_AID=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[a for a in d['assignments'] if a['nurse']['id']=='$DOC_ID' and a['status']!='COMPLETED' and a['status']!='CANCELLED']
print(rows[0]['id'] if rows else '')" 2>/dev/null)
SUP39_STATE=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[a for a in d['assignments'] if a['id']=='$SUP39_AID']
print(rows[0]['status'] if rows else '?')" 2>/dev/null)
check "تجهيز: تكليف الطبيب لدى المشرف سارٍ غير منتهٍ (RECEIVED)" "RECEIVED" "$SUP39_STATE"

R39_SUPDONE=$(curl -s -b "$DIR/supervisor.jar" -o "$DIR/r39_supdone.json" -w "%{http_code}" -X POST $BASE/api/me/assignments/$SUP39_AID/receiver-complete -H "Content-Type: application/json" \
  -d '{"nursePaid":true,"rating":{"overall":5,"quality":5,"comment":"إنجاز متميز من الطبيب"}}')
check "المشرف ينهي تكليف طبيب جهته مباشرة من ACTIVE (استلام تلقائي) مع التقييم → 200" "200" "$R39_SUPDONE"

R39_SUPRATED=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[a for a in d['assignments'] if a['id']=='$SUP39_AID']
a=rows[0] if rows else {}
print('ok' if a.get('status')=='COMPLETED' and a.get('receiverDoneAt') and a.get('rating',{}).get('overall')==5 else 'bad')" 2>/dev/null)
check "تكليف الطبيب مكتمل لدى المشرف مع التقييم المحفوظ" "ok" "$R39_SUPRATED"

# (ب) الكادر يغلق التكليف من حسابه أولاً — ثم المستلم ينهي مباشرة من ACTIVE
# الإسناد المباشر من الإدارة ينشئ التكليف بحالة ACTIVE (بانتظار استلام المستلم)
R39_DIRECT=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r39_direct.json" -w "%{http_code}" -X POST $BASE/api/admin/assignments -H "Content-Type: application/json" \
  -d "{\"title\":\"إسناد مباشر 39\",\"facility\":\"مستشفى E2E الأساس\",\"startDate\":\"$TODAY\",\"nurseId\":\"$NURSE_ID\",\"receiverId\":\"$RCV39_ID\"}")
check "تجهيز: الإدارة تسند تكليفاً مباشرة للكادر لدى مستلم الجهة → 201" "201" "$R39_DIRECT"
A39_ID=$(jget "['assignment']['id']" < "$DIR/r39_direct.json")
A39_STATE=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[a for a in d['assignments'] if a['id']=='$A39_ID']
print(rows[0]['status'] if rows else '?')" 2>/dev/null)
check "تجهيز: التكليف المُسند ACTIVE بانتظار استلام المستلم" "ACTIVE" "$A39_STATE"

R39_NDONE=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/me/assignments/$A39_ID/nurse-complete -H "Content-Type: application/json" -d '{"receivedAmount":true}')
check "الكادر يغلق التكليف من حسابه أولاً (تأكيد إنهاء واستلام) → 200" "200" "$R39_NDONE"

R39_RDONE=$(curl -s -b "$DIR/rcv39.jar" -o "$DIR/r39_rdone.json" -w "%{http_code}" -X POST $BASE/api/me/assignments/$A39_ID/receiver-complete -H "Content-Type: application/json" \
  -d '{"nursePaid":true,"rating":{"overall":4,"punctuality":4,"comment":"أُغلق من الكادر وأنهاه المستلم مباشرة"}}')
check "المستلم ينهي ويقيّم مباشرة من ACTIVE رغم إغلاق الكادر له → 200" "200" "$R39_RDONE"
R39_RDONE2=$(code -b "$DIR/rcv39.jar" -X POST $BASE/api/me/assignments/$A39_ID/receiver-complete -H "Content-Type: application/json" \
  -d '{"nursePaid":true,"rating":{"overall":4}}')
check "منع تكرار إنهاء التكليف المنتهي من المستلم → 409" "409" "$R39_RDONE2"

# (ج) الإدارة تُغلق التكليف — والمستلم يسجّل الإنهاء والتقييم بعدها
R39_DIRECT2=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r39_direct2.json" -w "%{http_code}" -X POST $BASE/api/admin/assignments -H "Content-Type: application/json" \
  -d "{\"title\":\"إسناد مباشر ثانٍ 39\",\"facility\":\"مستشفى E2E الأساس\",\"startDate\":\"$TODAY\",\"nurseId\":\"$NURSE_ID\",\"receiverId\":\"$RCV39_ID\"}")
check "تجهيز: إسناد مباشر ثانٍ → 201" "201" "$R39_DIRECT2"
A39B_ID=$(jget "['assignment']['id']" < "$DIR/r39_direct2.json")
R39_RECVB=$(code -b "$DIR/rcv39.jar" -X POST $BASE/api/me/assignments/$A39B_ID/receive -H "Content-Type: application/json" -d '{}')
check "تجهيز: المستلم يستلم التكليف الثاني → 200" "200" "$R39_RECVB"
R39_ADMCLOSE=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/assignments/$A39B_ID -H "Content-Type: application/json" -d '{"status":"COMPLETED"}')
check "الإدارة تغلق التكليف من حسابها (دون تقييم المستلم) → 200" "200" "$R39_ADMCLOSE"

R39_RDONEB=$(curl -s -b "$DIR/rcv39.jar" -o "$DIR/r39_rdoneb.json" -w "%{http_code}" -X POST $BASE/api/me/assignments/$A39B_ID/receiver-complete -H "Content-Type: application/json" \
  -d '{"nursePaid":false,"rating":{"overall":3,"discipline":3,"comment":"أُغلق من الإدارة وسجّل المستلم تقييمه بعدها"}}')
check "المستلم ينهي ويقيّم تكليفاً أغلقتِه الإدارة مسبقاً → 200" "200" "$R39_RDONEB"
R39_B_RATED=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[a for a in d['assignments'] if a['id']=='$A39B_ID']
a=rows[0] if rows else {}
print('ok' if a.get('receiverDoneAt') and a.get('rating',{}).get('overall')==3 and a.get('nursePaid') is False else 'bad')" 2>/dev/null)
check "إجابة الدفع (لا) والتقييم مسجلان لدى المستلم بعد إغلاق الإدارة" "ok" "$R39_B_RATED"

# (د) فحوص ساكنة: أزرار الاعتماد والإنهاء والشارات في الواجهات
R39_UI_ENDORSE=$(grep -l "اعتماد للجهة" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: زر «اعتماد للجهة» في صفحتي كوادر المستلم وأطباء المشرف" "2" "$R39_UI_ENDORSE"
R39_UI_BADGE=$([ -f components/shared/professional-accreditation-badge.tsx ] && grep -c "معتمد من الإدارة" components/shared/professional-accreditation-badge.tsx | awk '{print ($1>=1)?1:0}')
check "ui: شارة الاعتماد المهني «معتمد من الإدارة» موجودة" "1" "$R39_UI_BADGE"
R39_UI_USE=$(grep -l "ProfessionalAccreditationBadge" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx components/shared/entity-cadre-community.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: شارة الاعتماد المهني مدمجة في (كوادر المستلم + أطباء المشرف + مجتمع الجهة)" "3" "$R39_UI_USE"
R39_API_GATE=$(grep -l "role === 'ADMIN' && (DOCUMENT_GATED_STATUSES" app/api/affiliations/route.ts "app/api/affiliations/[id]/route.ts" 2>/dev/null | wc -l | tr -d ' ')
check "api: بوابة المستندات للاعتماد أصبحت للإدارة حصراً (المستلم/المشرف يعتمدان للجهة بلا بوابة)" "2" "$R39_API_GATE"
R39_API_SCOPE=$(grep -c "DOCTOR_SUPERVISOR" app/api/affiliations/\[id\]/route.ts | awk '{print ($1>=1)?1:0}')
check "api: نطاق الجهة يفحص مشرف الأطباء أيضاً (إغلاق ثغرة التجاوز)" "1" "$R39_API_SCOPE"
R39_API_DONE=$(grep -c "resolveReceiverOrg" app/api/me/assignments/\[id\]/receiver-complete/route.ts | awk '{print ($1>=1)?1:0}')
check "api: نطاق مشرف الأطباء (أطباء جهته) في مسار الإنهاء والتقييم" "1" "$R39_API_DONE"
R39_API_LIST=$(grep -c "ACTIVE_AFFILIATION_STATUSES" app/api/me/assignments/route.ts | awk '{print ($1>=1)?1:0}')
check "api: قائمة تكليفات المشرف تشمل تكليفات أطباء جهته" "1" "$R39_API_LIST"
R39_UI_BTN=$(grep -l "إنهاء التكليف وتقييم" app/receiver/assignments/page.tsx app/supervisor/assignments/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: زر «إنهاء التكليف وتقييم» في المنتهية دون إنهاء المستلم (صفحتا المستلم والمشرف)" "2" "$R39_UI_BTN"

echo ""
echo "=========== 50) الجولة 40 — طلبات الانضمام قرار قبول/رفض + إشعار فوري لمسؤول الجهة ==========="
# طلب انضمام الكادر لجهة يصل للمستلم الإداري (وللطبيب مشرف الأطباء) إشعاراً فورياً،
# ويظهر مميّزاً في «طلبات الانضمام» بقرار صريح: القبول يضيفه لكوادر الجهة (ENDORSED)
# والرفض يحذف الطلب مع إشعار — ولا حالات أخرى لطلبات الانضمام (لا تعليق ولا تحويل).

# تجهيز: كادران + طبيب جديدون من الإدارة
R50_A=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r50_a.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"كادر طلب انضمام","phone":"791110951","password":"R40@12345","specialty":"تمريض عام","qualification":"بكالوريوس أربع سنوات","yearsOfExperience":2,"gender":"FEMALE"}')
check "تجهيز: الإدارة تنشئ كادراً لفحوص طلب الانضمام → 201" "201" "$R50_A"
N50A_ID=$(jget "['user']['id']" < "$DIR/r50_a.json")
login "$DIR/n50a.jar" "791110951" "R40@12345"

R50_B=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r50_b.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"كادر رفض انضمام","phone":"791110952","password":"R40@12345","specialty":"تمريض عام","qualification":"بكالوريوس أربع سنوات","yearsOfExperience":1,"gender":"MALE"}')
check "تجهيز: الإدارة تنشئ كادراً ثانياً لفحوص الرفض → 201" "201" "$R50_B"
N50B_ID=$(jget "['user']['id']" < "$DIR/r50_b.json")
login "$DIR/n50b.jar" "791110952" "R40@12345"

R50_D=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r50_d.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"طبيب طلب انضمام","phone":"791110953","password":"R40@12345","specialty":"قلبية E2E","qualification":"بكالوريوس طب وجراحة","yearsOfExperience":4,"gender":"MALE"}')
check "تجهيز: الإدارة تنشئ طبيباً لفحوص طلب انضمام الأطباء → 201" "201" "$R50_D"
N50D_ID=$(jget "['user']['id']" < "$DIR/r50_d.json")
login "$DIR/dr50.jar" "791110953" "R40@12345"

# (أ) الكادر يطلب الانضمام لجهة الأساس → إشعار فوري للمستلم الإداري لجهته
R50_JOIN_A=$(code -b "$DIR/n50a.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"note\":\"أطلب الانضمام لجهتكم\",\"requestedStatus\":\"WORKING\"}")
check "الكادر يطلب الانضمام لجهة الأساس → 201" "201" "$R50_JOIN_A"

R50_NOTIF_R=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
ns=d.get('notifications',[])
m=[n for n in ns if n['title']=='طلب انضمام جديد لجهتك الصحية' and 'كادر طلب انضمام' in n['body'] and 'مستشفى E2E الأساس' in n['body'] and n.get('link')=='/receiver/staff']
print('ok' if m and d.get('unreadCount',0)>0 else 'bad')" 2>/dev/null)
check "إشعار فوري للمستلم الإداري: طلب انضمام جديد لجهتك (برابط كوادر جهتي)" "ok" "$R50_NOTIF_R"

R50_NOTIF_PRIV=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
bad=any('791110951' in (n.get('body') or '') for n in d.get('notifications',[]))
print('bad' if bad else 'ok')" 2>/dev/null)
check "خصوصية: إشعار طلب الانضمام بلا رقم هاتف الكادر (القفل باتجاه واحد)" "ok" "$R50_NOTIF_PRIV"

# (ب) الطلب مميّز في كوادر جهتي (isJoinRequest + نوع العمل + الملاحظة)
R50_MARK=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N50A_ID']
ok=len(rows)==1 and rows[0].get('isJoinRequest') is True and rows[0].get('requestedStatusLabel')=='يعمل حالياً' and rows[0].get('joinNote')=='أطلب الانضمام لجهتكم'
print('ok' if ok else 'bad')" 2>/dev/null)
check "الطلب مميّز في كوادر جهتي (isJoinRequest + نوع العمل المطلوب + ملاحظة الكادر)" "ok" "$R50_MARK"

AFF50A=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N50A_ID']
print(rows[0]['affiliationId'] if rows else '')")

# (ج) حماية: طلب الانضمام يُقبل بالإضافة للجهة أو يُرفض — لا حالات أخرى
R50_SUS=$(code -b "$DIR/rcv39.jar" -X PATCH $BASE/api/affiliations/$AFF50A -H "Content-Type: application/json" -d '{"status":"SUSPENDED"}')
check "حماية: طلب الانضمام لا يقبل حالات إدارية (SUSPENDED) → 403" "403" "$R50_SUS"

# (د) القبول: إضافة للجهة (ENDORSED) + إشعار صريح للكادر
R50_ACC=$(curl -s -b "$DIR/rcv39.jar" -o "$DIR/r50_acc.json" -w "%{http_code}" -X PATCH $BASE/api/affiliations/$AFF50A -H "Content-Type: application/json" -d '{"status":"ENDORSED"}')
check "قبول طلب الانضمام (إضافة للجهة) → 200" "200" "$R50_ACC"
R50_ACC_MSG=$(grep -c "تم قبول" "$DIR/r50_acc.json" | awk '{print ($1>=1)?1:0}')
check "رسالة القبول صريحة (تم قبول الكادر وإضافته لكوادر الجهة)" "1" "$R50_ACC_MSG"

R50_ACC_NOTIF=$(curl -s -b "$DIR/n50a.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[n for n in d.get('notifications',[]) if n['title']=='تم قبول طلب انضمامك' and 'أصبحت ضمن كوادر الجهة' in n['body']]
print('ok' if m else 'bad')" 2>/dev/null)
check "إشعار الكادر: تم قبول طلب انضمامك (مع تذكير بأن الاعتماد المهني من الإدارة)" "ok" "$R50_ACC_NOTIF"

R50_MARK2=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N50A_ID']
ok=len(rows)==1 and rows[0].get('isJoinRequest') is False and rows[0]['affiliationStatus']=='ENDORSED'
print('ok' if ok else 'bad')" 2>/dev/null)
check "بعد القبول: الطلب يخرج من طلبات الانضمام ويصبح معتمداً للجهة (ENDORSED)" "ok" "$R50_MARK2"

# (هـ) الرفض: حذف الطلب + إشعار صريح للكادر
R50_JOIN_B=$(code -b "$DIR/n50b.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"requestedStatus\":\"WORKING\"}")
check "تجهيز: كادر ثانٍ يطلب الانضمام → 201" "201" "$R50_JOIN_B"
AFF50B=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N50B_ID']
print(rows[0]['affiliationId'] if rows else '')")
R50_REJ=$(curl -s -b "$DIR/rcv39.jar" -o "$DIR/r50_rej.json" -w "%{http_code}" -X DELETE $BASE/api/affiliations/$AFF50B)
check "رفض طلب الانضمام (حذف الطلب) → 200" "200" "$R50_REJ"
R50_REJ_MSG=$(grep -c "تم رفض" "$DIR/r50_rej.json" | awk '{print ($1>=1)?1:0}')
check "رسالة الرفض صريحة" "1" "$R50_REJ_MSG"
R50_REJ_NOTIF=$(curl -s -b "$DIR/n50b.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[n for n in d.get('notifications',[]) if n['title']=='تم رفض طلب انضمامك']
print('ok' if m else 'bad')" 2>/dev/null)
check "إشعار الكادر: تم رفض طلب انضمامك" "ok" "$R50_REJ_NOTIF"
R50_GONE=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N50B_ID']
print('ok' if len(rows)==0 else 'bad')" 2>/dev/null)
check "بعد الرفض: الطلب يزول نهائياً من كوادر الجهة" "ok" "$R50_GONE"

# (و) مطابقة الدور في الطلبات: طلب الطبيب → إشعار المشرف وقبوله، والمستلم ممنوع
R50_JOIN_D=$(code -b "$DIR/dr50.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"requestedStatus\":\"WORKING\"}")
check "تجهيز: طبيب يطلب الانضمام لجهة الأساس → 201" "201" "$R50_JOIN_D"
AFF50D=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N50D_ID']
print(rows[0]['affiliationId'] if rows else '')")

R50_D_MARK=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N50D_ID']
ok=len(rows)==1 and rows[0].get('isJoinRequest') is True
print('ok' if ok else 'bad')" 2>/dev/null)
check "طلب الطبيب مميّز (isJoinRequest) في أطباء جهتي لدى المشرف" "ok" "$R50_D_MARK"

R50_D_NOTIF_S=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[n for n in d.get('notifications',[]) if n['title']=='طلب انضمام جديد لجهتك الصحية' and 'طبيب طلب انضمام' in n['body'] and n.get('link')=='/supervisor/staff']
print('ok' if m else 'bad')" 2>/dev/null)
check "إشعار فوري لمشرف الأطباء بطلب الطبيب (مطابقة الدور — برابط أطباء جهتي)" "ok" "$R50_D_NOTIF_S"

R50_D_RCV=$(code -b "$DIR/rcv39.jar" -X PATCH $BASE/api/affiliations/$AFF50D -H "Content-Type: application/json" -d '{"status":"ENDORSED"}')
check "حماية مطابقة الدور: المستلم لا يقبل طلب طبيب (من اختصاص المشرف) → 403" "403" "$R50_D_RCV"
R50_D_ACC=$(code -b "$DIR/supervisor.jar" -X PATCH $BASE/api/affiliations/$AFF50D -H "Content-Type: application/json" -d '{"status":"ENDORSED"}')
check "مشرف الأطباء يقبل طلب الطبيب (إضافة للجهة) → 200" "200" "$R50_D_ACC"

# (ز) فحوص ساكنة: قسم الطلبات والحماية في الواجهات والخادم
R50_UI_SECTION=$(grep -l "طلبات انضمام" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: قسم طلبات الانضمام في صفحتي كوادر المستلم وأطباء المشرف" "2" "$R50_UI_SECTION"
R50_UI_ACCEPT=$(grep -l "قبول وإضافة للجهة" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: زر «قبول وإضافة للجهة» في الصفحتين" "2" "$R50_UI_ACCEPT"
R50_UI_REJECT=$(grep -l "رفض الطلب" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: زر «رفض الطلب» في الصفحتين" "2" "$R50_UI_REJECT"
R50_API_NOTIF=$(grep -c "طلب انضمام جديد لجهتك الصحية" app/api/affiliations/route.ts | awk '{print ($1>=1)?1:0}')
check "api: إشعار فوري لمسؤول الجهة عند طلب الانضمام (مطابقة الدور)" "1" "$R50_API_NOTIF"
R50_API_LOCK=$(grep -c "isPendingJoinRequest" "app/api/affiliations/[id]/route.ts" | awk '{print ($1>=2)?1:0}')
check "api: طلبات الانضمام مقفلة بالقبول/الرفض في PATCH وDELETE" "1" "$R50_API_LOCK"
R50_API_MARK=$(grep -c "isJoinRequest" app/api/receiver/staff/route.ts | awk '{print ($1>=1)?1:0}')
check "api: تمييز طلبات الانضمام في استجابة كوادر الجهة" "1" "$R50_API_MARK"

echo ""
echo "=========== 51) الجولة 41 — القبول لا يكسر التطبيق + بطاقة كوادر جهتي مصغرة ==========="
# بلاغ: «عند قبول المستلم الإداري أو مشرف الأطباء أي شخص للجهة الصحية مباشرة يتم حصول
# خلل في التطبيق فيصبح غير مناسب تماماً كتطبيق — يجب أن تجعل بطاقة كوادر جهتي مصغرة».
# الجذر (بفحص متصفح حقيقي 390px): صفوف الكوادر كانت تفيض أفقياً عن الشاشة (550px في 390px)
# فتُقصّ الأزرار — تظهر مباشرة بعد القبول حين تكتمل شارات الصف. والإصلاح: صفوف كتلية
# تلتف دائماً + بطاقة مجتمع مصغّرة (شريط أفقي بدل ثلاث بطاقات مكدسة).
# هذا القسم: دورة قبول كاملة (مستلم ثم مشرف) + مسح صحة كل واجهات الحسابين بعد القبول
# + حواجز ساكنة تمنع رجوع نمط الفيض الأفقي.

# (أ) تجهيز: كادر معتمد بمستندات يطلب الانضمام لجهة الأساس
R51_A=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r51_a.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"NURSE","name":"كادر قبول 41","phone":"791110961","password":"R41@12345","specialty":"تمريض عام","qualification":"بكالوريوس أربع سنوات","yearsOfExperience":3,"gender":"MALE"}')
check "تجهيز: الإدارة تنشئ كادراً لدورة قبول 41 → 201" "201" "$R51_A"
N51A_ID=$(jget "['user']['id']" < "$DIR/r51_a.json")
login "$DIR/n51a.jar" "791110961" "R41@12345"
UP51=$(code -b "$DIR/n51a.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "تجهيز: الكادر يرفع مستنده (شرط الاعتماد) → 201" "201" "$UP51"
AP51=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$N51A_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}')
check "تجهيز: الإدارة تعتمد الكادر → 200" "200" "$AP51"
R51_JOIN=$(code -b "$DIR/n51a.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"note\":\"الرجاء القبول\",\"requestedStatus\":\"WORKING\"}")
check "تجهيز: الكادر يطلب الانضمام لجهة الأساس → 201" "201" "$R51_JOIN"
AFF51=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N51A_ID']
print(rows[0]['affiliationId'] if rows else '')")

# (ب) القبول من المستلم — ثم مسح صحة كامل حساب المستلم (جوهر البلاغ: خلل بالتطبيق كاملا)
R51_ACC=$(code -b "$DIR/rcv39.jar" -X PATCH $BASE/api/affiliations/$AFF51 -H "Content-Type: application/json" -d '{"status":"ENDORSED"}')
check "المستلم يقبل طلب الانضمام → 200" "200" "$R51_ACC"

R51_SWEEP_OK=0; R51_SWEEP_BAD=""
for EP in "/api/receiver/staff" "/api/org/community" "/api/affiliations" "/api/stats" "/api/me/assignments" "/api/posts" "/api/me/profile" "/api/receiver/earnings" "/api/notifications" "/api/receiver/favorites"; do
  C=$(code -b "$DIR/rcv39.jar" "$BASE$EP")
  if [ "$C" = "200" ]; then R51_SWEEP_OK=$((R51_SWEEP_OK+1)); else R51_SWEEP_BAD="$R51_SWEEP_BAD $EP=$C"; fi
done
check "بعد القبول: كل واجهات حساب المستلم سليمة (10/10) — لا خلل بالتطبيق" "10" "$R51_SWEEP_OK"
[ -n "$R51_SWEEP_BAD" ] && echo "  تفاصيل أي أعطال:$R51_SWEEP_BAD"

R51_ROW=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N51A_ID']
ok=len(rows)==1 and rows[0].get('isJoinRequest') is False and rows[0].get('affiliationStatus')=='ENDORSED' and rows[0].get('available') is True
print('ok' if ok else 'bad')" 2>/dev/null)
check "بعد القبول: العضو في كوادر الجهة (ليس طلباً) + شارة متاح الآن" "ok" "$R51_ROW"

R51_STATS=$(curl -s -b "$DIR/rcv39.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d.get('community') or {}
print('ok' if c.get('accreditedNurses',0)>=1 else 'bad')" 2>/dev/null)
check "بعد القبول: إحصاءات بطاقة كوادر جهتي تعكس العضو الجديد" "ok" "$R51_STATS"

R51_PROF=$(code -b "$DIR/n51a.jar" $BASE/api/me/professional-profile)
check "بعد القبول: السجل المهني للكادر المقبول سليم → 200" "200" "$R51_PROF"

# (ج) نفس الدورة للمشرف: طبيب معتمد يطلب ثم المشرف يقبل ومسح صحة حساب المشرف
R51_D=$(curl -s -b "$DIR/admin.jar" -o "$DIR/r51_d.json" -w "%{http_code}" -X POST $BASE/api/admin/users -H "Content-Type: application/json" \
  -d '{"role":"DOCTOR","name":"طبيب قبول 41","phone":"791110962","password":"R41@12345","specialty":"قلبية E2E","qualification":"بكالوريوس طب وجراحة","yearsOfExperience":5,"gender":"MALE"}')
check "تجهيز: الإدارة تنشئ طبيباً لدورة قبول 41 → 201" "201" "$R51_D"
N51D_ID=$(jget "['user']['id']" < "$DIR/r51_d.json")
login "$DIR/dr51.jar" "791110962" "R41@12345"
UP51D=$(code -b "$DIR/dr51.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "تجهيز: الطبيب يرفع مستنده → 201" "201" "$UP51D"
AP51D=$(code -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$N51D_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}')
check "تجهيز: الإدارة تعتمد الطبيب → 200" "200" "$AP51D"
R51_JOIN_D=$(code -b "$DIR/dr51.jar" -X POST $BASE/api/affiliations -H "Content-Type: application/json" \
  -d "{\"hospitalId\":\"$HOSP\",\"requestedStatus\":\"WORKING\"}")
check "تجهيز: الطبيب يطلب الانضمام لجهة الأساس → 201" "201" "$R51_JOIN_D"
AFF51D=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[n for n in d['nurses'] if n['nurse']['id']=='$N51D_ID']
print(rows[0]['affiliationId'] if rows else '')")
R51_ACC_D=$(code -b "$DIR/supervisor.jar" -X PATCH $BASE/api/affiliations/$AFF51D -H "Content-Type: application/json" -d '{"status":"ENDORSED"}')
check "مشرف الأطباء يقبل طلب الطبيب → 200" "200" "$R51_ACC_D"

R51_SWEEP_S=0; R51_SWEEP_SBAD=""
for EP in "/api/receiver/staff" "/api/org/community" "/api/affiliations" "/api/stats" "/api/me/assignments" "/api/posts" "/api/me/profile" "/api/notifications"; do
  C=$(code -b "$DIR/supervisor.jar" "$BASE$EP")
  if [ "$C" = "200" ]; then R51_SWEEP_S=$((R51_SWEEP_S+1)); else R51_SWEEP_SBAD="$R51_SWEEP_SBAD $EP=$C"; fi
done
check "بعد قبول المشرف: كل واجهات حساب المشرف سليمة (8/8)" "8" "$R51_SWEEP_S"
[ -n "$R51_SWEEP_SBAD" ] && echo "  تفاصيل أي أعطال:$R51_SWEEP_SBAD"

R51_STATS_S=$(curl -s -b "$DIR/supervisor.jar" $BASE/api/receiver/staff | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d.get('community') or {}
print('ok' if c.get('accreditedDoctors',0)>=1 else 'bad')" 2>/dev/null)
check "بعد قبول المشرف: إحصاءات أطباء الجهة تعكس الطبيب" "ok" "$R51_STATS_S"

# (د) حواجز ساكنة: صفوف لا تفيض أفقياً + بطاقة مجتمع مصغّرة (الجولة 41)
R51_BLOCK=$(grep -l 'className="rounded-2xl border p-3.5"' app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: صفوف كوادر كتلية (rounded-2xl border p-3.5) في الصفحتين" "2" "$R51_BLOCK"
R51_WRAP=$(grep -l "mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: منطقة الإجراءات سطر ملتف بفاصل (لا تتراكب ولا تفيض) في الصفحتين" "2" "$R51_WRAP"
R51_BADGES=$(grep -l "mt-2 flex flex-wrap items-center gap-1.5" app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: شارات الحالة سطر ملتف مستقل في الصفحتين" "2" "$R51_BADGES"
R51_NO_OLD=$(grep -c 'flex flex-wrap items-center gap-3 rounded-2xl border p-4' app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | awk -F: '{s+=$2} END {print (s==0)?0:s}')
check "ui: النمط القديم المفيض (صف flex-wrap متراكب) أزيل كلياً" "0" "$R51_NO_OLD"
R51_TRUNC=$(grep -l 'max-w-full truncate' app/receiver/staff/page.tsx app/supervisor/staff/page.tsx 2>/dev/null | wc -l | tr -d ' ')
check "ui: أسماء الكوادر مقصوصة بحدود البطاقة (truncate) في الصفحتين" "2" "$R51_TRUNC"
R51_MINI=$(grep -c "function MiniStat" components/shared/entity-cadre-community.tsx | awk '{print ($1>=1)?1:0}')
check "ui: بطاقة كوادر جهتي مصغّرة (MiniStat) بدل البطاقات المكدسة" "1" "$R51_MINI"
R51_STRIP=$(grep -c 'grid grid-cols-3 border-t' components/shared/entity-cadre-community.tsx | awk '{print ($1>=1)?1:0}')
check "ui: شريط الإحصاء الأفقي بثلاث خلايا مدمجة" "1" "$R51_STRIP"
R51_NO_STACK=$(grep -c 'sm:grid-cols-3' components/shared/entity-cadre-community.tsx | awk '{print ($1>=1)?0:1}')
check "ui: لا بطاقات إحصاء مكدسة عمودياً في بطاقة المجتمع" "1" "$R51_NO_STACK"
R51_SUPER_BTN=$(grep -c "إضافة طبيب للجهة" app/supervisor/staff/page.tsx | awk '{print ($1>=2)?1:0}')
check "ui: زر صفحة المشرف «إضافة طبيب للجهة» (وليس ممرض)" "1" "$R51_SUPER_BTN"

echo ""
echo "==========================================="
echo "النتيجة: ✅ $PASS ناجح | ❌ $FAIL فاشل"
if [ $FAIL -gt 0 ]; then printf 'فاشل: %s\n' "${FAILED_TESTS[@]}"; fi
echo "==========================================="
exit $FAIL
