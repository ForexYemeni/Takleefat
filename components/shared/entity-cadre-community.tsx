'use client'

import { useState } from 'react'
import {
  Activity,
  BadgeCheck,
  Building2,
  MapPin,
  Stethoscope,
  Users,
  Eye,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StaffPhone, type StaffPhoneData } from '@/components/shared/staff-phone'
import { ORG_TYPE_LABELS, ORG_STATUS_LABELS } from '@/lib/network'
import { GENDER_LABELS } from '@/lib/utils'

/**
 * مجتمع كوادر الجهة الصحية — الجولة 38
 * =====================================================
 * كل جهة صحية لها مجتمع كوادر خاص بها: لوحة فاخرة بثلاث بطاقات إحصاء
 * (الممرضون المعتمدون / الأطباء المعتمدون / المتاحون الآن) تظهر للمسؤول
 * عن الجهة حسب صلاحياته، مع إمكانية استعراض أعضاء المجتمع (اختيارياً)
 * بشارات التوفر والارتباط والتقييم وأرقام التواصل وفق قواعد الخصوصية
 * (الإدارة كاملة — والمستلم/المشرف بقواعد السداد والموثوقية).
 */

export interface OrgCadreStatsView {
  accreditedNurses: number
  accreditedDoctors: number
  availableNow: number
}

export interface OrgCommunityInfo {
  name: string
  type?: string | null
  city?: string | null
  status?: string | null
}

export interface OrgCadreRow {
  id: string
  name: string
  role: string
  gender?: string | null
  specialty?: string | null
  qualification?: string | null
  yearsOfExperience?: number | null
  affiliationStatus: string
  affiliationStatusLabel: string
  workYears?: number | null
  available: boolean
  ratingAverage?: number | null
  ratingCount?: number | null
  phone: string | null
  phoneMasked: string
  phoneLocked: boolean
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  pulse = false,
}: {
  icon: typeof Users
  label: string
  value: number
  tone: 'nurse' | 'doctor' | 'available'
  pulse?: boolean
}) {
  const tones = {
    nurse: 'from-teal-500/10 to-teal-500/5 text-teal-700 dark:text-teal-300 border-teal-200/70 dark:border-teal-900/60',
    doctor: 'from-violet-500/10 to-violet-500/5 text-violet-700 dark:text-violet-300 border-violet-200/70 dark:border-violet-900/60',
    available:
      'from-emerald-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-900/60',
  } as const
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-gradient-to-br p-4 ${tones[tone]}`}
    >
      <span className="rounded-xl bg-background/70 p-2.5 shadow-sm">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold leading-tight text-muted-foreground">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-2xl font-black tabular-nums tracking-tight">
          {value.toLocaleString('ar-EG')}
          {pulse && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

export function EntityCadreCommunity({
  org,
  stats,
  cadres,
  className = '',
}: {
  org: OrgCommunityInfo | null
  stats: OrgCadreStatsView
  /** قائمة أعضاء المجتمع — عند تمريرها يظهر زر «استعراض الكوادر» */
  cadres?: OrgCadreRow[]
  className?: string
}) {
  const [browseOpen, setBrowseOpen] = useState(false)
  const total = stats.accreditedNurses + stats.accreditedDoctors

  return (
    <section
      className={`overflow-hidden rounded-3xl border bg-card shadow-sm ${className}`}
      aria-label="مجتمع كوادر الجهة الصحية"
    >
      {/* ترويسة الجهة */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-2xl bg-primary/10 p-2.5 text-primary">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold leading-tight">
              {org?.name ?? 'مجتمع كوادر الجهة الصحية'}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {org?.type && <span>{ORG_TYPE_LABELS[org.type] ?? org.type}</span>}
              {org?.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {org.city}
                </span>
              )}
              {org?.status && <span>• {ORG_STATUS_LABELS[org.status] ?? org.status}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 bg-primary/10 text-primary">
            <Users className="size-3.5" />
            {total.toLocaleString('ar-EG')} كوادر معتمدين
          </Badge>
          {cadres && cadres.length > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBrowseOpen(true)}>
              <Eye className="size-3.5" />
              استعراض الكوادر
            </Button>
          )}
        </div>
      </div>

      {/* بطاقات الإحصاء الثلاث */}
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <StatCard icon={Users} label="الممرضون المعتمدون" value={stats.accreditedNurses} tone="nurse" />
        <StatCard icon={Stethoscope} label="الأطباء المعتمدون" value={stats.accreditedDoctors} tone="doctor" />
        <StatCard
          icon={Activity}
          label="المتاحون الآن"
          value={stats.availableNow}
          tone="available"
          pulse={stats.availableNow > 0}
        />
      </div>

      {/* حوار استعراض أعضاء المجتمع */}
      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              كوادر {org?.name ?? 'الجهة'} — {total.toLocaleString('ar-EG')} معتمد
            </DialogTitle>
            <DialogDescription>
              مجتمع الكوادر المعتمدين للجهة: الممرضون والأطباء الحاصلون على ارتباط (يعمل حالياً /
              معتمد) بحسابات معتمدة من الإدارة — شارة «متاح الآن» تعني عدم وجود تكليف سارٍ عليهم.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[55vh] gap-2 overflow-y-auto pe-1">
            {cadres?.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl border p-3.5">
                <span
                  className={`rounded-xl p-2.5 ${c.role === 'DOCTOR' ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-teal-500/10 text-teal-700 dark:text-teal-300'}`}
                >
                  {c.role === 'DOCTOR' ? <Stethoscope className="size-5" /> : <Users className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                    {c.name}
                    {c.available ? (
                      <Badge className="gap-1 bg-emerald-500 text-white">
                        <Activity className="size-3" />
                        متاح الآن
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-400">
                        في تكليف حالياً
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{c.role === 'DOCTOR' ? 'طبيب' : 'كادر تمريضي'}</span>
                    {c.gender && <span>{GENDER_LABELS[c.gender] ?? c.gender}</span>}
                    {c.specialty && <span>{c.specialty}</span>}
                    {c.yearsOfExperience != null && c.yearsOfExperience > 0 && (
                      <span>{c.yearsOfExperience} سنة خبرة</span>
                    )}
                    {c.workYears != null && c.workYears > 0 && <span>{c.workYears} سنة بالجهة</span>}
                    <span className="flex items-center gap-1">
                      <BadgeCheck className="size-3" />
                      {c.affiliationStatusLabel}
                    </span>
                    {(c.ratingCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                        {c.ratingAverage?.toFixed(1)} ({c.ratingCount})
                      </span>
                    )}
                  </p>
                </div>
                <StaffPhone data={c as StaffPhoneData} personName={c.name} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
