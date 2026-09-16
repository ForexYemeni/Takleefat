#!/bin/bash
# الجولة 55 — إنشاء GitHub Release v2.0.0 ورفع APK الإشعارات الأصلية
set -e
cd /home/z/my-project

TOKEN=$(git remote get-url origin | sed -E 's|https://([^@]+)@github.com.*|\1|')
REPO="ForexYemeni/Takleefat"
APK="download/takleefat-v2.0.1.apk"

echo "=== 1) إنشاء الإصدار v2.0.1 ==="
CREATE_RESP=$(curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases" \
  -d '{
    "tag_name": "v2.0.1",
    "target_commitish": "main",
    "name": "تكليفات v2.0.1 — تنبيهات أسرع (20 ثانية)",
    "body": "## الجولة 56 — تسريع التنبيهات\n\n- دورة الاستعلام اختُصرت من 60 ثانية إلى **20 ثانية** — التنبيهات تصلك خلال ~20 ثانية كحد أقصى بدل دقيقة كاملة.\n- نفس التوقيع → ثبّته مباشرة فوق النسخة السابقة دون حذف.\n- الخطوة القادمة: دمج FCM للفورية الكاملة (1–3 ثوانٍ).",
    "draft": false,
    "prerelease": false
  }')

RELEASE_ID=$(echo "$CREATE_RESP" | grep -oE '"id": [0-9]+' | head -1 | grep -oE '[0-9]+')
UPLOAD_URL=$(echo "$CREATE_RESP" | grep -oE '"upload_url": "[^"]+' | cut -d'"' -f4 | sed 's/{.*//')

if [ -z "$RELEASE_ID" ]; then
  echo "فشل إنشاء الإصدار:"; echo "$CREATE_RESP" | head -20; exit 1
fi
echo "RELEASE_ID=$RELEASE_ID"

echo "=== 2) رفع takleefat.apk ==="
UPLOAD_RESP=$(curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @"$APK" \
  "${UPLOAD_URL}?name=takleefat.apk")
STATE=$(echo "$UPLOAD_RESP" | grep -oE '"state": "[a-z]+"' | cut -d'"' -f4)
SHA=$(echo "$UPLOAD_RESP" | grep -oE '"digest": "[^"]+"' | cut -d'"' -f4)
echo "ASSET_STATE=$STATE SHA=$SHA"

echo "=== 3) تحقق نهائي ==="
sleep 2
curl -sS -o /dev/null -w "gh-latest-apk HTTP:%{http_code} size:%{size_download}\n" \
  "https://github.com/$REPO/releases/latest/download/takleefat.apk"
