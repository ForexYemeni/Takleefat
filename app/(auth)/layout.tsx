import Link from 'next/link'
import { ShieldCheck, Stethoscope, Hospital, Activity } from 'lucide-react'
import { Logo } from '@/components/shared/logo'

/**
 * مسار خط نبض القلب (ECG) — مركّب واحد بعرض 160px يتكرر 10 مرات عبر 1600px:
 * موجة P صغيرة ← قرص QRS حاد ← موجة T — يُبنى برمجياً لتفادي مسار ضخم يدوياً.
 */
function buildEcgPath(): string {
  const COMPLEX = 'h30 c4,-10 10,-10 14,0 h10 l5,8 l8,-52 l8,60 l5,-16 h12 c4,-14 12,-14 16,0 h52'
  return `M0 100 ${Array(10).fill(COMPLEX).join(' ')}`
}

/**
 * تخطيط صفحات المصادقة — تكليفات | Takleefat (الجولة 52)
 * لوحة هوية سينمائية: هالات ضوئية عائمة + شبكة نقاط + خط نبض قلب حي
 * + بطاقات زجاجية للمميزات — مع منطقة نموذج نظيفة ومتوسطة عمودياً بأمان
 * (my-auto يمنع قصّ أعلى المحتوى الطويل في صفحة التسجيل).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ============ لوحة الهوية — شاشات كبيرة فقط ============ */}
      <aside className="auth-panel relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:w-[48%]">
        {/* زخارف الحركة — هالات + شبكة نقاط */}
        <div className="auth-orb auth-orb-1" aria-hidden="true" />
        <div className="auth-orb auth-orb-2" aria-hidden="true" />
        <div className="auth-orb auth-orb-3" aria-hidden="true" />
        <div className="auth-dots" aria-hidden="true" />

        {/* خط نبض القلب الحي — مسار خافت دائم + قطاع لامع يسافر عبره */}
        <svg
          viewBox="0 0 1600 200"
          preserveAspectRatio="none"
          fill="none"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-44 w-full -translate-y-1/2"
          aria-hidden="true"
        >
          <path
            d={buildEcgPath()}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ecg-base"
          />
          <path
            d={buildEcgPath()}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ecg-bright"
          />
        </svg>

        {/* أعلى اللوحة: الشعار */}
        <div className="relative z-10">
          <Link
            href="/"
            className="inline-flex rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 [&_span]:text-white/90"
            aria-label="تكليفات | Takleefat — الصفحة الرئيسية"
          >
            <Logo size="lg" textClassName="text-white" />
          </Link>
        </div>

        {/* وسط اللوحة: العنوان + بطاقات المميزات الزجاجية */}
        <div className="relative z-10 space-y-7">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold backdrop-blur-md">
              <Activity className="size-3.5" />
              منصة طبية موحّدة لإدارة الكوادر
            </span>
            <h2 className="text-4xl font-black leading-[1.25] tracking-tight">
              التكليفات الطبية
              <br />
              <span className="bg-gradient-to-l from-sky-300 via-indigo-200 to-fuchsia-300 bg-clip-text text-transparent">
                بلا ورق ولا انتظار
              </span>
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-white/70">
              منصة واحدة تربط الجهات الصحية بالكوادر الطبية والتمريضية المؤهلة —
              من الإعلان والاعتماد الإداري إلى توثيق الاستلام والإنجاز إلكترونياً.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: ShieldCheck, title: 'اعتماد إداري', desc: 'لكل الحسابات والمستندات' },
              { icon: Stethoscope, title: 'إسناد موثوق', desc: 'للكوادر المؤهلة حسب التخصص' },
              { icon: Hospital, title: 'توثيق استلام', desc: 'إلكترونياً من الجهة المستقبِلة' },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md transition-colors duration-300 hover:bg-white/15"
              >
                <span className="mb-3 flex size-9 items-center justify-center rounded-xl bg-white/15">
                  <f.icon className="size-4.5" />
                </span>
                <p className="text-sm font-extrabold">{f.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/65">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* أسفل اللوحة: خطوات الانطلاق + حقوق النشر */}
        <div className="relative z-10 space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
            {['أنشئ حسابك', 'اعتماد الإدارة', 'استقبل التكليفات'].map((s, i, arr) => (
              <div key={s} className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-xs font-bold">
                  <span className="flex size-6 items-center justify-center rounded-full bg-white/20 text-[11px] font-black">
                    {i + 1}
                  </span>
                  {s}
                </span>
                {i < arr.length - 1 && <span className="h-px w-5 bg-white/25" aria-hidden="true" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-white/55">
            © {new Date().getFullYear()} تكليفات | Takleefat — جميع الحقوق محفوظة
          </p>
        </div>
      </aside>

      {/* ============ منطقة النموذج ============ */}
      <main className="relative flex min-h-screen flex-1 flex-col overflow-x-clip bg-background">
        {/* توهج ناعم زخرفي خلف النموذج */}
        <div className="auth-glow" aria-hidden="true" />

        {/* رأس الجوال */}
        <div className="relative z-10 flex items-center justify-between border-b bg-background/80 p-4 backdrop-blur lg:hidden">
          <Link href="/" aria-label="تكليفات | Takleefat — الصفحة الرئيسية">
            <Logo size="sm" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground">
            <Activity className="size-3.5" />
            منصة التكليفات الطبية
          </span>
        </div>

        {/* حاوية النموذج — my-auto للتوسيط الآمن دون قصّ المحتوى الطويل */}
        <div className="relative z-10 flex flex-1 p-4 sm:p-8">
          <div className="my-auto w-full max-w-lg mx-auto">{children}</div>
        </div>

        {/* تذييل الجوال */}
        <div className="relative z-10 border-t p-3 text-center text-[11px] text-muted-foreground lg:hidden">
          © {new Date().getFullYear()} تكليفات | Takleefat — جميع الحقوق محفوظة
        </div>
      </main>
    </div>
  )
}
