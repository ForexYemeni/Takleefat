import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { getReferralSettings, isReferralEligibleRole } from '@/lib/referrals'
import { Logo } from '@/components/shared/logo'
import { Stethoscope, UserPlus, ClipboardList, Briefcase, BadgeCheck } from 'lucide-react'

/**
 * صفحة هبوط الدعوة /r/[code] — الجولة 75 (برنامج إحالة تكليفات — إضافي بحت)
 * ------------------------------------------------------------
 * «انضم إلى تكليفات من خلال دعوتي» — صفحة عامة زجاجية فاخرة بهوية تكليفات.
 * كود صالح → زر البدء يمر من /api/referrals/track لتحفظ الكوكي الآمن ثم التسجيل.
 * كود غير صالح → نفس الصفحة برسالة لطيفة وزر تسجيل عادي (لا يمنع التسجيل أبداً).
 * لا استحقاق ولا احتساب على مجرد الزيارة — التتبع آمن httpOnly على الخادم.
 */

export const metadata: Metadata = {
  title: 'انضم إلى تكليفات من خلال دعوتي',
  description: 'دعوة شخصية للانضمام إلى منصة تكليفات — إدارة التكليفات الطبية والتمريضية وفرص العمل الصحية',
}

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'تكليفات طبية موثوقة',
    body: 'فرص تكليف معلنة بشفافية كاملة — القيمة والرسوم والتوقيت واضحة قبل التقديم.',
  },
  {
    icon: Briefcase,
    title: 'فرص عمل صحية',
    body: 'وظائف في المستشفيات والجهات الصحية تناسب تخصصك ومؤهلك وسنوات خبرتك.',
  },
  {
    icon: BadgeCheck,
    title: 'توثيق ومهنية',
    body: 'ملف مهني احترافي بمستنداتك الموثقة وبطاقة مهنية رقمية تعرّفك بتميز.',
  },
]

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode).trim().toUpperCase().slice(0, 40)

  // التحقق من صحة الكود على الخادم مباشرة
  let valid = false
  let referrerFirstName: string | null = null
  if (code) {
    try {
      const [codeRow, settings] = await Promise.all([
        db.referralCode.findUnique({
          where: { code },
          include: { user: { select: { name: true, role: true, status: true } } },
        }),
        getReferralSettings(),
      ])
      if (
        settings.enabled &&
        codeRow &&
        codeRow.isActive &&
        codeRow.user.status === 'APPROVED' &&
        isReferralEligibleRole(codeRow.user.role)
      ) {
        valid = true
        referrerFirstName = codeRow.user.name.split(' ')[0] ?? null
      }
    } catch {
      valid = false
    }
  }

  const trackHref = valid ? `/api/referrals/track?code=${encodeURIComponent(code)}` : '/register'

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-background via-background to-primary/5">
      {/* توهجات هوية تكليفات — كحلي/سماوي/بنفسجي خفيف */}
      <div aria-hidden className="pointer-events-none absolute -top-32 start-1/4 size-96 rounded-full bg-cyan-400/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 end-[-80px] size-80 rounded-full bg-violet-500/12 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-100px] start-[-60px] size-96 rounded-full bg-blue-600/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-5">
        <Link href="/" aria-label="تكليفات | Takleefat">
          <Logo size="sm" />
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-border/70 bg-background/60 px-4 py-1.5 text-xs font-bold text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          لدي حساب — دخول
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-5 pb-16">
        <section className="liquid-glass mt-4 rounded-[2rem] p-7 text-center md:mt-8 md:p-10">
          <p className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary">
            <UserPlus className="size-3.5" />
            دعوة شخصية من{referrerFirstName ? ` ${referrerFirstName}` : ' زميل لك'}
          </p>
          <h1 className="mx-auto max-w-2xl text-3xl font-black leading-tight tracking-tight text-foreground md:text-4xl">
            انضم إلى تكليفات
            <span className="mt-1 block bg-gradient-to-l from-cyan-500 via-sky-500 to-violet-500 bg-clip-text text-transparent">
              من خلال دعوتي
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
            منصة احترافية لإدارة التكليفات الطبية والتمريضية وفرص العمل الصحية — أنشئ ملفك المهني،
            ارفع مستنداتك، ووثّق حسابك، ثم قدّم على التكليفات والفرص المناسبة لك.
          </p>

          {!valid && (
            <p className="mx-auto mt-4 max-w-md rounded-2xl bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-700 dark:text-amber-400">
              رابط الدعوة غير صالح أو منتهي — يمكنك التسجيل مباشرة كالمعتاد
            </p>
          )}

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={trackHref}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-600 to-sky-600 px-8 text-sm font-extrabold text-white shadow-lg shadow-cyan-600/25 transition-all hover:shadow-xl hover:shadow-cyan-600/30 hover:brightness-110 sm:w-auto"
            >
              <Stethoscope className="size-5" />
              أنشئ حسابك الآن
            </a>
            <Link
              href="/"
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-border/70 bg-background/60 px-6 text-sm font-bold text-muted-foreground backdrop-blur transition-colors hover:text-foreground sm:w-auto"
            >
              تعرف على المنصة
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-3.5 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="liquid-glass-soft rounded-3xl p-5">
              <span className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 text-primary">
                <f.icon className="size-5.5" />
              </span>
              <h2 className="text-sm font-extrabold text-foreground">{f.title}</h2>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="liquid-glass-soft mt-5 flex flex-wrap items-center justify-center gap-2.5 rounded-3xl px-5 py-4">
          {['أنشئ حسابك', 'أكمل بياناتك المهنية', 'ارفع مستنداتك', 'وثّق حسابك', 'قدّم على الفرص'].map(
            (step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] font-bold text-muted-foreground">
                  {step}
                </span>
                {i < 4 && <span aria-hidden className="text-[10px] text-muted-foreground/50">←</span>}
              </span>
            )
          )}
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/50 bg-background/40 py-4 backdrop-blur">
        <p className="text-center text-xs text-muted-foreground">
          تكليفات | Takleefat — منصة احترافية لإدارة التكليفات الطبية والتمريضية
        </p>
      </footer>
    </div>
  )
}
