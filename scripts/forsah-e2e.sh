#!/bin/bash
# ============================================================
# اختبار E2E شامل لميزة «فرصة | Forsah» — الجولتان 66/67
# يشغّل الدورة الكاملة على قاعدة الاختبار المحلية ويتحقق من كل قواعد
# المواصفة: الأهلية، منع التكرار، إغلاق server-side، المالية، الصلاحيات
# + الجولة 67: الاسم التلقائي، إلزام القسم/التخصص، والإغلاق الكلي للنظام.
# ============================================================
set -u
BASE="http://localhost:3000"
NEW_HR_PHONE="77$(shuf -i 1000000-9999999 -n 1)"
JAR_DIR="/tmp/forsah-e2e"
mkdir -p "$JAR_DIR"

PASS=0; FAIL=0
check() { # check <name> <condition(0=ok)>
  if [ "$2" -eq 0 ]; then PASS=$((PASS+1)); echo "  ✅ $1"
  else FAIL=$((FAIL+1)); echo "  ❌ $1"; fi
}
jqget() { echo "$1" | python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(\"d$2\"))" 2>/dev/null; }

login() { # login <phone> <password> <jarname>
  local jar="$JAR_DIR/$3.txt"
  local res=$(curl -s -c "$jar" -X POST "$BASE/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "phone=$1&password=$2&csrfToken=&json=true" -o /dev/null -w "%{http_code}")
  # NextAuth credentials عبر callback يحتاج csrf — نجلبها أولاً
  curl -s -c "$jar" "$BASE/api/auth/csrf" > "$JAR_DIR/csrf-$3.json"
  local token=$(jqget "$(cat "$JAR_DIR/csrf-$3.json")" "['csrfToken']")
  res=$(curl -s -b "$jar" -c "$jar" -X POST "$BASE/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "phone=$1&password=$2&csrfToken=$token&json=true" -o /dev/null -w "%{http_code}")
  echo "$res"
}

api() { # api <jar> <method> <path> [body]
  local jar="$JAR_DIR/$1.txt"; local m="$2"; local p="$3"; local b="${4:-}"
  if [ -n "$b" ]; then
    curl -s -b "$jar" -X "$m" "$BASE$p" -H "Content-Type: application/json" -d "$b"
  else
    curl -s -b "$jar" -X "$m" "$BASE$p"
  fi
}

echo "═══ 0) تسوية إعدادات الرسوم (نسبة 5٪ من الراتب + عمولة HR 30٪) ═══"
login "773178684" "admin12345" "admin" > /dev/null
api admin PATCH "/api/admin/forsah" '{"forsahFeeType": "PERCENTAGE", "forsahFeeValue": 5, "forsahHrCommissionPercent": 30, "forsahFeeMin": 0, "forsahFeeMax": 0}' > /dev/null
HRS_ID=$(api admin GET "/api/admin/forsah" | python3 -c "import sys,json;print([a['id'] for a in json.load(sys.stdin)['hrAccounts'] if a['phone']=='770100200'][0])")
PERMS=$(api admin GET "/api/admin/forsah" | python3 -c "
import sys,json
d=json.load(sys.stdin)
perms=[a['forsahPermissions'] for a in d['hrAccounts'] if a['phone']=='770100200'][0]
print(json.dumps(sorted(set(perms + ['opportunity.close']))))")
api admin PATCH "/api/admin/hr/$HRS_ID" "{\"action\": \"SET_PERMISSIONS\", \"forsahPermissions\": $PERMS}" > /dev/null
echo "  (تم منح close لحساب HR الاختباري لإختبار مسار إغلاق HR)"

echo "═══ 1) تسجيل الدخول لكل الأدوار ═══"
r=$(login "770100200" "Forsah1234" "hr");        check "دخول HR (200)" $([ "$r" = "200" ] && echo 0 || echo 1)
r=$(login "770300400" "Nurse1234" "nurse");      check "دخول الكادر المؤهل (200)" $([ "$r" = "200" ] && echo 0 || echo 1)
r=$(login "770300500" "Nurse1234" "nurse2");     check "دخول الكادر غير المؤهل (200)" $([ "$r" = "200" ] && echo 0 || echo 1)
r=$(login "770500600" "Doctor1234" "doctor");    check "دخول الطبيب (200)" $([ "$r" = "200" ] && echo 0 || echo 1)
r=$(login "773178684" "admin12345" "admin");     check "دخول الإدارة (200)" $([ "$r" = "200" ] && echo 0 || echo 1)

echo "═══ 2) الحماية: منع الوصول غير المصرح ═══"
res=$(api nurse POST "/api/admin/hr" '{}')
echo "$res" | grep -qE "ليست لديك صلاحية|403" && check "NURSE مرفوض من إنشاء HR (403)" 0 || { check "NURSE مرفوض من إنشاء HR" 1; echo "    RES: $(echo $res | head -c 150)"; }
res=$(api nurse GET "/api/admin/forsah")
echo "$res" | grep -qE "ليست لديك صلاحية|403" && check "NURSE مرفوض من لوحة فرصة الإدارية (403)" 0 || { check "NURSE مرفوض من /api/admin/forsah" 1; echo "    RES: $(echo $res | head -c 150)"; }
res=$(api hr GET "/api/admin/forsah")
echo "$res" | grep -q "ليست لديك صلاحية" && check "HR مرفوض من لوحة الإدارة (403)" 0 || { check "HR مرفوض من /api/admin/forsah" 1; echo "    RES: $(echo $res | head -c 150)"; }
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_DIR/nurse.txt" "$BASE/hr")
[ "$code" = "404" ] || [ "$code" = "307" ] || [ "$code" = "302" ] && check "NURSE يُحظر من صفحة /hr ($code)" 0 || check "NURSE يُحظر من صفحة /hr ($code)" 1

echo "═══ 3) HR ينشئ فرصة (الجولة 67: بلا حقل اسم — الاسم يُولّد من القسم) ═══"
HOSPITAL_ID=$(api hr GET "/api/hospitals" | python3 -c "import sys,json;print(json.load(sys.stdin)['hospitals'][0]['id'])")
DEPT_ID=$(api hr GET "/api/departments" | python3 -c "import sys,json;print(json.load(sys.stdin)['departments'][0]['id'])")
DEPT_NAME=$(api hr GET "/api/departments" | python3 -c "import sys,json;print(json.load(sys.stdin)['departments'][0]['name'])")
# أولاً: الرفض بلا قسم (إلزامي الآن)
res=$(api hr POST "/api/opportunities" '{
  "hospitalId": "'$HOSPITAL_ID'",
  "audience": "NURSE",
  "salaryAmount": 300000,
  "salaryType": "MONTHLY",
  "salaryCurrency": "YER",
  "positionsNeeded": 2,
  "gender": "FEMALE"
}')
echo "$res" | grep -q "القسم الطبي المطلوب إجباري" && check "الإنشاء بلا قسم مرفوض (إلزامي)" 0 || { check "الإنشاء بلا قسم مرفوض" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api hr POST "/api/opportunities" '{
  "hospitalId": "'$HOSPITAL_ID'",
  "audience": "NURSE",
  "departmentId": "'$DEPT_ID'",
  "salaryAmount": 300000,
  "salaryType": "MONTHLY",
  "salaryCurrency": "YER",
  "workStartTime": "08:00",
  "workEndTime": "20:00",
  "positionsNeeded": 2,
  "gender": "FEMALE",
  "vacations": "جمعة أسبوعياً",
  "procedureSharePercent": null,
  "minYearsExperience": 2,
  "licenseRequired": false,
  "requiredDocuments": ["الهوية الشخصية"],
  "description": "فرصة عمل لكوادر التمريض في قسم العناية المركزة",
  "responsibilities": "متابعة الحالات الحرجة",
  "benefits": "بدل نقل",
  "notes": ""
}')
OPP_ID=$(jqget "$res" "['opportunity']['id']")
OPP_NUM=$(jqget "$res" "['opportunity']['number']")
echo "$res" | grep -q "مسودة" && check "إنشاء الفرصة كمسودة (رقم $OPP_NUM)" 0 || { check "إنشاء الفرصة كمسودة" 1; echo "    RES: $res" | head -c 300; }
AUTO_TITLE=$(jqget "$res" "['opportunity']['title']")
[ "$AUTO_TITLE" = "فرصة $DEPT_NAME" ] && check "الاسم التلقائي = «فرصة $DEPT_NAME»" 0 || { check "الاسم التلقائي (got: $AUTO_TITLE)" 1; }

echo "═══ 4) النشر وإشعار المؤهلين ═══"
res=$(api hr PATCH "/api/opportunities/$OPP_ID" '{"action": "publish"}')
echo "$res" | grep -qE "نُشرت الفرصة|نشرت الفرصة" && check "نشر الفرصة" 0 || { check "نشر الفرصة" 1; echo "    RES: $res" | head -c 300; }
res=$(api hr GET "/api/forsah/dashboard")
PUB=$(jqget "$res" "['stats']['published']")
[ "$PUB" = "1" ] && check "إحصائية «منشورة» = 1" 0 || check "إحصائية «منشورة» = 1 (got $PUB)" 1

echo "═══ 5) فلترة الأهلية من الخادم ═══"
res=$(api nurse GET "/api/opportunities")
COUNT=$(jqget "$res" "['total']")
[ "$COUNT" = "1" ] && check "الكادر المؤهل يرى الفرصة" 0 || { check "الكادر المؤهل يرى الفرصة ($COUNT)" 1; echo "   RES: $(echo $res | head -c 400)"; }
res=$(api nurse2 GET "/api/opportunities")
COUNT=$(jqget "$res" "['total']")
[ "$COUNT" = "0" ] && check "غير المؤهل (ذكر/بلا خبرة) لا يراها" 0 || check "غير المؤهل لا يراها ($COUNT)" 1
res=$(api doctor GET "/api/opportunities")
COUNT=$(jqget "$res" "['total']")
[ "$COUNT" = "0" ] && check "الطبيب لا يرى فرصة الكادر (جمهور)" 0 || check "الطبيب لا يرى فرصة الكادر ($COUNT)" 1

echo "═══ 6) التقديم ومنع التكرار ═══"
res=$(api nurse POST "/api/opportunities/$OPP_ID/apply" '{"coverNote": "أرغب بالتقديم، لدي خبرة 3 سنوات"}')
echo "$res" | grep -q "تم إرسال طلبك بنجاح" && check "تقديم ناجح" 0 || { check "تقديم ناجح" 1; echo "    RES: $(echo $res | head -c 300)"; }
res=$(api nurse POST "/api/opportunities/$OPP_ID/apply" '{}')
echo "$res" | grep -q "مسبقاً" && check "التقديم المكرر مرفوض (409)" 0 || check "التقديم المكرر مرفوض" 1
res=$(api nurse2 POST "/api/opportunities/$OPP_ID/apply" '{}')
echo "$res" | grep -qE "لا تستوفي شروط هذه الفرصة|لا يمكنك التقديم" && check "غير المؤهل مرفوض من التقديم (server-side)" 0 || { check "غير المؤهل مرفوض" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api nurse GET "/api/me/opportunities")
echo "$res" | grep -q '"status":"PENDING"' && check "«فرصي» يعرض الطلب (PENDING)" 0 || { check "«فرصي» يعرض الطلب" 1; echo "    RES: $(echo $res | head -c 200)"; }

echo "═══ 7) المراجعة ثم المقابلة ═══"
APP_ID=$(api hr GET "/api/opportunities/$OPP_ID/applications" | python3 -c "import sys,json;print(json.load(sys.stdin)['applications'][0]['id'])")
res=$(api hr PATCH "/api/opportunities/applications/$APP_ID" '{"status": "REVIEWED"}')
echo "$res" | grep -q "تمت مراجعة الطلب" && check "مراجعة الطلب" 0 || { check "مراجعة الطلب" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api hr POST "/api/opportunities/$OPP_ID/interviews" '{
  "applicationIds": ["'$APP_ID'"],
  "scheduledDate": "2026-12-01",
  "scheduledTime": "10:30",
  "mode": "ONSITE",
  "location": "مبنى الإدارة — الطابق الثالث",
  "address": "صنعاء — شارع الزراعة",
  "mapUrl": "",
  "notes": "احضري الهوية"
}')
echo "$res" | grep -q "دعوة مقابلة" && check "إرسال دعوة المقابلة" 0 || { check "إرسال دعوة المقابلة" 1; echo "    RES: $(echo $res | head -c 300)"; }
INT_ID=$(api nurse GET "/api/me/opportunities" | python3 -c "import sys,json;print(json.load(sys.stdin)['applications'][0]['interviews'][0]['id'])")
res=$(api nurse POST "/api/opportunities/interviews/$INT_ID/respond" '{"response": "CONFIRMED"}')
echo "$res" | grep -q "أكدت حضورك" && check "تأكيد الحضور" 0 || { check "تأكيد الحضور" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api nurse GET "/api/me/opportunities")
echo "$res" | grep -q '"status":"INTERVIEW_CONFIRMED"' && check "حالة الطلب = مقابلة مؤكدة" 0 || { check "حالة الطلب = مقابلة مؤكدة" 1; echo "    RES: $(echo $res | head -c 200)"; }

echo "═══ 8) الاختيار والعملية المالية (Idempotent) ═══"
res=$(api hr POST "/api/opportunities/$OPP_ID/selections" '{"applicationIds": ["'$APP_ID'"], "note": "أداء ممتاز"}')
echo "$res" | grep -q "تم اختيار" && check "اختيار الموظف" 0 || { check "اختيار الموظف" 1; echo "    RES: $(echo $res | head -c 300)"; }
# الرسوم: 5٪ من 300000 = 15000 — HR 30٪ = 4500 — الإدارة 10500
res=$(api hr GET "/api/opportunities/$OPP_ID/transaction")
FEE=$(jqget "$res" "['transactions'][0]['feeAmount']")
HRC=$(jqget "$res" "['transactions'][0]['hrCommissionAmount']")
ADM=$(jqget "$res" "['transactions'][0]['adminAmount']")
[ "$FEE" = "15000" ] && [ "$HRC" = "4500" ] && [ "$ADM" = "10500" ] && check "الحساب المالي 15000/4500/10500 صحيح" 0 || check "الحساب المالي ($FEE/$HRC/$ADM)" 1
# إعادة الاختيار نفسه مرفوضة (الطلب في حالة SELECTED)
res=$(api hr POST "/api/opportunities/$OPP_ID/selections" '{"applicationIds": ["'$APP_ID'"]}')
echo "$res" | grep -q "error\|غير متاحة" && check "إعادة الاختيار مرفوضة (لا تكرار)" 0 || check "إعادة الاختيار مرفوضة" 1
TXCOUNT=$(api hr GET "/api/opportunities/$OPP_ID/transaction" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['transactions']))")
[ "$TXCOUNT" = "1" ] && check "عملية مالية واحدة حصراً (idempotencyKey)" 0 || check "عملية مالية واحدة ($TXCOUNT)" 1
# فتح رقم المتقدم المختار لـHR
res=$(api hr GET "/api/opportunities/applications/$APP_ID")
echo "$res" | grep -q '"phoneLocked":false' && check "رقم المختار مفتوح لـHR (خصوصية)" 0 || { check "رقم المختار مفتوح لـHR" 1; echo "    RES: $(echo $res | grep -o 'phoneLocked[^,]*' | head -2)"; }

echo "═══ 9) إغلاق الفرصة — server-side enforced ═══"
res=$(api hr PATCH "/api/opportunities/$OPP_ID" '{"action": "close"}')
echo "$res" | grep -q "أُغلقت الفرصة" && check "إغلاق من HR المصرح له" 0 || { check "إغلاق من HR" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api nurse2 POST "/api/opportunities/$OPP_ID/apply" '{}')
echo "$res" | grep -q "هذه الفرصة مغلقة ولم تعد متاحة للتقديم" && check "التقديم بعد الإغلاق مرفوض برسالة المواصفة" 0 || { check "التقديم بعد الإغلاق مرفوض" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api hr POST "/api/opportunities/$OPP_ID/interviews" '{"applicationIds": [], "scheduledDate": "2026-12-01", "scheduledTime": "10:00", "mode": "ONSITE", "location": "x"}')
echo "$res" | grep -q "error\|مغلقة" && check "لا دعوات مقابلات جديدة بعد الإغلاق" 0 || check "لا دعوات جديدة بعد الإغلاق" 1
# البيانات محفوظة: الطلبات والمقابلات والاختيارات باقية
res=$(api hr GET "/api/opportunities/$OPP_ID/applications")
SELCOUNT=$(jqget "$res" "['selectedCount']")
[ "$SELCOUNT" = "1" ] && check "الاختيارات محفوظة بعد الإغلاق (لا حذف)" 0 || check "الاختيارات محفوظة ($SELCOUNT)" 1
res=$(api hr GET "/api/opportunities/$OPP_ID/transaction")
TXCOUNT=$(echo "$res" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['transactions']))")
[ "$TXCOUNT" = "1" ] && check "البيانات المالية محفوظة بعد الإغلاق" 0 || check "البيانات المالية محفوظة ($TXCOUNT)" 1
# HR بلا صلاحية close لا يغلق — ملاحظة: hr الاختباري مُنح close ضمنياً؟ لا — لم نمنحه close!
# سحب صلاحية close من hr ثم إنشاء فرصة جديدة والمحاولة
PERMS=$(api admin GET "/api/admin/forsah" | python3 -c "
import sys,json
d=json.load(sys.stdin)
perms=[a['forsahPermissions'] for a in d['hrAccounts'] if a['phone']=='770100200'][0]
print(json.dumps([p for p in perms if p!='opportunity.close']))")
api admin PATCH "/api/admin/hr/$(api admin GET '/api/admin/forsah' | python3 -c "import sys,json;print([a['id'] for a in json.load(sys.stdin)['hrAccounts'] if a['phone']=='770100200'][0])")" "{\"action\": \"SET_PERMISSIONS\", \"forsahPermissions\": $PERMS}" > /dev/null
res=$(api hr POST "/api/opportunities" '{
  "hospitalId": "'$HOSPITAL_ID'",
  "audience": "NURSE",
  "departmentId": "'$DEPT_ID'",
  "salaryAmount": 100000,
  "salaryType": "MONTHLY",
  "salaryCurrency": "YER",
  "positionsNeeded": 1,
  "gender": "ANY"
}')
OPP2_ID=$(jqget "$res" "['opportunity']['id']")
[ -n "$OPP2_ID" ] && check "إنشاء فرصة ثانية" 0 || check "إنشاء فرصة ثانية" 1
res=$(api hr PATCH "/api/opportunities/$OPP2_ID" '{"action": "close"}')
echo "$res" | grep -q "ليست لديك صلاحية" && check "HR بلا صلاحية close مرفوض من الإغلاق (403)" 0 || { check "HR بلا صلاحية close مرفوض" 1; echo "    RES: $(echo $res | head -c 200)"; }
# الإدارة تغلق أي فرصة — السلطة العليا
res=$(api admin PATCH "/api/opportunities/$OPP2_ID" '{"action": "close"}')
echo "$res" | grep -q "أُغلقت الفرصة" && check "الإدارة تُغلق أي فرصة (السلطة العليا)" 0 || { check "الإدارة تُغلق أي فرصة" 1; echo "    RES: $(echo $res | head -c 200)"; }

echo "═══ 10) الإدارة: الرسوم + HR + التدقيق ═══"
res=$(api admin PATCH "/api/admin/forsah" '{"forsahFeeType": "FIXED", "forsahFeeValue": 20000, "forsahHrCommissionPercent": 30, "forsahFeeMin": 0, "forsahFeeMax": 0}')
echo "$res" | grep -q "حُفظت إعدادات" && check "تحديث إعدادات الرسوم (مبلغ ثابت 20000)" 0 || check "تحديث إعدادات الرسوم" 1
NEW_HR_JSON='{"name": "منى صالح", "phone": "PHONE_PLACEHOLDER", "email": "", "hospitalName": "مستشفى الأمل", "jobTitle": "أخصائية توظيف", "password": "HrPass1234", "status": "APPROVED", "forsahPermissions": [], "forsahCommissionPercent": null}'
NEW_HR_JSON="${NEW_HR_JSON/PHONE_PLACEHOLDER/$NEW_HR_PHONE}"
res=$(api admin POST "/api/admin/hr" "$NEW_HR_JSON")
echo "$res" | grep -q "أُنشئ حساب" && check "الإدارة تنشئ حساب HR جديد" 0 || { check "الإدارة تنشئ حساب HR" 1; echo "    RES: $(echo $res | head -c 300)"; }
res=$(api hr GET "/api/opportunities")
echo "$res" | grep -q "منى صالح" && check "HR لا يرى حسابات HR الآخرين (معزولة)" 1 || check "HR لا يرى حسابات HR الآخرين" 0
res=$(api admin GET "/api/admin/forsah")
echo "$res" | grep -q "أنشأ حساب HR\|HR_CREATED" && check "سجل التدقيق يوثق إنشاء HR" 0 || check "سجل التدقيق يوثق إنشاء HR" 1
# دفع العملية من الإدارة
TX_ID=$(api admin GET "/api/admin/forsah" > /dev/null; api hr GET "/api/opportunities/$OPP_ID/transaction" | python3 -c "import sys,json;print(json.load(sys.stdin)['transactions'][0]['id'])")
res=$(api admin PATCH "/api/opportunities/$OPP_ID/transaction" '{"transactionId": "'$TX_ID'", "status": "PAID"}')
echo "$res" | grep -q "مسددة" && check "الإدارة تسدد العملية المالية" 0 || { check "الإدارة تسدد العملية" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api hr PATCH "/api/opportunities/$OPP_ID/transaction" '{"transactionId": "'$TX_ID'", "status": "CANCELLED"}')
echo "$res" | grep -q "ليست لديك صلاحية\|error" && check "HR لا يستطيع تعديل العمليات المالية (403)" 0 || check "HR لا يعدل العمليات" 1

echo "═══ 10.5) الجولة 67: الإغلاق الكلي لنظام «فرصة» من الإدارة ═══"
res=$(api nurse GET "/api/forsah/status")
echo "$res" | grep -q '"enabled":true' && check "حالة النظام = يعمل (status)" 0 || check "حالة النظام = يعمل" 1
# الإدارة تُغلق النظام كلياً
res=$(api admin PATCH "/api/admin/forsah" '{"systemEnabled": false}')
echo "$res" | grep -q "أُغلق نظام" && check "الإدارة تُغلق النظام كلياً" 0 || { check "الإدارة تُغلق النظام" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api nurse GET "/api/forsah/status")
echo "$res" | grep -q '"enabled":false' && check "الحالة بعد الإغلاق = مغلق" 0 || check "الحالة بعد الإغلاق" 1
# كل المسارات مرفوضة برسالة الإغلاق (503) — HR والكادر
res=$(api hr GET "/api/opportunities")
echo "$res" | grep -q "نظام «فرصة» مغلق" && check "HR مرفوض من الفرص عند الإغلاق (503)" 0 || { check "HR مرفوض عند الإغلاق" 1; echo "    RES: $(echo $res | head -c 150)"; }
res=$(api nurse GET "/api/opportunities")
echo "$res" | grep -q "نظام «فرصة» مغلق" && check "الكادر مرفوض من الفرص عند الإغلاق" 0 || check "الكادر مرفوض عند الإغلاق" 1
res=$(api nurse POST "/api/opportunities/$OPP2_ID/apply" '{}')
echo "$res" | grep -q "نظام «فرصة» مغلق" && check "التقديم مرفوض عند الإغلاق الكلي" 0 || check "التقديم مرفوض عند الإغلاق" 1
res=$(api hr GET "/api/forsah/dashboard")
echo "$res" | grep -q "نظام «فرصة» مغلق" && check "لوحة HR محجوبة عند الإغلاق" 0 || check "لوحة HR محجوبة" 1
# الإدارة مستثناة — ترى كل شيء لإعادة التشغيل
res=$(api admin GET "/api/opportunities")
echo "$res" | grep -q '"opportunities"' && check "الإدارة تبقى قادرة على العرض (استثناء)" 0 || check "الإدارة تبقى قادرة على العرض" 1
# المسار العام SEO يرجع قائمة فارغة بلا خطأ
res=$(curl -s "$BASE/api/opportunities/public")
TOTAL=$(jqget "$res" "['total']")
[ "$TOTAL" = "0" ] && check "المسار العام يعيد قائمة فارغة عند الإغلاق" 0 || check "المسار العام عند الإغلاق ($TOTAL)" 1
# إعادة التشغيل — كل شيء يعود
res=$(api admin PATCH "/api/admin/forsah" '{"systemEnabled": true}')
echo "$res" | grep -q "أُعيد تشغيل" && check "الإدارة تعيد تشغيل النظام" 0 || { check "الإدارة تعيد التشغيل" 1; echo "    RES: $(echo $res | head -c 200)"; }
res=$(api hr GET "/api/opportunities")
echo "$res" | grep -q '"opportunities"' && check "HR يعمل مجدداً بعد إعادة التشغيل (البيانات محفوظة)" 0 || check "HR يعمل مجدداً" 1
res=$(api hr GET "/api/opportunities/$OPP_ID/transaction")
TXCOUNT=$(echo "$res" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['transactions']))" 2>/dev/null)
[ "$TXCOUNT" = "1" ] && check "البيانات المالية سليمة بعد دورة الإغلاق الكامل" 0 || check "البيانات المالية بعد الإغلاق ($TXCOUNT)" 1

echo "═══ 10.6) الجولة 68: المنشأة من الجهات + حذف HR بتأكيد كلمة مرور الإدارة ═══"
# المنشأة تُختار حصراً من الجهات الصحية — إنشاء بلا منشأة مرفوض
FAC_PHONE="77$(shuf -i 1000000-9999999 -n 1)"
NOFAC_JSON='{"name": "فاطمة سالم", "phone": "PHONE_PLACEHOLDER", "email": "", "hospitalName": "", "jobTitle": "", "password": "HrPass1234", "status": "APPROVED", "forsahPermissions": [], "forsahCommissionPercent": null}'
NOFAC_JSON="${NOFAC_JSON/PHONE_PLACEHOLDER/$FAC_PHONE}"
res=$(api admin POST "/api/admin/hr" "$NOFAC_JSON")
echo "$res" | grep -q "اختيار المنشأة" && check "إنشاء HR بلا منشأة مرفوض (المنشأة إجبارية)" 0 || { check "إنشاء HR بلا منشأة مرفوض" 1; echo "    RES: $(echo $res | head -c 200)"; }
# إنشاء HR بمنشأة من قائمة الجهات الصحية الفعلية (نفس تدفق الواجهة الجديد)
FAC_NAME=$(api admin GET "/api/hospitals" | python3 -c "import sys,json;h=json.load(sys.stdin)['hospitals'];print(h[0]['name'] if h else 'مستشفى الأمل')")
FAC_JSON='{"name": "فاطمة سالم", "phone": "PHONE_PLACEHOLDER", "email": "", "hospitalName": "FAC_PLACEHOLDER", "jobTitle": "أخصائية", "password": "HrPass1234", "status": "APPROVED", "forsahPermissions": [], "forsahCommissionPercent": null}'
FAC_JSON="${FAC_JSON/PHONE_PLACEHOLDER/$FAC_PHONE}"; FAC_JSON="${FAC_JSON/FAC_PLACEHOLDER/$FAC_NAME}"
res=$(api admin POST "/api/admin/hr" "$FAC_JSON")
echo "$res" | grep -q "أُنشئ حساب" && check "إنشاء HR بمنشأة مختارة من الجهات الصحية ينجح" 0 || { check "إنشاء HR بمنشأة من الجهات" 1; echo "    RES: $(echo $res | head -c 200)"; }
FAC_HR_ID=$(api admin GET '/api/admin/forsah' | python3 -c "import sys,json;print([a['id'] for a in json.load(sys.stdin)['hrAccounts'] if a['phone']=='$FAC_PHONE'][0])" 2>/dev/null)
# حذف بلا كلمة مرور → مرفوض
res=$(api admin DELETE "/api/admin/hr/$FAC_HR_ID" '{}')
echo "$res" | grep -q "كلمة مرور الإدارة مطلوبة" && check "حذف HR بلا كلمة مرور مرفوض (422)" 0 || { check "حذف HR بلا كلمة مرور مرفوض" 1; echo "    RES: $(echo $res | head -c 200)"; }
# حذف بكلمة مرور خاطئة → مرفوض والحساب باقٍ
res=$(api admin DELETE "/api/admin/hr/$FAC_HR_ID" '{"password": "WrongPass99"}')
echo "$res" | grep -q "غير صحيحة" && check "حذف HR بكلمة مرور خاطئة مرفوض (403)" 0 || { check "حذف HR بكلمة مرور خاطئة مرفوض" 1; echo "    RES: $(echo $res | head -c 200)"; }
STILL=$(api admin GET '/api/admin/forsah' | python3 -c "import sys,json;print(len([a for a in json.load(sys.stdin)['hrAccounts'] if a['phone']=='$FAC_PHONE']))")
[ "$STILL" = "1" ] && check "الحساب باقٍ بعد رفض الحذف" 0 || check "الحساب باقي بعد الرفض ($STILL)" 1
# حذف بكلمة مرور الإدارة الصحيحة → ينجح
res=$(api admin DELETE "/api/admin/hr/$FAC_HR_ID" '{"password": "admin12345"}')
echo "$res" | grep -q "حُذف حساب" && check "الحذف بتأكيد كلمة مرور الإدارة ينجح" 0 || { check "الحذف بكلمة المرور الصحيحة" 1; echo "    RES: $(echo $res | head -c 300)"; }
GONE=$(api admin GET '/api/admin/forsah' | python3 -c "import sys,json;print(len([a for a in json.load(sys.stdin)['hrAccounts'] if a['phone']=='$FAC_PHONE']))")
[ "$GONE" = "0" ] && check "الحساب اختفى من القائمة بعد الحذف" 0 || check "الحساب اختفى بعد الحذف ($GONE)" 1
res=$(api admin GET "/api/admin/forsah")
echo "$res" | grep -q "HR_DELETED" && check "سجل التدقيق يوثق حذف HR" 0 || check "سجل التدقيق يوثق حذف HR" 1
# حذف حساب غير موجود → 404
res=$(api admin DELETE "/api/admin/hr/nonexistent123" '{"password": "admin12345"}')
echo "$res" | grep -q "غير موجود" && check "حذف HR غير موجود مرفوض (404)" 0 || check "حذف HR غير موجود (404)" 1

echo "═══ 11) Regression: الأنظمة القائمة سليمة ═══"
res=$(api nurse GET "/api/posts")
echo "$res" | grep -q '"posts"' && check "/api/posts (تكليفات) يعمل" 0 || check "/api/posts يعمل" 1
res=$(api admin GET "/api/stats")
echo "$res" | grep -q "pendingApplications" && check "/api/stats (إحصاءات) يعمل" 0 || check "/api/stats يعمل" 1
res=$(api admin GET "/api/admin/hospitals")
echo "$res" | grep -q "hospitals" && check "/api/admin/hospitals يعمل" 0 || check "/api/admin/hospitals يعمل" 1
res=$(api nurse GET "/api/me/work-departments")
echo "$res" | grep -q "departments" && check "/api/me/work-departments يعمل" 0 || check "/api/me/work-departments يعمل" 1
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_DIR/nurse.txt" "$BASE/nurse")
[ "$code" = "200" ] && check "لوحة الكادر /nurse تحمل (200)" 0 || check "لوحة الكادر تحمل ($code)" 1
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_DIR/admin.txt" "$BASE/admin")
[ "$code" = "200" ] && check "لوحة الإدارة /admin تحمل (200)" 0 || check "لوحة الإدارة تحمل ($code)" 1

echo ""
echo "══════════════════════════════════"
echo "النتيجة: نجاح $PASS — فشل $FAIL"
echo "══════════════════════════════════"
[ $FAIL -eq 0 ] && echo "🎉 كل الاختبارات ناجحة" || echo "⚠️ توجد اختبارات فاشلة تحتاج مراجعة"
