import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  ClipboardList,
  FileUp,
  Hospital,
  ShieldCheck,
  Stethoscope,
  UserCog,
  Users,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/shared/logo'

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'إدارة التكليفات',
    description: 'إنشاء التكليفات الطبية والتمريضية وإسنادها للكادر المؤهل مع تحديد الجهة والمدة ومتابعة حالتها خطوة بخطوة.',
  },
  {
    icon: BadgeCheck,
    title: 'اعتماد الحسابات',
    description: 'يعمل النظام بموافقة الإدارة: تتم مراجعة بيانات الكوادر والمستندات قبل تفعيل الحساب لضمان موثوقية المنصة.',
  },
  {
    icon: FileUp,
    title: 'المستندات الرسمية',
    description: 'رفع صورة المزاولة والبطاقة الشخصية وشهادات الخبرة بتخزين سحابي آمن، مع اعتماد أو رفض كل مستند مع سبب الرفض.',
  },
  {
    icon: BellRing,
    title: 'إشعارات فورية',
    description: 'تنبيهات لحظية لجميع الأطراف: عند إنشاء التكليف، اعتماد الحساب، مراجعة المستندات، وتأكيد الاستلام.',
  },
  {
    icon: ShieldCheck,
    title: 'صلاحيات محكمة',
    description: 'ثلاثة أدوار واضحة: مدير النظام، الكادر التمريضي، والمستلم الإداري — مع حماية كاملة لجميع واجهات البرمجة.',
  },
  {
    icon: Users,
    title: 'سجل شفاف',
    description: 'توثيق كامل لكل حدث في التكليف: من الإنشاء إلى الاستلام والإنجاز، لضمان المساءلة والشفافية.',
  },
]

const STEPS = [
  {
    number: '١',
    title: 'أنشئ حسابك',
    description: 'سجّل بياناتك المهنية ككادر تمريضي، وارفع مستنداتك الرسمية خلال دقائق.',
  },
  {
    number: '٢',
    title: 'اعتماد الحساب',
    description: 'تراجع الإدارة بياناتك ومستنداتك وتعتمد حسابك لتصبح جاهزاً للتكليف.',
  },
  {
    number: '٣',
    title: 'استلم تكليفاتك',
    description: 'تصلك التكليفات المسندة إليك وتؤكد جهة الاستلام استلامها إلكترونياً.',
  },
]

const ROLES = [
  {
    icon: UserCog,
    title: 'مدير النظام',
    description: 'اعتماد الحسابات ومراجعة المستندات وإنشاء التكليفات ومتابعة سير العمل.',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    icon: Stethoscope,
    title: 'الكادر التمريضي',
    description: 'استعراض التكليفات المسندة إليه ورفع مستنداته الرسمية ومتابعة حالة الحساب.',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    icon: Hospital,
    title: 'المستلم الإداري',
    description: 'استلام التكليفات المسندة إليه وتأكيد الاستلام إلكترونياً وتوثيق الإجراء.',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* شريط التنقل */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" aria-label="تكليفات | Takleefat">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-primary">المميزات</a>
            <a href="#how" className="transition-colors hover:text-primary">كيف تعمل</a>
            <a href="#roles" className="transition-colors hover:text-primary">الأدوار</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/login">تسجيل الدخول</Link>
            </Button>
            <Button asChild>
              <Link href="/register">إنشاء حساب</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* القسم الرئيسي */}
        <section className="relative overflow-hidden">
          <div className="brand-gradient-soft absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:py-24">
            <div className="space-y-6">
              <Badge variant="secondary" className="gap-1.5 border border-teal-200 bg-white/70 px-3 py-1 text-teal-700">
                <ShieldCheck className="size-3.5" />
                منصة رسمية لإدارة التكليفات الصحية
              </Badge>
              <h1 className="text-3xl font-extrabold leading-[1.25] tracking-tight sm:text-4xl lg:text-5xl">
                منصة <span className="text-primary">تكليفات</span>
                <br />
                لإدارة التكليفات الطبية والتمريضية باحترافية
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                نظام متكامل لإنشاء التكليفات الطبية وإسنادها للكوادر التمريضية المؤهلة،
                واعتماد حساباتهم ومستنداتهم، وتوثيق الاستلام إلكترونياً — بشفافية كاملة وإشعارات لحظية.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="gap-2">
                  <Link href="/register">
                    ابدأ الآن — إنشاء حساب
                    <ArrowLeft className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">تسجيل الدخول</Link>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  اعتماد إداري للحسابات
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  تخزين سحابي آمن للمستندات
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  متوافقة مع الجوال
                </span>
              </div>
            </div>

            {/* معاينة مرئية للوحة التحكم */}
            <div className="relative mx-auto w-full max-w-md">
              <div className="rounded-2xl border bg-white p-4 shadow-xl shadow-teal-900/10">
                <div className="mb-4 flex items-center justify-between border-b pb-3">
                  <Logo size="sm" />
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    تكليف جاري
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border bg-teal-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">تكليف تمريضي — قسم الطوارئ</p>
                      <ClipboardList className="size-4 text-teal-700" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">مستشفى الملكية — لمدة ٣ أشهر</p>
                    <div className="mt-2 flex gap-2">
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">جاري</span>
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 border border-cyan-200">تم الاستلام</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border p-2.5">
                      <p className="text-lg font-extrabold text-teal-700">٨٤</p>
                      <p className="text-[11px] text-muted-foreground">كادر معتمد</p>
                    </div>
                    <div className="rounded-xl border p-2.5">
                      <p className="text-lg font-extrabold text-emerald-600">١٢</p>
                      <p className="text-[11px] text-muted-foreground">تكليف نشط</p>
                    </div>
                    <div className="rounded-xl border p-2.5">
                      <p className="text-lg font-extrabold text-amber-600">٥</p>
                      <p className="text-[11px] text-muted-foreground">بانتظار الاعتماد</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -start-4 -z-10 size-24 rounded-2xl bg-teal-100/70 blur-2xl" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* المميزات */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">مميزات المنصة</h2>
            <p className="mt-3 text-muted-foreground">
              كل ما تحتاجه لإدارة التكليفات الطبية والتمريضية في نظام واحد آمن وسهل الاستخدام.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-teal-900/5"
              >
                <div className="mb-4 inline-flex rounded-xl bg-teal-50 p-3 text-teal-700 transition-colors group-hover:bg-teal-100">
                  <feature.icon className="size-6" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* كيف تعمل */}
        <section id="how" className="border-y bg-secondary/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="text-2xl font-extrabold sm:text-3xl">كيف تعمل المنصة؟</h2>
              <p className="mt-3 text-muted-foreground">ثلاث خطوات فقط من التسجيل إلى استلام التكليف.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.number} className="relative rounded-2xl border bg-card p-6">
                  <span className="absolute -top-4 start-6 flex size-9 items-center justify-center rounded-full brand-gradient text-lg font-extrabold text-white shadow-md">
                    {step.number}
                  </span>
                  <h3 className="mb-2 mt-3 text-lg font-bold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                  {index < STEPS.length - 1 && (
                    <ArrowLeft className="absolute -start-5 top-1/2 hidden size-5 -translate-y-1/2 text-teal-400 md:block" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* الأدوار */}
        <section id="roles" className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">أدوار المنصة</h2>
            <p className="mt-3 text-muted-foreground">
              صلاحيات واضحة لكل مستخدم بما يضمن سير عمل منظم وموثوق.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {ROLES.map((role) => (
              <div key={role.title} className="rounded-2xl border bg-card p-6 text-center transition-all hover:shadow-lg hover:shadow-teal-900/5">
                <div className={`mx-auto mb-4 inline-flex rounded-2xl border p-4 ${role.color}`}>
                  <role.icon className="size-8" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{role.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* دعوة لاتخاذ إجراء */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:pb-20">
          <div className="brand-gradient relative overflow-hidden rounded-3xl px-6 py-12 text-center text-white md:px-12">
            <h2 className="text-2xl font-extrabold sm:text-3xl">جاهز للانطلاق مع تكليفات؟</h2>
            <p className="mx-auto mt-3 max-w-xl text-teal-50">
              أنشئ حسابك اليوم وانضم إلى منصة تكليفات لإدارة التكليفات الطبية والتمريضية بأعلى معايير الاحترافية.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" variant="secondary" asChild className="font-bold">
                <Link href="/register">إنشاء حساب جديد</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-white/40 bg-transparent font-bold text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">تسجيل الدخول</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* التذييل */}
      <footer className="mt-auto border-t bg-secondary/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <Logo size="sm" />
            <p className="text-sm text-muted-foreground">
              منصة تكليفات | Takleefat — منصة احترافية لإدارة التكليفات الطبية والتمريضية
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/login" className="hover:text-primary">تسجيل الدخول</Link>
              <Link href="/register" className="hover:text-primary">إنشاء حساب</Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground md:text-start">
            © {new Date().getFullYear()} تكليفات | Takleefat. جميع الحقوق محفوظة.
          </p>
        </div>
      </footer>
    </div>
  )
}
