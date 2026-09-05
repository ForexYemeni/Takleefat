'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  ClipboardList,
  FileCheck2,
  Hourglass,
  UserCog,
  Users,
} from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DashboardSkeleton } from '@/components/shared/empty-state'

interface AdminStats {
  totalNurses: number
  pendingNurses: number
  approvedNurses: number
  totalReceivers: number
  totalAssignments: number
  activeAssignments: number
  receivedAssignments: number
  completedAssignments: number
  pendingDocuments: number
}

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetcher<AdminStats>('/api/stats'),
  })

  if (isLoading) return <DashboardSkeleton />

  const cards = [
    {
      title: 'إجمالي الكادر التمريضي',
      value: data?.totalNurses ?? 0,
      icon: Users,
      hint: `${data?.approvedNurses ?? 0} معتمد`,
      href: '/admin/nurses',
      color: 'bg-teal-50 text-teal-700',
    },
    {
      title: 'حسابات بانتظار الاعتماد',
      value: data?.pendingNurses ?? 0,
      icon: Hourglass,
      hint: 'تحتاج مراجعة',
      href: '/admin/nurses?status=PENDING',
      color: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'التكليفات الجارية',
      value: data?.activeAssignments ?? 0,
      icon: ClipboardList,
      hint: `${data?.totalAssignments ?? 0} إجمالي`,
      href: '/admin/assignments',
      color: 'bg-emerald-50 text-emerald-700',
    },
    {
      title: 'مستندات بانتظار المراجعة',
      value: data?.pendingDocuments ?? 0,
      icon: FileCheck2,
      hint: 'مراجعة الملفات',
      href: '/admin/documents',
      color: 'bg-cyan-50 text-cyan-700',
    },
  ]

  const quickActions = [
    { label: 'إنشاء تكليف جديد', href: '/admin/assignments', icon: ClipboardList },
    { label: 'اعتماد حسابات جديدة', href: '/admin/nurses?status=PENDING', icon: BadgeCheck },
    { label: 'إضافة مستلم إداري', href: '/admin/receivers', icon: UserCog },
    { label: 'مراجعة المستندات', href: '/admin/documents', icon: FileCheck2 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">نظرة عامة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ملخص أداء منصة تكليفات | Takleefat — الحسابات والتكليفات والمستندات
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                    <p className="mt-1 text-3xl font-extrabold">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                  </div>
                  <span className={`rounded-xl p-2.5 ${card.color}`}>
                    <card.icon className="size-5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Button key={action.label} variant="outline" asChild className="h-auto justify-start gap-2 py-3">
              <Link href={action.href}>
                <action.icon className="size-4 text-primary" />
                {action.label}
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">حالة التكليفات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'جاري', value: data?.activeAssignments ?? 0, cls: 'bg-teal-500' },
              { label: 'تم الاستلام', value: data?.receivedAssignments ?? 0, cls: 'bg-cyan-500' },
              { label: 'مكتمل', value: data?.completedAssignments ?? 0, cls: 'bg-emerald-500' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className={`size-2.5 rounded-full ${row.cls}`} />
                <span className="flex-1 text-sm">{row.label}</span>
                <span className="text-sm font-extrabold">{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">حالة الحسابات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'كادر معتمد', value: data?.approvedNurses ?? 0, cls: 'bg-emerald-500' },
              { label: 'بانتظار الاعتماد', value: data?.pendingNurses ?? 0, cls: 'bg-amber-500' },
              { label: 'مستلمون إداريون', value: data?.totalReceivers ?? 0, cls: 'bg-cyan-500' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className={`size-2.5 rounded-full ${row.cls}`} />
                <span className="flex-1 text-sm">{row.label}</span>
                <span className="text-sm font-extrabold">{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-secondary/50">
          <CardContent className="flex h-full flex-col justify-center p-6 text-center">
            <p className="text-sm font-bold">منصة تكليفات | Takleefat</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              يعمل النظام بموافقة الإدارة: لا يمكن للكادر التمريضي استلام التكليفات قبل اعتماد
              حسابه ومراجعة مستنداته.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
