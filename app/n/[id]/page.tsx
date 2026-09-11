import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'
import {
  ProfessionalCard,
  type ProfessionalCardProps,
} from '@/components/nurse/professional-card'

/**
 * البطاقة المهنية العامة — /n/[id] (الجولة الرابعة عشرة)
 * صفحة عامة بلا جلسة تعرض البطاقة المهنية الموثقة للكادر المعتمد حصراً:
 * - الحسابات غير المعتمدة أو غير الكوادر → 404 (لا تسريب ولا تعداد)
 * - لا يُعرض رقم الهاتف ولا المستندات — الهوية المهنية فقط
 * - QR مُولَّد محلياً (مكتبة qrcode) يشير لهذا الرابط نفسه
 */

export const dynamic = 'force-dynamic'

interface CardData {
  nurse: {
    id: string
    name: string
    specialty: string | null
    qualification: string | null
    yearsOfExperience: number | null
    gender: string | null
    createdAt: Date
  }
  departments: string[]
  completedAssignments: number
  ratingAverage: number | null
  ratingCount: number
}

async function getApprovedNurseCard(id: string): Promise<CardData | null> {
  if (!id) return null
  const nurse = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      specialty: true,
      qualification: true,
      yearsOfExperience: true,
      gender: true,
      role: true,
      status: true,
      createdAt: true,
      // أقسام العمل المصرّح بها — تظهر في البطاقة المهنية العامة
      workDepartments: {
        where: { department: { isActive: true } },
        orderBy: { createdAt: 'asc' },
        select: { department: { select: { name: true } } },
      },
    },
  })
  // الكادر المعتمد حصراً — أي حالة أخرى تعامل كغير موجودة
  if (!nurse || nurse.role !== 'NURSE' || nurse.status !== 'APPROVED') return null

  const [assignmentAgg, ratingsAgg] = await Promise.all([
    db.assignment.groupBy({ by: ['status'], where: { nurseId: id }, _count: true }),
    db.nurseRating.aggregate({ where: { nurseId: id }, _avg: { overall: true }, _count: true }),
  ])
  const statusMap = Object.fromEntries(assignmentAgg.map((a) => [a.status, a._count]))

  return {
    nurse,
    departments: nurse.workDepartments.map((w) => w.department.name),
    completedAssignments: statusMap.COMPLETED ?? 0,
    ratingAverage: ratingsAgg._avg.overall ? Number(ratingsAgg._avg.overall.toFixed(1)) : null,
    ratingCount: ratingsAgg._count,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const data = await getApprovedNurseCard(id)
  if (!data) return { title: 'بطاقة غير متاحة | تكليفات' }
  const spec = data.nurse.specialty ? ` — ${data.nurse.specialty}` : ''
  return {
    title: `${data.nurse.name}${spec} — بطاقة مهنية موثقة | تكليفات`,
    description: `بطاقة مهنية موثقة صادرة عن منصة تكليفات | Takleefat — تقييم ${data.ratingAverage ?? 'جديد'} من 5 · ${data.completedAssignments} تكليف مكتمل`,
  }
}

export default async function PublicNurseCardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getApprovedNurseCard(id)
  if (!data) notFound()

  // الرابط المطلق من ترويسات الطلب — يعمل محلياً وعلى الإنتاج
  const h = await headers()
  const host = h.get('host') ?? 'taklefat.vercel.app'
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https')
  const publicUrl = `${proto}://${host}/n/${data.nurse.id}`

  const qrSvg = await QRCode.toString(publicUrl, {
    type: 'svg',
    margin: 0,
    width: 96,
    errorCorrectionLevel: 'M',
    color: { dark: '#0E1B4E', light: '#FFFFFF' },
  })

  const cardProps: ProfessionalCardProps = {
    name: data.nurse.name,
    specialty: data.nurse.specialty,
    qualification: data.nurse.qualification,
    yearsOfExperience: data.nurse.yearsOfExperience,
    gender: data.nurse.gender,
    departments: data.departments,
    ratingAverage: data.ratingAverage,
    ratingCount: data.ratingCount,
    completedAssignments: data.completedAssignments,
    memberSince: formatDate(data.nurse.createdAt),
    qrSvg,
    publicUrl,
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/60 to-background">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="منصة تكليفات">
            <Logo size="md" />
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-3 py-1 text-xs font-bold text-[#2563EB]">
            <ShieldCheck className="size-4" />
            بطاقة موثقة
          </span>
        </header>

        <ProfessionalCard {...cardProps} />

        <section className="rounded-2xl border bg-background p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-bold text-foreground">لماذا هذه البطاقة موثوقة؟</p>
          <p className="mt-1">
            تصدرها منصة تكليفات | Takleefat للكادر التمريضي المعتمد بعد مراجعة مستنداته من
            إدارة المنصة — والتقييمات المعروضة هنا تُجمع تلقائياً من جهات صحية حقيقية بعد
            إنهاء التكليفات فعلياً. امسح رمز QR للوصول إلى هذه البطاقة والتحقق منها في أي وقت.
          </p>
        </section>

        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <Link
            href="/"
            className="flex items-center gap-1.5 font-bold text-primary hover:underline"
          >
            <ArrowLeft className="size-4" />
            منصة تكليفات | Takleefat
          </Link>
          <p>البيانات المعروضة مهنية فقط — دون أي معلومات تواصل شخصية</p>
        </footer>
      </div>
    </div>
  )
}
