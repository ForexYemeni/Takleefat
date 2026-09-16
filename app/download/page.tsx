import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowLeft,
  BellRing,
  BatteryCharging,
  CheckCircle2,
  Download,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  StepForward,
  TabletSmartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/shared/logo'
import { InstallAppButton } from '@/components/pwa/install-app-button'

export const metadata: Metadata = {
  title: 'تحميل تطبيق أندرويد | تكليفات Takleefat',
  description:
    'حمّل تطبيق تكليفات لأندرويد: المنصة كاملة داخل تطبيق أصلي مع إشعارات فورية حتى لو كان التطبيق مغلق. مجاني 100%.',
}

const APK_URL = 'https://github.com/ForexYemeni/Takleefat/releases/latest/download/takleefat.apk'
const APK_FALLBACK = '/app/takleefat.apk'

const APK_INFO = [
  { label: 'الإصدار', value: '1.0.0' },
  { label: 'أندرويد', value: '8.0+' },
  { label: 'الحجم', value: '~3MB' },
  { label: 'السعر', value: 'مجاني' },
]

const INSTALL_STEPS = [
  {
    title: 'حمّل ملف التطبيق',
    body: 'اضغط زر التحميل أعلاه — سيُنزّل ملف takleefat.apk في مجلد التنزيلات بهاتفك.',
  },
  {
    title: 'اسمح بالتثبيت',
    body: 'عند فتح الملف سيسألك أندرويد «السماح من مصادر غير معروفة؟» — اضغط سماح. هذا إجراء طبيعي لأي تطبيق خارج متجر Play ويظهر مرة واحدة.',
  },
  {
    title: 'ثبّت وافتح',
    body: 'اضغط «تثبيت» ثم «فتح». ستجد أيقونة تكليفات على شاشتك الرئيسية بشاشة بداية بالهوية الرسمية.',
  },
  {
    title: 'فعّل الإشعارات',
    body: 'سجّل دخولك ثم اضغط زر «تفعيل الإشعارات» من لوحة التحكم، ووافق على إذن النظام عند ظهوره مرة واحدة.',
  },
]

const DEVICE_TIPS = [
  {
    brand: 'شاومي / ريدمي / بوكو (MIUI)',
    steps: 'الإعدادات ← التطبيقات ← تكليفات ← شغّل «التشغيل التلقائي»، ثم اضغط مطولاً على أيقونة التطبيق واختر «قفل» لمنع إغلاقه من الذاكرة.',
  },
  {
    brand: 'هواوي / هونر (EMUI)',
    steps: 'الإعدادات ← البطارية ← تشغيل التطبيقات ← تكليفات ← عطّل «إدارة تلقائية» وفعّل السماح بالتشغيل التلقائي والإشعارات.',
  },
  {
    brand: 'أوبو / فيفو / ريال مي',
    steps: 'الإعدادات ← البطارية ← تكليفات ← عطّل «تحسين البطارية الذكي»، وفعّل «السماح بالتشغيل في الخلفية» من إعدادات التطبيق.',
  },
  {
    brand: 'سامسونج / غيرها',
    steps: 'لا حاجة لأي خطوات إضافية غالباً — الإشعارات تعمل مباشرة. إن لم تصل: الإعدادات ← التطبيقات ← تكليفات ← الإشعارات ← تأكد أنها مفعّلة.',
  },
]

const FAQS = [
  {
    icon: RefreshCw,
    q: 'هل أحتاج تحديث التطبيق مع كل تطوير جديد؟',
    a: 'لا. التطبيق يفتح المنصة الحيّة مباشرة — أي تحديث ننشره على الموقع يظهر في التطبيق فوراً دون إعادة تثبيت. تحديث التطبيق نفسه يلزم فقط عند تغيير نظام الإشعارات أو الهوية.',
  },
  {
    icon: ShieldCheck,
    q: 'هل التطبيق آمن لبياناتنا الطبية؟',
    a: 'التطبيق يفتح موقعكم الرسمي نفسه عبر اتصال HTTPS مشفّر — لا وسيط ولا خادم خارجي. أضف أن التثبيت من رابط GitHub الرسمي للمشروع مباشرة.',
  },
  {
    icon: Lock,
    q: 'ما الصلاحيات التي يطلبها التطبيق؟',
    a: 'الحد الأدنى: الإنترنت والإشعارات فقط. لا يطلب الوصول للصور أو جهات الاتصال أو الموقع الجغرافي إلا إن احتاجت ميزة داخلية للتو ذلك بإذنك.',
  },
]

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* الترويسة */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Logo className="h-9 w-9" showText={false} />
            <div className="leading-tight">
              <p className="text-sm font-bold">تكليفات | Takleefat</p>
              <p className="text-xs text-muted-foreground">تطبيق أندرويد الرسمي</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/">
              العودة للمنصة
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* القسم الرئيسي */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/10 via-background to-background">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-12 md:grid-cols-[1fr_auto] md:py-16">
          <div>
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <TabletSmartphone className="h-3.5 w-3.5" />
              إصدار أندرويد رسمي
            </Badge>
            <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">
              منصة تكليفات كاملة
              <span className="block bg-gradient-to-l from-primary via-cyan-500 to-violet-500 bg-clip-text text-transparent">
                داخل جيبك، مع إشعارات لا تفوّتك شيئاً
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-muted-foreground md:text-lg">
              كل التكليفات والاعتمادات والإشعارات في تطبيق واحد يفتح أسرع من المتصفح —
              وتصلك التنبيهات الفورية <strong className="text-foreground">حتى لو كان التطبيق مغلقاً تماماً</strong>،
              بنفس قناة إشعارات أندرويد النظامية.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2 text-base font-bold shadow-lg">
                <a href={APK_URL} download>
                  <Download className="h-5 w-5" />
                  تحميل تطبيق أندرويد
                </a>
              </Button>
              <a
                href={APK_FALLBACK}
                download
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                رابط بديل للتحميل (من الموقع مباشرة)
              </a>
            </div>

            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {APK_INFO.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <dt className="text-muted-foreground">{item.label}:</dt>
                  <dd className="font-bold">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* بطاقة الأيقونة */}
          <div className="justify-self-center">
            <div className="relative rounded-3xl border bg-gradient-to-br from-primary/15 via-cyan-500/10 to-violet-500/10 p-8 shadow-xl">
              <Image
                src="/icons/icon-512.png"
                alt="أيقونة تطبيق تكليفات"
                width={168}
                height={168}
                className="rounded-2xl shadow-md"
                priority
              />
              <p className="mt-4 text-center text-sm font-bold">تكليفات</p>
            </div>
          </div>
        </div>
      </section>

      {/* خطوات التثبيت */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="flex items-center gap-2 text-2xl font-extrabold">
          <StepForward className="h-6 w-6 text-primary" />
          التثبيت في أربع خطوات
        </h2>
        <p className="mt-2 text-muted-foreground">
          دقيقتان فقط — ولا تُطلب منك أي بيانات جديدة: نفس حسابك في المنصة.
        </p>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {INSTALL_STEPS.map((step, index) => (
            <li key={step.title} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-extrabold text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="font-bold">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* الإشعارات حسب الجهاز */}
      <section className="border-y bg-muted/40 py-12">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold">
            <BellRing className="h-6 w-6 text-primary" />
            لضمان وصول الإشعارات دائماً
          </h2>
          <p className="mt-2 text-muted-foreground">
            أجهزة معينة تُغلق تطبيقات الخلفية بقوة لتوفير البطارية — خطوة واحدة تضمن وصول التنبيهات لحظة حدوثها.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {DEVICE_TIPS.map((tip) => (
              <div key={tip.brand} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <BatteryCharging className="h-5 w-5 text-amber-500" />
                  <h3 className="font-bold">{tip.brand}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tip.steps}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* بديل PWA + الأسئلة */}
      <section className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <Smartphone className="h-5 w-5 text-primary" />
            بدون تحميل ملف؟ ثبّتها كتطبيق ويب
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            يمكنك تثبيت المنصة كتطبيق ويب PWA بأيقونة على الشاشة الرئيسية دون أي ملف —
            وهو الخيار الوحيد المتاح لأجهزة <strong className="text-foreground">آيفون وآيباد</strong>.
          </p>
          <div className="mt-5">
            <InstallAppButton className="gap-2" />
          </div>
        </div>

        <div className="space-y-4">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-2xl border bg-card p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-bold">
                <faq.icon className="h-4 w-4 text-primary" />
                {faq.q}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* التذييل */}
      <footer className="border-t bg-muted/30 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            التحميل من الرابط الرسمي للمشروع على GitHub — مجاني ودون إعلانات.
          </div>
          <p>© {new Date().getFullYear()} تكليفات | Takleefat — منصة إدارة التكليفات الطبية والتمريضية</p>
        </div>
      </footer>
    </main>
  )
}
