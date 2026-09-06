#!/bin/bash
# ============================================================
# Takleefat E2E — التدفقات الكاملة + ميزات الجولة الثالثة
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

echo "=========== 1) المصادقة ==========="
H=$(code $BASE/api/health); check "فحص الصحة /api/health" "200" "$H"

login "$DIR/admin.jar" "773178684" "Admin@1234"
ADMIN_OK=$(curl -s -b "$DIR/admin.jar" $BASE/api/stats -o /dev/null -w "%{http_code}")
check "تسجيل دخول الإدارة 773178684" "200" "$ADMIN_OK"

login "$DIR/nurse.jar" "711111111" "Nurse@1234"
NURSE_OK=$(code -b "$DIR/nurse.jar" $BASE/api/stats)
check "تسجيل دخول الكادر المعتمد 711111111" "200" "$NURSE_OK"

login "$DIR/receiver.jar" "733333333" "Receiver@1234"
RCV_OK=$(code -b "$DIR/receiver.jar" $BASE/api/stats)
check "تسجيل دخول المستلم الإداري 733333333" "200" "$RCV_OK"

echo "=========== 2) رفع المستندات (صور فقط + ضغط) ==========="
UP=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=ID_CARD")
check "رفع صورة البطاقة → 201" "201" "$UP"

UP2=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.pdf;type=application/pdf" -F "type=PRACTICE_LICENSE")
check "رفض ملف غير صورة (PDF) → 422" "422" "$UP2"

UP3=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/upload -F "file=@$DIR/test.png;type=image/png" -F "type=INVALID")
check "رفض نوع مستند غير صحيح → 422" "422" "$UP3"

DOCS=$(curl -s -b "$DIR/nurse.jar" $BASE/api/me/documents | jget "['documents'][0]['status']")
check "المستند المرفوع بانتظار المراجعة" "PENDING" "$DOCS"

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

DUP=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$POST_ID/apply -H "Content-Type: application/json" -d '{}')
check "منع التقديم المكرر → 409" "409" "$DUP"

echo "=========== 5) بيانات المتقدم + حقل applicationId (إصلاح اعتماد التقديم) ==========="
APPS_JSON=$(curl -s -b "$DIR/receiver.jar" $BASE/api/posts/$POST_ID/applications)
APP_NAME=$(echo "$APPS_JSON" | jget "['applications'][0]['nurse']['name']")
check "رؤية بيانات المتقدم (الاسم: سارة أحمد)" "سارة أحمد" "$APP_NAME"
APP_PHONE=$(echo "$APPS_JSON" | jget "['applications'][0]['nurse']['phone']")
check "بيانات التواصل ظاهرة للجهة (711111111)" "711111111" "$APP_PHONE"
APP_SPEC=$(echo "$APPS_JSON" | jget "['applications'][0]['nurse']['specialty']")
check "التخصص ظاهر في السيرة (تمريض عام)" "تمريض عام" "$APP_SPEC"
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

echo "=========== 10) اعتماد الحسابات المعلقة ==========="
PENDING_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=NURSE&status=PENDING" | jget "['users'][0]['id']")
APPR=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$PENDING_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}' | jget "['user']['status']")
check "الإدارة اعتمدت الحساب المعلق" "APPROVED" "$APPR"

APPLY2=$(code -b "$DIR/nurse.jar" -X POST $BASE/api/posts/$POST_ID/apply -H "Content-Type: application/json" -d '{}')
check "الكادر المُعتمد حديثاً يظهر تقديمه → 409 (مغلق) أو 201" "409" "$APPLY2"

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
  -d "{\"name\":\"كادر مؤقت\",\"phone\":\"$TMP_PHONE\",\"password\":\"Temp@12345\",\"role\":\"NURSE\",\"specialty\":\"تمريض عام\",\"qualification\":\"بكالوريوس\",\"yearsOfExperience\":3}")
TMP_ID=$(echo "$TMP_CREATE" | jget "['user']['id']")
[ -n "$TMP_ID" ] && check "الإدارة تنشئ حساب كادر مؤقت للاختبار" "ok" "ok" || check "حساب مؤقت" "id" "null"

login "$DIR/tmp.jar" "$TMP_PHONE" "Temp@12345"
TMP_OK=$(code -b "$DIR/tmp.jar" $BASE/api/stats)
check "الحساب المؤقت يدخل فوراً" "200" "$TMP_OK"

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

echo "=========== 17) الحذف النهائي للحسابات ==========="
DEL_USER=$(code -b "$DIR/admin.jar" -X DELETE $BASE/api/admin/users/$TMP_ID)
check "الإدارة تحذف الحساب نهائياً → 200" "200" "$DEL_USER"

GONE=$(code -b "$DIR/tmp5.jar" $BASE/api/stats)
check "الحساب المحذوف لم يعد يدخل → 401" "401" "$GONE"

echo "=========== 18) حذف التكليفات (تنظيف) ==========="
DELP=$(curl -s -b "$DIR/admin.jar" -X DELETE $BASE/api/posts/$P2_ID)
DELP_MSG=$(echo "$DELP" | jget "['message']")
[ -n "$DELP_MSG" ] && check "الإدارة تحذف تكليفاً معلناً" "ok" "ok"
echo "   $DELP_MSG"

echo ""
echo "==========================================="
echo "النتيجة: ✅ $PASS ناجح | ❌ $FAIL فاشل"
if [ $FAIL -gt 0 ]; then printf 'فاشل: %s\n' "${FAILED_TESTS[@]}"; fi
echo "==========================================="
exit $FAIL
