'use client'

import { useQuery } from '@tanstack/react-query'
import { EyeOff, ListChecks, Stethoscope, UsersRound } from 'lucide-react'
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
      <div>
        <h1 className="text-2xl font-extrabold">الأقسام الطبية</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medical Departments — كتالوج الأقسام (عناية، طوارئ، رقود، حضانة، قبالة، مختبر...)
          الذي يُبنى عليه اختيار القسم في التكليفات، ويصرح به الكادر ضمن أقسام عمله ليصل
          التكليف الموجّه إلى أهله
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

      {/* مدير الأقسام — نفس المكون السابق مع شارة «كوادر مرتبطون» لكل قسم */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Stethoscope className="size-4 text-primary" />
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
