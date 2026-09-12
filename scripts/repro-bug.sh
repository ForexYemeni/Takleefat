#!/bin/bash
# ============================================================
# إعادة إنتاج: طلب انضمام الكادر التمريضي لجهة → خلل في حساب المستلم
# يُشغّل الخادم المبني مسبقاً على منفذ 3112 مع نسخة احتياطية من القاعدة
# ============================================================
set -u
cd /home/z/my-project

PORT=3112
BASE="http://localhost:$PORT"
DIR="/home/z/my-project/scripts/repro-tmp"
mkdir -p "$DIR"

# نسخة احتياطية من القاعدة لاستعادتها بعد الاختبار
cp db/custom.db "$DIR/db-backup.db"

# قتل أي خوادم سابقة
pkill -9 -f "server.js" 2>/dev/null; sleep 1

PORT=$PORT HOSTNAME=127.0.0.1 NODE_ENV=production \
  NEXTAUTH_SECRET=repro-local-secret-takleefat AUTH_SECRET=repro-local-secret-takleefat \
  bun .next/standalone/server.js >"$DIR/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/health 2>/dev/null)
  [ "$HEALTH" = "200" ] && break
  sleep 1
done
echo "Server health: $HEALTH"
[ "$HEALTH" != "200" ] && { echo "SERVER FAILED"; tail -20 "$DIR/server.log"; exit 1; }

check() {
  if [ "$2" = "$3" ]; then echo "✅ $1 = $2"
  else echo "❌ $1 — متوقع=$2 فعلي=$3"; fi
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

echo "=========== إنشاء السيناريو =========="
login "$DIR/admin.jar" "773178684" "Admin@1234"
ADMIN_OK=$(code -b "$DIR/admin.jar" $BASE/api/stats)
check "دخول الإدارة" "200" "$ADMIN_OK"

# مستلم إداري بجهة جديدة (أرقام غير مستخدمة في سيناريو E2E)
STAMP=$(date +%s)
R_PHONE="7${STAMP: -8}"
N_PHONE="7${STAMP: -8}"
# أرقام يمنية تبدأ بـ 7 — نولّد رقمين مختلفين
N2=$(python3 -c "print('71' + '$STAMP'[-7:])")
R2=$(python3 -c "print('73' + '$STAMP'[-7:])")

REG_R=$(curl -s -o "$DIR/reg_r.json" -w "%{http_code}" -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d "{\"role\":\"RECEIVER\",\"name\":\"مستلم الإعادة\",\"phone\":\"$R2\",\"password\":\"Receiver@1234\",\"hospitalName\":\"جهة الإعادة $STAMP\"}")
check "تسجيل مستلم بجهة" "201" "$REG_R"

REG_N=$(curl -s -o "$DIR/reg_n.json" -w "%{http_code}" -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d "{\"role\":\"NURSE\",\"name\":\"كادر الإعادة\",\"phone\":\"$N2\",\"password\":\"Nurse@1234\",\"specialty\":\"تمريض عام\",\"qualification\":\"بكالوريوس أربع سنوات\",\"yearsOfExperience\":3,\"gender\":\"MALE\"}")
check "تسجيل كادر تمريضي" "201" "$REG_N"

RCV_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=RECEIVER" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[u for u in d['users'] if u['phone']=='$R2']
print(m[0]['id'] if m else '')")
NURSE_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/users?role=NURSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[u for u in d['users'] if u['phone']=='$N2']
print(m[0]['id'] if m else '')")
echo "RCV_ID=$RCV_ID NURSE_ID=$NURSE_ID"

# اعتماد الجهة (ACTIVE) + اعتماد المستلم + اعتماد الكادر
HOSP_ID=$(curl -s -b "$DIR/admin.jar" "$BASE/api/admin/hospitals" | python3 -c "
import json,sys
d=json.load(sys.stdin)
hs=d.get('hospitals', d if isinstance(d,list) else [])
m=[h for h in hs if 'الإعادة $STAMP' in h.get('name','')]
print(m[0]['id'] if m else '')")
echo "HOSP_ID=$HOSP_ID"
AP_H=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/hospitals/$HOSP_ID -H "Content-Type: application/json" -d '{"status":"ACTIVE"}' -o /dev/null -w "%{http_code}")
AP_R=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$RCV_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}' -o /dev/null -w "%{http_code}")
AP_N=$(curl -s -b "$DIR/admin.jar" -X PATCH $BASE/api/admin/users/$NURSE_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}' -o /dev/null -w "%{http_code}")
echo "اعتماد الجهة=$AP_H المستلم=$AP_R الكادر=$AP_N"

echo "=========== الكادر يطلب الانضمام لجهة المستلم =========="
login "$DIR/nurse.jar" "$N2" "Nurse@1234"
JOIN=$(curl -s -o "$DIR/join.json" -w "%{http_code}" -X POST $BASE/api/affiliations -b "$DIR/nurse.jar" \
  -H "Content-Type: application/json" -d "{\"hospitalId\":\"$HOSP_ID\",\"note\":\"أطلب الانضمام لجهتكم\",\"requestedStatus\":\"WORKING\"}")
check "طلب انضمام الكادر للجهة → 201" "201" "$JOIN"
cat "$DIR/join.json" | head -c 400; echo

echo "=========== فحص كل واجهات المستلم بعد الطلب =========="
login "$DIR/receiver.jar" "$R2" "Receiver@1234"
for EP in "/api/receiver/staff" "/api/org/community" "/api/affiliations" "/api/stats" "/api/me/assignments" "/api/posts" "/api/me/profile" "/api/receiver/earnings" "/api/notifications" "/api/receiver/favorites"; do
  C=$(code -b "$DIR/receiver.jar" "$BASE$EP")
  if [ "$C" = "200" ]; then echo "✅ $EP = $C"; else echo "❌ $EP = $C"; fi
done

echo "=========== المستلم يعرض تفاصيل الطلب ويعتمده للجهة =========="
AFF_ID=$(curl -s -b "$DIR/receiver.jar" "$BASE/api/receiver/staff" | jget "['nurses'][0]['affiliationId']")
echo "AFF_ID=$AFF_ID"
END_C=$(curl -s -b "$DIR/receiver.jar" -X PATCH "$BASE/api/affiliations/$AFF_ID" -H "Content-Type: application/json" -d '{"status":"ENDORSED"}' -o "$DIR/endorse.json" -w "%{http_code}")
echo "اعتماد الطلب PENDING للجهة → $END_C"
head -c 300 "$DIR/endorse.json"; echo

echo "=========== سجل الخادم (آخر 40 سطراً) =========="
tail -40 "$DIR/server.log" | rg -v "^\s*$" | tail -25

# وضع KEEP: يبقى الخادم يعمل والبيانات موجودة لفحص المتصفح
if [ "${KEEP:-0}" = "1" ]; then
  echo "KEEP=1 — الخادم يعمل على $BASE (المستلم $R2 / Receiver@1234 | الكادر $N2 / Nurse@1234 | HOSP=$HOSP_ID)"
  echo "$R2 Receiver@1234 $N2 Nurse@1234 $HOSP_ID" > "$DIR/creds.txt"
  exit 0
fi

# إيقاف الخادم واستعادة القاعدة
kill -9 $SERVER_PID 2>/dev/null; sleep 1
pkill -9 -f "server.js" 2>/dev/null
cp "$DIR/db-backup.db" db/custom.db
echo "DONE — DB restored"
