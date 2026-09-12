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
import { ProfessionalAccreditationBadge } from '@/components/shared/professional-accreditation-badge'
import { ORG_TYPE_LABELS, ORG_STATUS_LABELS } from '@/lib/network'
import { GENDER_LABELS } from '@/lib/utils'

/**
 * مجتمع كوادر الجهة الصحية — الجولة 38
 * =====================================================
 * كل جهة صحية لها مجتمع كوادر خاص بها: لوحة إحصاء (الممرضون المعتمدون /
 * الأطباء المعتمدون / المتاحون الآن) تظهر للمسؤول عن الجهة حسب صلاحياته،
 * مع إمكانية استعراض أعضاء المجتمع (اختيارياً) بشارات التوفر والارتباط
 * والتقييم وأرقام التواصل وفق قواعد الخصوصية.
 *
 * الجولة 39: شارة الاعتماد المهني «معتمد من الإدارة» لكل عضو — لا يُمنح
 * الاعتماد المهني (كطبيب/ككادر طبي) إلا برفع المستندات والموافقة عليها
 * من حساب الإدارة، واعتماد الجهة من المستلم/المشرف يضيف للجهة فقط.
 *
 * الجولة 41 — التصغير الاحترافي (بلاغ: «يجب أن تجعل بطاقة كوادر جهتي مصغرة
 * حتى لا يحدث خلل في التطبيق»): كانت البطاقة ترويسة + ثلاث بطاقات إحصاء
 * مكدسة عمودياً على الهاتف (~390px) فتطغى على الصفحة كلها. صارت بطاقة
 * مصغّرة: صف واحد للجهة + شريط إحصاء أفقي بثلاث خلايا مدمجة (~96px على
 * الهاتف) — نفس البيانات والإجراءات، بأقل مساحة ممكنة، ولا تفيض أفقياً
 * أبداً في أي عرض شاشة.
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
  /** الجولة 39: عدد المستندات المعتمدة من الإدارة — شارة الاعتماد المهني */
  approvedDocuments?: number
  ratingAverage?: number | null
  ratingCount?: number | null
  phone: string | null
  phoneMasked: string
  phoneLocked: boolean
}

/** خلية إحصاء مدمجة — الجولة 41 (جزء من الشريط الأفقي المصغر) */
function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
  pulse = false,
  divided = false,
}: {
  icon: typeof Users
  label: string
  value: number
  tone: 'nurse' | 'doctor' | 'available'
  pulse?: boolean
  /** فاصل عمودي بين الخلايا (بداية الخلايا غير الأولى) */
  divided?: boolean
}) {
  const tones = {
    nurse: 'text-teal-600 dark:text-teal-400',
    doctor: 'text-violet-600 dark:text-violet-400',
    available: 'text-emerald-600 dark:text-emerald-400',
  } as const
  return (
    <div
      className={`flex min-w-0 items-center justify-center gap-2 px-2 py-2.5 ${
        divided ? 'border-s border-border/60' : ''
      }`}
    >
      <span className={`shrink-0 rounded-lg bg-muted/60 p-1.5 ${tones[tone]}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-base font-black leading-none tabular-nums">
          {value.toLocaleString('ar-EG')}
          {pulse && (
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
          )}
        </p>
        <p className="mt-1 truncate text-[10px] font-bold leading-none text-muted-foreground">
          {label}
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
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${className}`}
      aria-label="مجتمع كوادر الجهة الصحية"
    >
      {/* الصف المصغر: الجهة + زر الاستعراض — الجولة 41 */}
      <div className="flex min-w-0 items-center justify-between gap-2 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold leading-tight">
              {org?.name ?? 'مجتمع كوادر الجهة الصحية'}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[10px] leading-none text-muted-foreground">
              {org?.type && <span className="shrink-0">{ORG_TYPE_LABELS[org.type] ?? org.type}</span>}
              {org?.city && (
                <span className="flex min-w-0 items-center gap-0.5">
                  <MapPin className="size-2.5 shrink-0" />
                  <span className="truncate">{org.city}</span>
                </span>
              )}
              {org?.status && (
                <span className="shrink-0">• {ORG_STATUS_LABELS[org.status] ?? org.status}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="secondary" className="hidden gap-1 bg-primary/10 text-primary sm:flex">
            <Users className="size-3" />
            {total.toLocaleString('ar-EG')} معتمد
          </Badge>
          {cadres && cadres.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-[11px]"
              onClick={() => setBrowseOpen(true)}
            >
              <Eye className="size-3.5" />
              استعراض الكوادر
            </Button>
          )}
        </div>
      </div>

      {/* شريط الإحصاء الأفقي المصغر — ثلاث خلايا بفواصل عمودية */}
      <div className="grid grid-cols-3 border-t">
        <MiniStat icon={Users} label="ممرضون معتمدون" value={stats.accreditedNurses} tone="nurse" />
        <MiniStat
          icon={Stethoscope}
          label="أطباء معتمدون"
          value={stats.accreditedDoctors}
          tone="doctor"
          divided
        />
        <MiniStat
          icon={Activity}
          label="متاحون الآن"
          value={stats.availableNow}
          tone="available"
          pulse={stats.availableNow > 0}
          divided
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
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border p-3.5"
              >
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
                    {/* الجولة 39: شارة الاعتماد المهني — من الإدارة حصراً بعد المستندات */}
                    <ProfessionalAccreditationBadge
                      approvedDocuments={c.approvedDocuments ?? 0}
                      size="sm"
                    />
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
