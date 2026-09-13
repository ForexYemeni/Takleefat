#!/bin/bash
# تشغيل E2E مرحلي — يستخدم بناء الإنتاج الجاهز في .next/standalone (بلا إعادة بناء)
set -u
cd /home/z/my-project

# 1) قتل أي خوادم زومبي
pkill -9 -f "server.js" 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null; sleep 1

# 2) تحويل sqlite للنشر المحلي (كما في run-e2e.sh الموثق)
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
grep -rl "mode: 'insensitive'" app/ | xargs -r sed -i "s/, mode: 'insensitive'//g"
grep -rl 'mode: "insensitive"' app/ | xargs -r sed -i 's/, mode: "insensitive"//g'

# 3) قاعدة نظيفة + push + generate + seed
rm -f db/custom.db
npx prisma db push >/dev/null 2>&1
npx prisma generate >/dev/null 2>&1
node prisma/seed.js >/dev/null 2>&1 || { echo "SEED FAILED"; git checkout -- prisma/schema.prisma app/; exit 1; }

# 4) تشغيل الخادم على 3111 من البناء الجاهز
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
if [ "$HEALTH" != "200" ]; then echo "SERVER FAILED"; tail -20 /tmp/e2e-server.log; kill -9 $SERVER_PID 2>/dev/null; git checkout -- prisma/schema.prisma app/ 2>/dev/null; exit 1; fi

# 6) الاختبارات
bash scripts/e2e-flow-test.sh
E2E_EXIT=$?

# 7) إيقاف الخادم
kill -9 $SERVER_PID 2>/dev/null
sleep 1
pkill -9 -f "server.js" 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null

# 8) استعادة postgres + generate
git checkout -- prisma/schema.prisma app/ 2>/dev/null
npx prisma generate >/dev/null 2>&1
echo "RESTORED postgres schema + prisma generate"
exit $E2E_EXIT
