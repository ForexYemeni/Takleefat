'use client'

import { useQuery } from '@tanstack/react-query'
import { EyeOff, HeartPulse, ListChecks, Stethoscope, UsersRound } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { SpecialtyManager } from '@/components/admin/specialty-manager'

/**
 * التخصصات الطبية | Medical Specialties — قسم مستقل في حساب الإدارة (منظومة الأطباء)
 * كتالوج التخصصات (باطنية، جراحة عامة، أطفال، نساء وولادة...) الذي يُبنى عليه اختيار
 * التخصص في تكليفات الأطباء، ويصرح به الطبيب ضمن تخصصات عمله ليصل التكليف الموجّه لأهله.
 */

interface AdminSpecialty {
  id: string
  name: string
  isActive: boolean
  _count?: { doctors: number }
}

export function SpecialtiesManager() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-specialties'],
    queryFn: () => apiFetcher<{ specialties: AdminSpecialty[] }>('/api/admin/specialties'),
  })

  if (isLoading) return <DashboardSkeleton />

  const specialties = data?.specialties ?? []
  const total = specialties.length
  const active = specialties.filter((s) => s.isActive).length
  const hidden = total - active
  const linkCount = specialties.reduce((sum, s) => sum + (s._count?.doctors ?? 0), 0)

  const stats = [
    {
      label: 'إجمالي التخصصات',
      value: total,
      hint: 'كل التخصصات المضافة للكتالوج',
      icon: Stethoscope,
      tone: 'bg-teal-50 text-teal-700',
    },
    {
      label: 'ظاهرة في القوائم',
      value: active,
      hint: 'متاحة لاختيارها في تكليفات الأطباء',
      icon: ListChecks,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'تخصصات مخفية',
      value: hidden,
      hint: 'غير ظاهرة في القوائم الجديدة',
      icon: EyeOff,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'ارتباطات الأطباء',
      value: linkCount,
      hint: 'أطباء صرّحوا بهذه التخصصات ضمن تخصصات عملهم',
      icon: UsersRound,
      tone: 'bg-sky-50 text-sky-700',
    },
  ]

  return (
    <div className="space-y-4">
      {/* الترويسة الطبية الفاخرة — نفس العناصر بهوية تكليفات */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgba(15,27,78,0.05)] sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -top-20 start-4 h-40 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 end-4 h-44 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/25">
            <HeartPulse className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">التخصصات الطبية</h1>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Medical Specialties — كتالوج مستقل لمنظومة الأطباء (باطنية، جراحة عامة، أطفال، نساء
              وولادة...) يُبنى عليه اختيار التخصص في تكليفات الأطباء، ويصرح به الطبيب ضمن تخصصات
              عمله ليصل التكليف الموجّه إلى أهله
            </p>
          </div>
        </div>
      </div>

      {/* بطاقات الإحصاء الحية — تتحدث فورياً مع كل إضافة أو إخفاء */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            className="relative overflow-hidden rounded-2xl border-border/60 shadow-[0_1px_3px_rgba(15,27,78,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-18px_rgba(15,27,78,0.25)]"
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
                  <p className="mt-1.5 text-3xl font-black tracking-tight">{s.value}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">{s.hint}</p>
                </div>
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${s.tone}`}>
                  <s.icon className="size-4.5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* مدير التخصصات — مع شارة «أطباء مرتبطون» لكل تخصص */}
      <Card className="rounded-2xl border-border/60 shadow-[0_1px_3px_rgba(15,27,78,0.05)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-cyan-500/15 text-primary ring-1 ring-primary/10">
              <HeartPulse className="size-4" />
            </span>
            إدارة التخصصات الطبية
          </CardTitle>
          <CardDescription>
            أضف التخصصات التي يحتاجها نظام تكليفات الأطباء، وأخفِ أو احذف ما لم يعد يستخدم —
            كل تخصص يظهر معه عدد الأطباء المرتبطين به ضمن تخصصات عملهم
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SpecialtyManager />
        </CardContent>
      </Card>
    </div>
  )
}
