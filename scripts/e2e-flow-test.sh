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
HOSP=$(curl -s -b "$DIR/receiver.jar" $BASE/api/hospitals | python3 -c "import json,sys;h=json.load(sys.stdin)['hospitals'];print(h[0]['id'] if h else '')")
[ -n "$HOSP" ] || { echo "لا توجد مستشفيات في البذرة!"; exit 1; }
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
check "بيانات التواصل ظاهرة للجهة (711111111)" "711111111" "$APP_PHONE"
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

# 17-و) أرباح المستلم الإداري — بعد الجولة 11 يُوزَّع الربح فوراً عند تأكيد دفع الإدارة:
#   8000 من تأكيد دفع تكليف P3 (10٪ من 80000) + 12000 من إنهاء المستلم (10٪ من 120000) = 20000
EARN_TOTAL=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['totalEarned']")
check "ربح المستلم الإجمالي (8000 توزيع تأكيد الدفع + 12000 إنهاء المستلم)" "20000" "$EARN_TOTAL"
EARN_AVAIL=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['available']")
check "الرصيد المتاح للسحب" "20000" "$EARN_AVAIL"

# 17-ز) طلب سحب: رفض تجاوز الرصيد + طلب صحيح بالبيانات
W_OVER=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/withdrawals -H "Content-Type: application/json" \
  -d '{"amount":999999,"walletAddress":"جيب-777000000","accountNumber":"777000000"}')
check "رفض سحب يتجاوز الرصيد → 422" "422" "$W_OVER"

W_OK=$(curl -s -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/withdrawals -H "Content-Type: application/json" \
  -d '{"amount":5000,"walletAddress":"جيب-777000000","accountNumber":"777000000"}' | jget "['withdrawal']['status']")
check "طلب سحب 5000 مع المحفظة والحساب → قيد المعالجة" "PENDING" "$W_OK"

EARN_AVAIL2=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['available']")
check "الرصيد بعد الطلب المعلق (20000-5000)" "15000" "$EARN_AVAIL2"

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
check "الرصيد بعد الصرف (متاح 15000 | مسحوب 5000)" "15000 5000" "$EARN_FINAL"

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
n=[x for x in d['nurses'] if x['nurse']['phone']=='788880303']
print(n[0]['affiliationStatus'], n[0]['nurse']['status'], n[0]['nurse']['_count']['documents'])" 2>/dev/null)
check "كوادر الجهة: ارتباط WORKING + حساب PENDING + 0 مستندات (الحاجز على مستوى الحساب)" "WORKING PENDING 0" "$R8_STAFF_LIST"

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
print('distribute' if ('توزيع رسوم التكليف' in d.get('message','') and s.get('earningAmount')==6000 and s.get('earningCreated')==True) else 'no')" 2>/dev/null)
check "تأكيد الدفع يوزع رسوم التكليف فوراً (ربح 6000 = 10٪ من 60000)" "distribute" "$R11_PAY_MSG"

R11_EARN_AFTER=$(curl -s -b "$DIR/receiver.jar" $BASE/api/receiver/earnings | jget "['summary']['totalEarned']")
check "ربح المستلم زاد بـ 6000 بعد تأكيد الدفع (قبل=$R11_EARN_BEFORE بعد=$R11_EARN_AFTER)" "6000" "$((R11_EARN_AFTER - R11_EARN_BEFORE))"

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
print('ok' if s.get('earningAmount')==6000 and s.get('earningCreated')==False else 'no')" 2>/dev/null)
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
R22_AUD=0
for v in ALL_MATCHING FAVORITES SAME_ORG ENDORSED INTERVIEWED; do
  grep -qF "value: '$v'" app/receiver/assignments/page.tsx && R22_AUD=$((R22_AUD+1))
done
check "receiver: خيارات الجمهور الخمسة (الجميع/المفضلون/الجهة/المعتمدون/المقابلون)" "5" "$R22_AUD"
check "receiver: معاينة الجمهور الحية تتبع التوزيع المختار" "1" "$(
  grep -cF "distribution={form.watch('distribution')" app/receiver/assignments/page.tsx | awk '{print ($1>=1)?1:0}'
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
# القسم 34 — الجولة 23: الإسناد المباشر للمستلم — توزيع التكليف تماماً مثل حساب الإدارة
# المستلم يختار الكادر المعتمد مباشرة فيُنشأ التكليف فوراً ACTIVE ويصله إشعار — بلا تقديمات
# ─────────────────────────────────────────────────────────────────────────────
R23_GUARD=$(grep -cF "requireRole('RECEIVER')" app/api/receiver/assignments/route.ts)
check "receiver-assignments: المسار محصور بالمستلم الإداري" "1" "$R23_GUARD"
check "receiver-assignments: منع المستلم غير المعتمد من الإسناد المباشر" "1" "$(
  grep -cF 'قبل اعتماد حسابك' app/api/receiver/assignments/route.ts | awk '{print ($1>=1)?1:0}'
)"
check "receiver-assignments: المستلم هو الطرف المستقبِل تلقائياً (receiverId من الجلسة)" "1" "$(
  grep -cF 'receiverId: session.user.id' app/api/receiver/assignments/route.ts | awk '{print ($1>=1)?1:0}'
)"
check "receiver-assignments: إشعار الكادر فور الإسناد (نفس رسالة مسار الإدارة)" "1" "$(
  grep -cF 'تم إسناد تكليف جديد إليك' app/api/receiver/assignments/route.ts | awk '{print ($1>=1)?1:0}'
)"
R23_UI=$(( $(grep -c 'DirectAssignmentDialog' app/receiver/assignments/page.tsx) >= 2 ? 1 : 0 ))
check "receiver UI: حوار الإسناد المباشر معرّف ومستخدم" "1" "$R23_UI"
check "receiver UI: إنشاء تكليف جديد يستدعي مسار الإسناد المباشر" "1" "$(
  grep -cF '/api/receiver/assignments' app/receiver/assignments/page.tsx | awk '{print ($1>=1)?1:0}'
)"
R23_SEG=0
for v in 'ALL' 'FAVORITES' 'SAME_ORG' 'ENDORSED' 'INTERVIEWED'; do
  grep -qF "value: '$v'" app/receiver/assignments/page.tsx && R23_SEG=$((R23_SEG+1))
done
check "receiver UI: شرائح اختيار الكوادر الخمس في الإسناد المباشر" "5" "$R23_SEG"

# --- فحوص حية على مسار الإسناد المباشر ---
R23_ANON=$(code -X POST $BASE/api/receiver/assignments -H "Content-Type: application/json" -d '{}')
check "الإسناد المباشر بدون جلسة → 401" "401" "$R23_ANON"
R23_NURSE_ROLE=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/receiver/assignments -H "Content-Type: application/json" -d '{}')
check "الإسناد المباشر بجلسة الكادر → 403" "403" "$R23_NURSE_ROLE"
R23_ADMIN_ROLE=$(code -b "$DIR/admin.jar" -X POST $BASE/api/receiver/assignments -H "Content-Type: application/json" -d '{}')
check "الإسناد المباشر بجلسة الإدارة → 403" "403" "$R23_ADMIN_ROLE"
R23_BAD=$(code -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/assignments -H "Content-Type: application/json" \
  -d "{\"title\":\"تكليف إسناد مباشر\",\"facility\":\"مستشفى الاختبار\",\"startDate\":\"$TODAY\",\"nurseId\":\"INVALID\"}")
check "الإسناد المباشر لكادر غير موجود → 422" "422" "$R23_BAD"

R23_OK=$(curl -s -w '\n%{http_code}' -b "$DIR/receiver.jar" -X POST $BASE/api/receiver/assignments -H "Content-Type: application/json" \
  -d "{\"title\":\"تكليف إسناد مباشر جولة 23\",\"description\":\"إنشاء مباشر بلا تقديمات\",\"facility\":\"مستشفى الاختبار التخصصي\",\"department\":\"الطوارئ\",\"startDate\":\"$TODAY\",\"nurseId\":\"$NURSE_ID\"}")
R23_CODE=$(echo "$R23_OK" | tail -1)
R23_ID=$(echo "$R23_OK" | head -n -1 | jget "['assignment']['id']")
check "المستلم يُنشئ تكليفاً مباشراً لكادر معتمد → 201" "201" "$R23_CODE"

R23_RCV=$(curl -s -b "$DIR/receiver.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=next((x for x in d.get('assignments',[]) if x['id']=='$R23_ID'),None)
print('yes' if a and a['status']=='ACTIVE' and a.get('post') is None else 'no')")
check "التكليف المباشر يظهر للمستلم: ACTIVE وبدون تكليف مُعلن" "yes" "$R23_RCV"

R23_N=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/assignments | python3 -c "
import json,sys
ids=[a['id'] for a in json.load(sys.stdin).get('assignments',[])]
print('yes' if '$R23_ID' in ids else 'no')")
check "التكليف المباشر يظهر عند الكادل المُسند إليه" "yes" "$R23_N"

R23_NOTIF=$(curl -s -b "$DIR/nurse.jar" $BASE/api/notifications | python3 -c "
import json,sys
d=json.load(sys.stdin)
ns=[n for n in d.get('notifications',[]) if 'تكليف إسناد مباشر جولة 23' in (n.get('body') or '')]
print('yes' if ns else 'no')")
check "إشعار فوري للكادر بنص مسار الإدارة نفسه" "yes" "$R23_NOTIF"

echo ""
echo "==========================================="
echo "النتيجة: ✅ $PASS ناجح | ❌ $FAIL فاشل"
if [ $FAIL -gt 0 ]; then printf 'فاشل: %s\n' "${FAILED_TESTS[@]}"; fi
echo "==========================================="
exit $FAIL
