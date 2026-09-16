#!/bin/bash
# الجولة 55 — إنشاء GitHub Release v2.0.0 ورفع APK الإشعارات الأصلية
set -e
cd /home/z/my-project

TOKEN=$(git remote get-url origin | sed -E 's|https://([^@]+)@github.com.*|\1|')
REPO="ForexYemeni/Takleefat"
APK="download/takleefat-v2.0.0.apk"

echo "=== 1) إنشاء الإصدار v2.0.0 ==="
CREATE_RESP=$(curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases" \
  -d '{
    "tag_name": "v2.0.0",
    "target_commitish": "main",
    "name": "تكليفات v2.0.0 — إشعارات أصلية حقيقية",
    "body": "## الجولة 55 — تطبيق أندرويد حقيقي بإشعارات أصلية\n\n### الجديد الكلي\n- **إشعارات أصلية 100% من التطبيق نفسه**: خدمة تنبيهات نظامية تعمل حتى لو كان التطبيق مغلقاً تماماً — بلا كروم، بلا إشعارات موقع، وبلا أي تحذير «إشعار قد يكون غير مرغوب».\n- **استمرار بعد إعادة تشغيل الهاتف**: التنبيهات تعود تلقائياً بعد الإقلاع.\n- **منع التكبير نهائياً**: مقياس ثابت 100% في كل الصفحات — بلا قرص للتقريب وبلا تضخيم خط النظام.\n- **ربط تلقائي بالحساب**: بعد تسجيل الدخول يرتبط الجهاز تلقائياً وتبدأ التنبيهات فوراً.\n- **نقرة الإشعار تفتح الصفحة مباشرة** (التكليف/الإشعار المعني) داخل التطبيق.\n- **لافتة ذكية** لاستثناء التطبيق من قيود البطارية على الأجهزة القاسية (شاومي/هواوي/أوبو).\n\n### التثبيت\n- نفس مفتاح التوقيع → ثبّته مباشرة فوق النسخة السابقة دون حذف (إن ظهر تعارض احذف القديم أولاً).\n- عند أول فتح: وافق على إذن الإشعارات ثم سجّل دخولك.\n\n### ملاحظات\n- الحجم ~1MB — صفر اعتماديات خارجية.\n- أندرويد 8.0+ (API 26+).\n- الإصدار السابق v1.0.1 كان يفوّض الإشعارات لكروم (تحذير «غير مرغوب») — هذه النسخة تلغي ذلك جذرياً.",
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
