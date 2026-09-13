#!/bin/bash
# تشغيل E2E كامل في استدعاء واحد: خادم + اختبارات (العملية الموثقة)
set -u
cd /home/z/my-project

# 1) قتل أي خوادم زومبي
pkill -9 -f "server.js" 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 1

# 1.5) لقطة حالة الإنتاج (postgres) قبل أي تحويل — الاستعادة تعتمد اللقطة لا git
# (الدرس: التُقط commit وهو داخل وضع sqlite فصار git checkout يستعيد sqlite إلى الأبد
#  وتعطّل النشر على Vercel — لا يجوز أن يصل وضع الاختبار المحلي إلى GitHub)
SNAP_DIR=$(mktemp -d /tmp/takleefat-prod-snap.XXXXXX)
cp prisma/schema.prisma "$SNAP_DIR/schema.prisma"
cp -r app "$SNAP_DIR/app"
if [ ! -f "$SNAP_DIR/schema.prisma" ] || [ ! -d "$SNAP_DIR/app" ]; then
  echo "SNAPSHOT FAILED — إلغاء قبل أي تعديل على مساحة العمل"; rm -rf "$SNAP_DIR"; exit 1
fi
RESTORED=0
restore_prod() {
  [ "$RESTORED" = "1" ] && return 0
  RESTORED=1
  cp "$SNAP_DIR/schema.prisma" prisma/schema.prisma
  rm -rf app && cp -r "$SNAP_DIR/app" app
  npx prisma generate >/dev/null 2>&1
  rm -rf "$SNAP_DIR"
  echo "RESTORED postgres snapshot + prisma generate"
}
trap restore_prod EXIT
trap 'restore_prod; exit 130' INT TERM

# 2) تحويل sqlite للنشر المحلي
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
# إزالة mode:'insensitive' (غير مدعوم في sqlite)
grep -rl "mode: 'insensitive'" app/ | xargs -r sed -i "s/, mode: 'insensitive'//g"
grep -rl 'mode: "insensitive"' app/ | xargs -r sed -i 's/, mode: "insensitive"//g'

# قاعدة نظيفة + push + generate + seed (الـ generate إلزامي بعد تغيير provider)
rm -f db/custom.db
rm -rf .next

# حماية: الملفات الحرجة لا يجوز أن تكون مفقودة من مساحة العمل (درس تسرب مسار الرفع)
for CRITICAL in app/api/upload/route.ts app/api/auth/register/route.ts app/api/affiliations/route.ts; do
  [ -f "$CRITICAL" ] || { echo "CRITICAL: $CRITICAL مفقود! شغّل: git checkout -- app/"; exit 1; }
done

npx prisma db push >/dev/null 2>&1
node prisma/seed.js >/dev/null 2>&1 || { echo "SEED FAILED"; exit 1; }

# 4) بناء وتشغيل الخادم على 3111
npx next build >/tmp/e2e-build.log 2>&1 || { echo "BUILD FAILED"; tail -30 /tmp/e2e-build.log; exit 1; }
# حماية: بناء turbopack قد يُخفي مسارات — تحقق أن مسار الرفع في قائمة البناء
grep -q "api/upload" /tmp/e2e-build.log || { echo "BUILD MISSING /api/upload!"; tail -40 /tmp/e2e-build.log; exit 1; }
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null
cd /home/z/my-project
# مفاتيح VAPID للإشعارات الفورية — تُولَّد عشوائياً كل تشغيل (لا أسرار في المستودع)
VAPID_KEYS=$(node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+'|'+k.privateKey)")
export NEXT_PUBLIC_VAPID_PUBLIC_KEY="${VAPID_KEYS%%|*}"
export VAPID_PRIVATE_KEY="${VAPID_KEYS##*|}"
export VAPID_SUBJECT="mailto:e2e@taklefat.local"
# bun يحمّل .env تلقائياً (كما في npm start) — node لا يفعل فتفشل المصادقة 500
# + سر المصادقة مطلوب في وضع الإنتاج (كما في Vercel عبر متغيرات البيئة)
PORT=3111 HOSTNAME=127.0.0.1 NODE_ENV=production NEXTAUTH_SECRET=e2e-local-secret-takleefat AUTH_SECRET=e2e-local-secret-takleefat bun .next/standalone/server.js >/tmp/e2e-server.log 2>&1 &
SERVER_PID=$!

# 5) انتظار جهوزية الخادم
for i in $(seq 1 45); do
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/api/health 2>/dev/null)
  [ "$HEALTH" = "200" ] && break
  sleep 2
done
echo "Server health: $HEALTH (pid $SERVER_PID)"
if [ "$HEALTH" != "200" ]; then echo "SERVER FAILED"; tail -20 /tmp/e2e-server.log; kill -9 $SERVER_PID 2>/dev/null; exit 1; fi

# 6) الاختبارات
bash scripts/e2e-flow-test.sh
E2E_EXIT=$?

# 7) إيقاف الخادم
kill -9 $SERVER_PID 2>/dev/null
sleep 1
pkill -9 -f "server.js" 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null

# 8) استعادة postgres + generate — عبر trap EXIT (لقطة ما قبل التحويل)
exit $E2E_EXIT
