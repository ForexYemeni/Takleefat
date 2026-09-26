#!/bin/bash
# الجولة 78 — توحيد كل أرقام المنصة على ar-YE-u-nu-latn (نص عربي + أرقام لاتينية 0-9)
# السبب: المستخدم أبلغ «جميع الحقول تظهر بالأرقام العربية» — المكوّنات تستخدم 'ar' و'ar-YE' و'ar-EG'
# التي تُخرج أرقاماً هندية-عربية (٠-٩) بينما معيار المنصة formatCurrency يستخدم ar-YE-u-nu-latn.
# التغيير عرضي بحت (نظام الأرقام فقط) — أسماء الشهور والنصوص تبقى عربية.
set -e
cd /home/z/my-project

FILES=(
  "lib/utils.ts"
  "lib/settings.ts"
  "lib/cv-print.ts"
  "lib/shift-alerts.ts"
  "lib/email/send.ts"
  "app/api/posts/[id]/invite/route.ts"
  "app/nurse/invitations/page.tsx"
  "app/nurse/assignments/page.tsx"
  "app/nurse/card/page.tsx"
  "app/doctor/invitations/page.tsx"
  "app/doctor/assignments/page.tsx"
  "app/doctor/card/page.tsx"
  "app/admin/settings/page.tsx"
  "app/api/admin/email/test/route.ts"
  "app/api/forsah/payment-confirmations/route.ts"
  "app/opportunities/page.tsx"
  "app/api/me/opportunity-payments/route.ts"
  "app/api/opportunities/[id]/selections/route.ts"
  "app/api/opportunities/[id]/transaction/route.ts"
  "components/shared/entity-cadre-community.tsx"
  "components/shared/assignment-experience.tsx"
  "components/shared/promo-banner.tsx"
  "components/admin/forsah-admin.tsx"
  "components/forsah/opportunities-browser.tsx"
  "components/forsah/hr-financials.tsx"
  "components/forsah/hr-opportunity-detail.tsx"
  "components/forsah/opportunity-visuals.tsx"
  "components/forsah/payment-gate.tsx"
)

for f in "${FILES[@]}"; do
  sed -i \
    -e "s/toLocaleString('ar-YE')/toLocaleString('ar-YE-u-nu-latn')/g" \
    -e "s/toLocaleString('ar-EG')/toLocaleString('ar-YE-u-nu-latn')/g" \
    -e "s/toLocaleString('ar')/toLocaleString('ar-YE-u-nu-latn')/g" \
    -e "s/toLocaleString('ar',/toLocaleString('ar-YE-u-nu-latn',/g" \
    -e "s/toLocaleDateString('ar')/toLocaleDateString('ar-YE-u-nu-latn')/g" \
    -e "s/toLocaleDateString('ar',/toLocaleDateString('ar-YE-u-nu-latn',/g" \
    -e "s/Intl\.DateTimeFormat('ar',/Intl.DateTimeFormat('ar-YE-u-nu-latn',/g" \
    "$f"
  echo "OK: $f"
done

echo "--- التحقق: لا يبقى أي locale عربي بلا nu-latn (عدا الاستثناءات المعتمدة) ---"
rg -n "\('ar'\)|\('ar,|\('ar-EG'\)|\('ar-YE'\)|DateTimeFormat\('ar'," app components lib || echo "نظيف ✓"
