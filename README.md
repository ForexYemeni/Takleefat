<div dir="rtl">

# تكليفات | Takleefat

منصة احترافية لإدارة التكليفات الطبية والتمريضية — نظام متكامل لإنشاء التكليفات وإسنادها للكوادر التمريضية المؤهلة، واعتماد الحسابات والمستندات، وتوثيق الاستلام إلكترونياً.

## وصف المشروع

منصة **تكليفات (Takleefat)** تربط بين ثلاثة أدوار رئيسية في المنشآت الصحية:

| الدور | الصلاحيات |
|-------|-----------|
| **مدير النظام (Admin)** | اعتماد/رفض حسابات الكوادر، مراجعة المستندات (صورة المزاولة، البطاقة الشخصية، شهادات الخبرة)، إنشاء التكليفات وإسنادها، إضافة المستلمين الإداريين، متابعة الإحصائيات |
| **الكادر التمريضي (Nurse)** | إنشاء حساب (يُعتمد إدارياً)، رفع المستندات الرسمية، استعراض التكليفات المسندة إليه، متابعة حالة الحساب |
| **المستلم الإداري (Receiver)** | استعراض التكليفات الواردة وتأكيد استلامها إلكترونياً |

### أهم المميزات

- **يعمل بموافقة الإدارة**: لا يُفعَّل أي حساب قبل مراجعته واعتماده من مدير النظام.
- **إشعارات داخلية فورية** لجميع الأطراف عند كل حدث (اعتماد، تكليف جديد، استلام، مراجعة مستند).
- **تخزين سحابي آمن** للملفات متوافق مع S3 (Cloudflare R2 / Supabase / AWS S3) — يُحفظ رابط الملف فقط في قاعدة البيانات.
- **صلاحيات محكمة**: حماية كاملة للمسارات وواجهات البرمجة (API) حسب الدور.
- **واجهة عربية كاملة (RTL)** بتصميم Mobile-First متوافق مع الجوال.
- **مظهر ليلي/نهاري** تلقائي.

## التقنيات المستخدمة

| التقنية | الاستخدام |
|---------|-----------|
| [Next.js 16](https://nextjs.org) (App Router) | إطار العمل الأساسي — Full Stack |
| [TypeScript 5](https://typescriptlang.org) | لغة البرمجة (Strict Mode) |
| [PostgreSQL](https://postgresql.org) | قاعدة البيانات |
| [Prisma ORM](https://prisma.io) | التعامل مع قاعدة البيانات |
| [NextAuth.js v4](https://next-auth.js.org) | المصادقة والجلسات (Credentials + JWT) |
| [Tailwind CSS 4](https://tailwindcss.com) | التنسيقات |
| [shadcn/ui](https://ui.shadcn.com) | مكتبة مكونات الواجهة |
| [TanStack Query](https://tanstack.com/query) | إدارة حالة البيانات |
| [Zod](https://zod.dev) | التحقق من صحة البيانات |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | تشفير كلمات المرور |
| [aws4fetch](https://github.com/mhart/aws4fetch) | رفع الملفات للتخزين السحابي المتوافق مع S3 |
| [Vercel](https://vercel.com) | النشر والاستضافة |

## بنية المشروع

```
takleefat/
├── app/
│   ├── (auth)/               # صفحات المصادقة (دخول/تسجيل)
│   ├── admin/                # لوحة تحكم مدير النظام
│   ├── nurse/                # لوحة الكادر التمريضي
│   ├── receiver/             # لوحة المستلم الإداري
│   ├── api/                  # واجهات البرمجة (API Routes)
│   ├── layout.tsx            # التخطيط الجذري
│   └── page.tsx              # الصفحة الرئيسية
├── components/
│   ├── ui/                   # مكونات shadcn/ui
│   ├── shared/               # مكونات مشتركة (الشعار، الإشعارات، الهيكل)
│   ├── admin/                # مكونات لوحة المدير
│   ├── nurse/                # مكونات لوحة الكادر
│   └── receiver/             # مكونات لوحة المستلم
├── lib/
│   ├── auth.ts               # إعدادات NextAuth + ضمان حساب المدير
│   ├── db.ts                 # عميل Prisma
│   ├── storage.ts            # طبقة التخزين السحابي (S3/محلي)
│   ├── api-helpers.ts        # حماية API وإدارة الأخطاء
│   ├── validations/          # مخططات Zod للتحقق
│   └── utils.ts              # أدوات مساعدة
├── prisma/
│   └── schema.prisma         # مخطط قاعدة البيانات
├── types/                    # تعريفات TypeScript
├── hooks/                    # React Hooks مخصصة
├── public/                   # الملفات العامة (الشعار...)
├── .env.example              # قالب متغيرات البيئة
├── .gitignore
├── middleware.ts             # حماية المسارات حسب الدور
└── next.config.ts
```

## طريقة التشغيل محلياً

### المتطلبات المسبقة

- [Node.js 18+](https://nodejs.org) أو [Bun](https://bun.sh)
- قاعدة بيانات PostgreSQL (محلية أو سحابية مثل [Neon](https://neon.tech) المجانية)

### خطوات التشغيل

```bash
# 1. استنساخ المستودع
git clone https://github.com/<your-username>/takleefat.git
cd takleefat

# 2. تثبيت التبعيات
npm install
# أو: bun install

# 3. إنشاء ملف البيئة من القالب (انظر القسم التالي)
cp .env.example .env

# 4. مزامنة مخطط قاعدة البيانات
npx prisma db push

# 5. تشغيل خادم التطوير
npm run dev
# أو: bun run dev
```

ثم افتح [http://localhost:3000](http://localhost:3000).

> عند أول تشغيل يُنشأ حساب **مدير النظام** تلقائياً من `ADMIN_PHONE` و`ADMIN_PASSWORD` المحددين في ملف `.env`.

## طريقة إعداد Environment Variables

1. انسخ الملف `.env.example` إلى ملف جديد باسم `.env`:
   ```bash
   cp .env.example .env
   ```
2. املأ القيم الحقيقية:

| المتغير | الوصف | إلزامي |
|---------|-------|--------|
| `DATABASE_URL` | رابط اتصال PostgreSQL | ✅ |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | مفتاح تشفير الجلسات — أنشئه بـ `openssl rand -base64 32` | ✅ |
| `NEXTAUTH_URL` | رابط الموقع في الإنتاج | ✅ (إنتاج) |
| `ADMIN_PHONE` | رقم هاتف مدير النظام الافتراضي | ✅ |
| `ADMIN_PASSWORD` | كلمة مرور المدير الافتراضية | ✅ |
| `STORAGE_ENDPOINT` | رابط خدمة التخزين المتوافقة مع S3 | ✅ (إنتاج) |
| `STORAGE_REGION` | المنطقة (`auto` لـ Cloudflare R2) | ➖ |
| `STORAGE_BUCKET` | اسم الحاوية (Bucket) | ✅ (إنتاج) |
| `STORAGE_ACCESS_KEY` | مفتاح الوصول | ✅ (إنتاج) |
| `STORAGE_SECRET_KEY` | المفتاح السري | ✅ (إنتاج) |
| `STORAGE_PUBLIC_URL` | الرابط العام لعرض الملفات | ➖ |

> ⚠️ **تنبيه أمني**: ملف `.env` مدرج في `.gitignore` ولا يجب رفعه إلى GitHub إطلاقاً. في الإنتاج تُوضع القيم في **Vercel Environment Variables**.

## طريقة إعداد قاعدة البيانات

المنصة مصممة لـ **PostgreSQL** (لا تستخدم SQLite في الإنتاج). الخيارات السحابية المجانية:

| الخدمة | الرابط |
|--------|--------|
| **Neon** (موصى بها) | [neon.tech](https://neon.tech) |
| **Supabase** | [supabase.com](https://supabase.com) |
| **Vercel Postgres** | [vercel.com/storage/postgres](https://vercel.com/storage/postgres) |

1. أنشئ قاعدة بيانات جديدة وانسخ رابط الاتصال (Connection String).
2. ضعه في `DATABASE_URL` داخل `.env` (محلياً) أو في متغيرات Vercel (إنتاج).

## طريقة تشغيل Prisma Migration

```bash
# مزامنة المخطط مع قاعدة البيانات (تطوير سريع)
npx prisma db push

# إنشاء Migration رسمية (يُنصح بها للإنتاج)
npx prisma migrate dev --name init

# تطبيق Migrations على قاعدة بيانات الإنتاج
npx prisma migrate deploy

# عرض البيانات بواجهة رسومية
npx prisma studio
```

> عند النشر على Vercel يعمل أمر `prisma generate` تلقائياً بعد التثبيت (عبر `postinstall` في `package.json`). أما تطبيق المخطط فيُنفَّذ يدوياً مرة واحدة بـ `npx prisma migrate deploy`.


## قاعدة البيانات الوهمية والحسابات التجريبية

تعبئة قاعدة بيانات جاهزة للتجربة بحسابات وتكليفات ومستندات وإشعارات وهمية:

```bash
# 1) إنشاء الجداول (مرة واحدة)
npx prisma db push

# 2) تعبئة البيانات الوهمية
npx prisma db seed
```

> للتعبئة على قاعدة بيانات الإنتاج مباشرة: ضع رابط الإنتاج في `DATABASE_URL` ثم نفّذ الأمرين أعلاه محلياً.

### الحسابات التجريبية

| الدور | رقم الهاتف | كلمة المرور | الحالة |
|------|-----------|-------------|--------|
| مدير النظام | `0500000000` | `Admin@1234` | معتمد |
| كادر تمريضي | `0501111111` | `Nurse@1234` | معتمد |
| كادر تمريضي | `0501333333` | `Nurse@1234` | معلّق (جرّب اعتماده من لوحة المدير) |
| مستلم إداري | `0502222222` | `Receiver@1234` | معتمد |

> رقم وكلمة مرور المدير يُقرآن من `ADMIN_PHONE` و`ADMIN_PASSWORD` إن كانا مضبوطين.

### ما تحتويه البيانات الوهمية

- 4 حسابات بأدوار مختلفة (معتمدة ومعلّقة) لتجربة مسارات الاعتماد
- 3 تكليفات بحالات مختلفة: نشط، مُستلَم، مكتمل — مع سجل أحداث كامل لكل تكليف
- مستندات للكادر: معتمد وآخر بانتظار المراجعة
- إشعارات لجميع الأطراف

## نقطة التشخيص `/api/health`

إن لم يعمل تسجيل الدخول بعد النشر على Vercel، افتح:

```
https://<موقعك>.vercel.app/api/health
```

تعرض هذه النقطة (بدون كشف أي قيم سرية):

1. حالة الاتصال بقاعدة البيانات (`database: ok / error`)
2. أي متغيرات بيئة ناقصة (`MISSING`)
3. تلميحات حل المشاكل الشائعة

> الشروط الثلاثة لتسجيل الدخول: (1) مفتاح `AUTH_SECRET` مضبوط (2) قاعدة بيانات متصلة وجداول منشأة بـ `prisma db push` (3) حسابات موجودة بـ `prisma db seed`.


## طريقة رفع المشروع إلى GitHub

```bash
# 1. تهيئة Git (تتم تلقائياً عند الاستنساخ — أو هكذا لمشروع جديد)
git init

# 2. إضافة الملفات (يستثني .gitignore ملف .env وملفات البيانات تلقائياً)
git add .

# 3. أول Commit
git commit -m "feat: Takleefat platform — initial release"

# 4. الربط مع مستودع GitHub جديد
git remote add origin https://github.com/<your-username>/takleefat.git

# 5. الرفع
git push -u origin main
```

> تحقق دائماً قبل الرفع: `git status` — يجب ألا يظهر ملف `.env` في قائمة الملفات المتتبعة.

## طريقة ربط المشروع بـ Vercel

1. ادخل إلى [vercel.com](https://vercel.com) وسجّل الدخول بحساب GitHub.
2. اضغط **Add New → Project** ثم اختر مستودع **takleefat**.
3. سيكتشف Vercel تلقائياً أنه مشروع Next.js (لا حاجة لتعديل الإعدادات).
4. في قسم **Environment Variables** أضف جميع المتغيرات من جدول القسم أعلاه.
5. اضغط **Deploy** — سيتم البناء والنشر تلقائياً.
6. بعد أول نشر: حدّث `NEXTAUTH_URL` ليطابق رابط موقعك النهائي ثم أعد النشر (Deploy).

### آلية النشر التلقائي

```
Local Development → Git Commit → GitHub → Vercel Integration → Automatic Deployment → Production
```

عند رفع أي تحديث جديد:

```bash
git add .
git commit -m "وصف التحديث"
git push origin main
```

يقوم Vercel تلقائياً بـ: اكتشاف التحديث ← تشغيل Build ← اختبار البناء ← نشر النسخة الجديدة.

### إعداد التخزين السحابي للملفات

لا تصلح بيئة Vercel Serverless لتخزين الملفات دائمياً، لذا:

1. أنشئ Bucket في [Cloudflare R2](https://developers.cloudflare.com/r2/) أو [Supabase Storage](https://supabase.com/storage).
2. فعّل الوصول العام للقراءة (Public Access) للحاوية.
3. أنشئ مفاتيح API وضعها في `STORAGE_*` داخل متغيرات البيئة.
4. ضع الرابط العام في `STORAGE_PUBLIC_URL` لعرض الملفات المرفوعة.

## قائمة فحص الإنتاج

- [x] المشروع يعمل محلياً
- [x] لا توجد أخطاء TypeScript
- [x] لا توجد أخطاء ESLint
- [x] قاعدة البيانات PostgreSQL تعمل
- [x] Authentication يعمل (NextAuth + JWT)
- [x] لوحة Admin تعمل (اعتماد الحسابات، المستندات، التكليفات، المستلمون)
- [x] لوحة Nurse تعمل (رفع المستندات، التكليفات، الملف الشخصي)
- [x] لوحة Receiver تعمل (تأكيد الاستلام)
- [x] رفع الملفات يعمل عبر تخزين سحابي متوافق مع S3
- [x] الصلاحيات تعمل (Middleware + حماية API)
- [x] الموقع يعمل بموافقة المستخدم (اعتماد الحسابات إدارياً)
- [x] جميع API Routes مؤمنة
- [x] المشروع قابل للرفع إلى GitHub (`.env` مستثنى)
- [x] جميع Environment Variables موثقة في `.env.example`

## الأمان

- تشفير كلمات المرور بـ bcrypt (12 rounds).
- جلسات JWT موقّعة مع تحديث حالة المستخدم من قاعدة البيانات عند كل طلب.
- حماية المسارات عبر Middleware حسب الدور.
- التحقق من الملكية والصلاحيات في **كل** API Route على حدة.
- منع هجمات Path Traversal عند تقديم الملفات.
- التحقق من نوع وحجم الملفات المرفوعة (صور/PDF حتى 5MB).
- لا توجد أي أسرار في الكود — كلها عبر Environment Variables.

---

© 2026 تكليفات | Takleefat — منصة احترافية لإدارة التكليفات الطبية والتمريضية.

</div>
