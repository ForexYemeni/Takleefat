#!/bin/bash
# ============================================================
# تشغيل حتمي كامل لاختبارات «فرصة» — من قاعدة نظيفة
# node local-pg --reset ← db push ← seed ← إقلاع الخادم ← الاختبارات
# ============================================================
set -u
cd "$(dirname "$0")/.."

echo "⟳ 1) إعادة بناء قاعدة الاختبار المحلية..."
pkill -f "local-pg.cjs" 2>/dev/null; sleep 2
(setsid nohup node scripts/local-pg.cjs --reset > local-pg.log 2>&1 &)
sleep 18

export TEST_DB="postgresql://takleefat_test:takleefat_test@localhost:5433/takleefat_forsah"

echo "⟳ 2) رفع المخطط (المحاكاة الفعلية لـMigration Vercel)..."
DATABASE_URL="$TEST_DB" ./node_modules/.bin/prisma db push --skip-generate --accept-data-loss 2>&1 | tail -1

echo "⟳ 3) زرع بيانات الاختبار..."
DATABASE_URL="$TEST_DB" ADMIN_PHONE="773178684" ADMIN_PASSWORD="admin12345" node scripts/seed-forsah-test.cjs | tail -1

echo "⟳ 4) إقلاع خادم التطوير على قاعدة الاختبار..."
pkill -f "next dev" 2>/dev/null; sleep 2
(DATABASE_URL="$TEST_DB" NEXTAUTH_URL="http://localhost:3000" setsid nohup ./node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &)
sleep 15

echo "⟳ 5) تشغيل الاختبارات الشاملة..."
bash scripts/forsah-e2e.sh
