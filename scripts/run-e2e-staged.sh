#!/bin/bash
# تشغيل E2E مرحلي — يستخدم بناء الإنتاج الجاهز في .next/standalone (بلا إعادة بناء)
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

# 2) تحويل sqlite للنشر المحلي (كما في run-e2e.sh الموثق)
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
grep -rl "mode: 'insensitive'" app/ | xargs -r sed -i "s/, mode: 'insensitive'//g"
grep -rl 'mode: "insensitive"' app/ | xargs -r sed -i 's/, mode: "insensitive"//g'

# 3) قاعدة نظيفة + push + generate + seed
rm -f db/custom.db
npx prisma db push >/dev/null 2>&1
npx prisma generate >/dev/null 2>&1
node prisma/seed.js >/dev/null 2>&1 || { echo "SEED FAILED"; exit 1; }

# حارس: عميل Prisma المولّد يجب أن يكون sqlite — وإلا فالبناء غير متوافق مع قاعدة الاختبار
if ! grep -q 'provider = "sqlite"' node_modules/.prisma/client/schema.prisma 2>/dev/null; then
  echo "GUARD FAILED: prisma client ليس sqlite — شغّل sed sqlite + db push + generate + next build أولاً"
  exit 1
fi

# 4) تشغيل الخادم على 3111 من البناء الجاهز — مع نسخ الأصول الثابتة كما في run-e2e.sh الموثق
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null
VAPID_KEYS=$(node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+'|'+k.privateKey)")
export NEXT_PUBLIC_VAPID_PUBLIC_KEY="${VAPID_KEYS%%|*}"
export VAPID_PRIVATE_KEY="${VAPID_KEYS##*|}"
export VAPID_SUBJECT="mailto:e2e@taklefat.local"
PORT=3111 HOSTNAME=127.0.0.1 NODE_ENV=production NEXTAUTH_SECRET=e2e-local-secret-takleefat AUTH_SECRET=e2e-local-secret-takleefat bun .next/standalone/server.js >/tmp/e2e-server.log 2>&1 &
SERVER_PID=$!

# 5) انتظار جهوزية الخادم
HEALTH=000
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
