#!/bin/bash
# تشغيل E2E كامل في استدعاء واحد: خادم + اختبارات (العملية الموثقة)
set -u
cd /home/z/my-project

# 1) قتل أي خوادم زومبي
pkill -9 -f "server.js" 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 1

# 2) تحويل sqlite للنشر المحلي
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
# إزالة mode:'insensitive' (غير مدعوم في sqlite)
grep -rl "mode: 'insensitive'" app/ | xargs -r sed -i "s/, mode: 'insensitive'//g"
grep -rl 'mode: "insensitive"' app/ | xargs -r sed -i 's/, mode: "insensitive"//g'

# قاعدة نظيفة + push + generate + seed (الـ generate إلزامي بعد تغيير provider)
rm -f db/custom.db
npx prisma db push >/dev/null 2>&1
node prisma/seed.js >/dev/null 2>&1 || { echo "SEED FAILED"; git checkout -- prisma/schema.prisma; exit 1; }

# 4) بناء وتشغيل الخادم على 3111
npx next build >/tmp/e2e-build.log 2>&1 || { echo "BUILD FAILED"; tail -30 /tmp/e2e-build.log; git checkout -- prisma/schema.prisma app/; npx prisma generate >/dev/null 2>&1; exit 1; }
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null
cd /home/z/my-project
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

# 8) استعادة postgres + generate
git checkout -- prisma/schema.prisma app/ 2>/dev/null
# إعادة وضع التعديلات الجلسة الحالية: schema.prisma لم يتغير في هذه الجلسة، لكن تحقق
npx prisma generate >/dev/null 2>&1
echo "RESTORED postgres schema + prisma generate"
exit $E2E_EXIT
