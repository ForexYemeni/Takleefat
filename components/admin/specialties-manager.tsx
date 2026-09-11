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
      <div>
        <h1 className="text-2xl font-extrabold">التخصصات الطبية</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medical Specialties — كتالوج مستقل لمنظومة الأطباء (باطنية، جراحة عامة، أطفال، نساء
          وولادة...) يُبنى عليه اختيار التخصص في تكليفات الأطباء، ويصرح به الطبيب ضمن تخصصات
          عمله ليصل التكليف الموجّه إلى أهله
        </p>
      </div>

      {/* بطاقات الإحصاء الحية — تتحدث فورياً مع كل إضافة أو إخفاء */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-3xl font-extrabold">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
              </div>
              <span className={`rounded-xl p-2.5 ${s.tone}`}>
                <s.icon className="size-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* مدير التخصصات — مع شارة «أطباء مرتبطون» لكل تخصص */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HeartPulse className="size-4 text-primary" />
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
