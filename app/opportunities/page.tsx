import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { Briefcase, Building2, Clock, MapPin, Sparkles, Users } from 'lucide-react'

/**
 * صفحة «فرص العمل الصحية» العامة — الجولة 66 | ميزة «فرصة» (المواصفة 29)
 * ============================================================
 * صفحة آمنة لمحركات البحث: الفرص المنشورة فقط ببيانات عامة حصراً —
 * صفر بيانات شخصية لأي مستخدم، صفر تفاصيل داخلية. Metadata + Open Graph +
 * JSON-LD Structured Data بالعربية.
 */

export const revalidate = 120

export const metadata: Metadata = {
  title: 'فرص العمل الصحية | فرصة — تكليفات Takleefat',
  description:
    'فرص عمل صحية معلنة من المستشفيات والمراكز الطبية: أطباء وكوادر صحية بتخصصات وأقسام متعددة — منصة تكليفات الطبية الأولى',
  keywords: ['فرص عمل صحية', 'وظائف طبية', 'وظائف تمريض', 'أطباء', 'تكليفات', 'فرصة', 'اليمن'],
  openGraph: {
    title: 'فرص العمل الصحية | فرصة — تكليفات',
    description: 'فرص عمل صحية للأطباء والكوادر التمريضية من جهات صحية معتمدة',
    type: 'website',
    locale: 'ar_YE',
    siteName: 'تكليفات | Takleefat',
  },
  robots: { index: true, follow: true },
}

async function getPublicOpportunities() {
  try {
    return await db.opportunity.findMany({
      where: { status: { in: ['PUBLISHED', 'ACTIVE'] } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        number: true,
        title: true,
        audience: true,
        salaryAmount: true,
        salaryType: true,
        salaryCurrency: true,
        workStartTime: true,
        workEndTime: true,
        positionsNeeded: true,
        publishedAt: true,
        hospital: { select: { name: true, city: true, location: true } },
        specialty: { select: { name: true } },
        department: { select: { name: true } },
      },
      take: 24,
    })
  } catch {
    return []
  }
}

const SALARY_AR: Record<string, string> = { MONTHLY: 'شهري', DAILY: 'يومي', NEGOTIABLE: 'حسب الاتفاق' }
const CURRENCY_AR: Record<string, string> = { YER: 'ريال', SAR: 'ريال سعودي', USD: '$' }

export default async function PublicOpportunitiesPage() {
  const opportunities = await getPublicOpportunities()

  // Structured Data — بيانات وظيفية عامة فقط
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'فرص العمل الصحية — تكليفات',
    itemListElement: opportunities.slice(0, 10).map((o, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'JobPosting',
        title: o.title,
        hiringOrganization: { '@type': 'Organization', name: o.hospital.name },
        employmentType: o.audience === 'DOCTOR' ? 'FULL_TIME' : 'CONTRACTOR',
        ...(o.salaryAmount && o.salaryAmount > 0
          ? {
              baseSalary: {
                '@type': 'MonetaryAmount',
                currency: o.salaryCurrency,
                value: { '@type': 'QuantitativeValue', value: o.salaryAmount, unitText: o.salaryType },
              },
            }
          : {}),
      },
    })),
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ترويسة عامة */}
      <header className="border-b bg-gradient-to-bl from-[#1e1b4b] via-[#312e81] to-[#4c1d95] text-white">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <Link href="/" className="text-xs font-bold text-violet-200 hover:text-white">
            ← تكليفات | Takleefat
          </Link>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-black md:text-3xl">
            <Sparkles className="size-6 text-violet-300" />
            فرص العمل الصحية
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-violet-100/90">
            وظائف معلنة من مستشفيات ومراكز طبية للأطباء والكوادر التمريضية — سجّل الدخول لعرض الفرص المطابقة لملفك المهني والتقديم عليها
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {opportunities.length === 0 ? (
          <p className="rounded-3xl border border-dashed px-6 py-14 text-center text-sm font-bold text-muted-foreground">
            لا توجد فرص منشورة حالياً — تابعنا قريباً
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {opportunities.map((o) => (
              <article key={o.id} className="rounded-3xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-black text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                    فرصة رقم {o.number}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-black text-muted-foreground">
                    {o.audience === 'DOCTOR' ? 'طبيب' : 'كادر صحي'}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-black leading-snug">{o.title}</h2>
                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0" />
                  {o.hospital.name}
                  {o.hospital.city ? ` — ${o.hospital.city}` : ''}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
                  {o.specialty && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="size-3" />
                      {o.specialty.name}
                    </span>
                  )}
                  {o.department && (
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {o.department.name}
                    </span>
                  )}
                  {o.workStartTime && o.workEndTime && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {o.workStartTime}–{o.workEndTime}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm font-black text-violet-700 dark:text-violet-300">
                  {o.salaryAmount && o.salaryAmount > 0
                    ? `${o.salaryAmount.toLocaleString('ar-YE')} ${CURRENCY_AR[o.salaryCurrency] ?? 'ريال'} ${SALARY_AR[o.salaryType] ?? ''}`
                    : 'حسب الاتفاق'}
                </p>
                <div className="mt-3 rounded-2xl bg-muted/50 p-3 text-center text-xs font-black text-muted-foreground">
                  سجّل الدخول إلى تكليفات للتقديم إذا كان ملفك مهنياً مطابقاً
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-center">
          <Link href="/login" className="rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 px-5 py-2.5 text-sm font-black text-white shadow-md hover:from-violet-700 hover:to-violet-600">
            تسجيل الدخول للتقديم
          </Link>
          <Link href="/register" className="rounded-xl border px-5 py-2.5 text-sm font-black hover:bg-accent">
            إنشاء حساب كادر
          </Link>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        تكليفات | Takleefat — منصة احترافية لإدارة التكليفات الطبية والتمريضية
      </footer>
    </div>
  )
}
