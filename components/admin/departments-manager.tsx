'use client'

import { useQuery } from '@tanstack/react-query'
import { ClipboardList, EyeOff, ListChecks, Stethoscope, UsersRound } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { DepartmentManager } from '@/components/admin/catalog-manager'

/**
 * الأقسام الطبية | Medical Departments — قسم مستقل في حساب الإدارة
 * كتالوج الأقسام التي يختار منها المستلم الإداري والإدارة عند إنشاء التكليف،
 * ويصرح بها الكادر ضمن «أقسام العمل» ليصل التكليف الموجّه لمن ينطبق عليه.
 */

interface AdminDepartment {
  id: string
  name: string
  isActive: boolean
  _count?: { nurses: number }
}

export function DepartmentsManager() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: () => apiFetcher<{ departments: AdminDepartment[] }>('/api/admin/departments'),
  })

  if (isLoading) return <DashboardSkeleton />

  const departments = data?.departments ?? []
  const total = departments.length
  const active = departments.filter((d) => d.isActive).length
  const hidden = total - active
  const linkCount = departments.reduce((sum, d) => sum + (d._count?.nurses ?? 0), 0)

  const stats = [
    {
      label: 'إجمالي الأقسام',
      value: total,
      hint: 'كل الأقسام المضافة للكتالوج',
      icon: Stethoscope,
      tone: 'bg-teal-50 text-teal-700',
    },
    {
      label: 'ظاهرة في القوائم',
      value: active,
      hint: 'متاحة لاختيارها عند إنشاء التكليف',
      icon: ListChecks,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'أقسام مخفية',
      value: hidden,
      hint: 'غير ظاهرة في القوائم الجديدة',
      icon: EyeOff,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'ارتباطات الكوادر',
      value: linkCount,
      hint: 'كوادر صرّحوا بهذه الأقسام ضمن أقسام عملهم',
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
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg shadow-sky-500/25">
            <ClipboardList className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">الأقسام الطبية</h1>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Medical Departments — كتالوج الأقسام (عناية، طوارئ، رقود، حضانة، قبالة، مختبر...)
              الذي يُبنى عليه اختيار القسم في التكليفات، ويصرح به الكادر ضمن أقسام عمله ليصل
              التكليف الموجّه إلى أهله
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

      {/* مدير الأقسام — نفس المكون السابق مع شارة «كوادر مرتبطون» لكل قسم */}
      <Card className="rounded-2xl border-border/60 shadow-[0_1px_3px_rgba(15,27,78,0.05)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-cyan-500/15 text-primary ring-1 ring-primary/10">
              <Stethoscope className="size-4" />
            </span>
            إدارة الأقسام الطبية
          </CardTitle>
          <CardDescription>
            أضف الأقسام التي يحتاجها نظام التكليفات، وأخفِ أو احذف ما لم يعد يستخدم —
            كل قسم يظهر معه عدد الكوادر المرتبطين به ضمن أقسام عملهم
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DepartmentManager />
        </CardContent>
      </Card>
    </div>
  )
}
