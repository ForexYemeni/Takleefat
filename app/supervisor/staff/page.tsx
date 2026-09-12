'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Building2,
  Check,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  Hourglass,
  IdCard,
  Lock,
  PhoneIcon,
  Repeat,
  ShieldAlert,
  ShieldQuestion,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { apiFetcher, apiPatch, apiPost, apiDelete } from '@/lib/api-client'
import { formatDate, GENDER_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { AFFILIATION_STATUS_LABELS, ORG_CADRE_STATUS_OPTIONS } from '@/lib/network'
import {
  createDoctorSchema,
  type CreateDoctorInput,
  type CreateDoctorFormValues,
} from '@/lib/validations/user'
const DOCTOR_QUALIFICATION_OPTIONS = [
  { value: 'بكالوريوس طب وجراحة', label: 'بكالوريوس طب وجراحة' },
  { value: 'ماجستير', label: 'ماجستير' },
  { value: 'دكتوراه', label: 'دكتوراه' },
  { value: 'شهادة زمالة', label: 'شهادة زمالة' },
]
import { zodResolver } from '@hookform/resolvers/zod'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { FavoriteStar } from '@/components/shared/favorite-star'
import { FullProfileDialog } from '@/components/shared/full-profile-dialog'
import { StaffPhone, type StaffPhoneData } from '@/components/shared/staff-phone'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ProfessionalAccreditationBadge } from '@/components/shared/professional-accreditation-badge'
import {
  EntityCadreCommunity,
  type OrgCadreStatsView,
} from '@/components/shared/entity-cadre-community'
import { WorkforceDirectory } from '@/components/shared/workforce-directory'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * أطباء جهتي + قائمة أطباء المنصة — مشرف الأطباء يضيف أطباء (الجولة 34):
 * - الجهة الصحية **ليست شرطاً** — الطبيب يُضاف للقائمة العامة لأطباء المنصة
 * - وإن وُجدت جهة مرتبطة بحساب المشرف فيُربط بها أيضاً (تظهر في «أطباء جهتي»)
 * - يظهر الطبيب المضاف فوراً في حساب الإدارة
 * - لا يستقبل أي تكليف أو إجراء قبل اعتماده من الإدارة ورفع مستنداته إجبارياً دون استثناء
 *
 * الجولة 39 — اعتماد الجهة + الاعتماد المهني:
 * - مشرف الأطباء يعتمد الأطباء لجهته (إضافتهم لمجتمع كوادر الجهة فقط)
 * - الاعتماد المهني (كطبيب معتمد) من حساب الإدارة حصراً بعد رفع
 *   المستندات والموافقة عليها — شارة «معتمد من الإدارة» تبيّن ذلك لكل طبيب
 */

interface StaffNurse {
  affiliationId: string
  affiliationStatus: string
  affiliationStatusLabel: string
  requestedStatus: string | null
  workYears: number | null
  createdAt: string
  isFavorite: boolean
  /** الجولة 38: متاح الآن = بلا تكليف سارٍ */
  available?: boolean
  /** الجولة 39: عدد المستندات المعتمدة من الإدارة — الاعتماد المهني */
  approvedDocuments?: number
  /** الجولة 40: طلب انضمام ذاتي من طبيب (PENDING وقد طلبه بنفسه) */
  isJoinRequest?: boolean
  /** الجولة 40: نوع العمل الذي طلبه الطبيب (يعمل حالياً/عمل سابقاً) */
  requestedStatusLabel?: string | null
  /** الجولة 40: ملاحظة الطبيب مع طلبه */
  joinNote?: string | null
  nurse: {
    id: string
    name: string
    /** الجولة 39: دور العضو — المشرف يعتمد الأطباء حصراً */
    role: string
    /** الجولة 34: الرقم الكامل يصل فقط لمن تحقق شرط السداد — وإلا null */
    phone: string | null
    phoneMasked: string
    phoneLocked: boolean
    gender: string | null
    specialty: string | null
    qualification: string | null
    yearsOfExperience: number | null
    status: string
    _count: { documents: number }
  }
}

export default function ReceiverStaffPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [details, setDetails] = useState<StaffNurse | null>(null)
  // السيرة الذاتية الكاملة — تظهر فقط لمن مُنحه حساب الإدارة الإذن (الجولة 32)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  // الجولة 33: تبويب دليل المنصة الكامل — يظهر عند توفر الإذن
  const [view, setView] = useState<'org' | 'all'>('org')

  // كتالوج المؤهلات العلمية من حساب الإدارة — القوائم التاريخية احتياط
  const [qualOptions, setQualOptions] = useState<readonly { value: string; label: string }[]>(DOCTOR_QUALIFICATION_OPTIONS)

  useEffect(() => {
    fetch('/api/qualifications/public?audience=DOCTOR')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.qualifications ?? []).map((q: { name: string }) => ({ value: q.name, label: q.name }))
        if (list.length > 0) setQualOptions(list)
      })
      .catch(() => null)
  }, [])

  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const { data, isLoading } = useQuery({
    queryKey: ['receiver-staff', selectedOrgId],
    queryFn: () =>
      apiFetcher<{
        org: { id: string; name: string; city: string | null; status: string } | null
        /** الجولة 44: كل جهات المسؤول — لمبدّل الجهات */
        orgs?: Array<{ id: string; name: string; city: string | null; status: string }>
        nurses: StaffNurse[]
        fullProfileAccess?: boolean
        /** الجولة 38: مجتمع كوادر الجهة الصحية */
        community?: OrgCadreStatsView
      }>(`/api/receiver/staff${selectedOrgId ? `?orgId=${selectedOrgId}` : ''}`),
  })

  /** الجولة 44: مبدّل الجهات — يظهر عندما تكون للمسؤول جهات متعددة */
  const myOrgs = data?.orgs ?? []
  useEffect(() => {
    if (myOrgs.length > 0 && !myOrgs.some((o) => o.id === selectedOrgId)) {
      setSelectedOrgId(myOrgs[0].id)
    }
  }, [myOrgs.length])

  /** إذن رؤية البيانات الكاملة — يفتحه حساب الإدارة حصراً (الجولة 32) */

  // الجولة 31: التخصص الطبي للطبيب يُختار حصراً من كتالوج التخصصات المُدار من الإدارة
  const { data: specialtiesData } = useQuery({
    queryKey: ['specialties-public'],
    queryFn: () =>
      apiFetcher<{ specialties: Array<{ id: string; name: string }> }>('/api/specialties/public'),
  })
  const catalogSpecialties = specialtiesData?.specialties ?? []

  const createForm = useForm<CreateDoctorFormValues, unknown, CreateDoctorInput>({
    resolver: zodResolver(createDoctorSchema),
    defaultValues: {
      name: '',
      phone: '',
      password: '',
      gender: undefined,
      qualification: undefined,
      specialty: '',
      yearsOfExperience: undefined,
    } as unknown as CreateDoctorFormValues,
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateDoctorInput) =>
      apiPost<{ message: string }>('/api/receiver/staff', {
        ...values,
        yearsOfExperience: values.yearsOfExperience ?? 0,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['receiver-staff'] })
      setCreateOpen(false)
      createForm.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ---------- الجولة 43: مدير تحويل حالة العضو بعد القبول ----------
  // يعمل حالياً / يعمل سابقاً / تحت الإستدعاء / معتمد / تمت المقابلة معه — في أي وقت
  const [statusEditing, setStatusEditing] = useState<StaffNurse | null>(null)
  const [editStatus, setEditStatus] = useState<string>('ENDORSED')

  const statusMutation = useMutation({
    mutationFn: ({ affiliationId, status }: { affiliationId: string; status: string }) =>
      apiPatch<{ message: string }>(`/api/affiliations/${affiliationId}`, { status }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['receiver-staff'] })
      queryClient.invalidateQueries({ queryKey: ['org-community'] })
      setStatusEditing(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ---------- الجولة 42: قبول طلب انضمام الطبيب بحالة يختارها مشرف الأطباء ----------
  // معتمد / يعمل حالياً / يعمل سابقاً / تحت الإستدعاء / تمت المقابلة معه
  const [accepting, setAccepting] = useState<StaffNurse | null>(null)
  const [acceptStatus, setAcceptStatus] = useState<string>('ENDORSED')

  const acceptJoinMutation = useMutation({
    mutationFn: ({ affiliationId, status }: { affiliationId: string; status: string }) =>
      apiPatch<{ message: string }>(`/api/affiliations/${affiliationId}`, { status }),
    onSuccess: (res, { status }) => {
      toast.success(
        status === 'ENDORSED'
          ? res.message
          : `${res.message} — سيُحتسب ضمن المعتمدين بعد اعتماد حسابه ورفع مستنداته من الإدارة`,
        { duration: 6000 }
      )
      queryClient.invalidateQueries({ queryKey: ['receiver-staff'] })
      queryClient.invalidateQueries({ queryKey: ['org-community'] })
      setAccepting(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ---------- الجولة 40: رفض طلب الانضمام (إزالة الطلب مع إشعار الطبيب) ----------
  const [rejecting, setRejecting] = useState<StaffNurse | null>(null)
  const rejectJoinMutation = useMutation({
    mutationFn: (affiliationId: string) =>
      apiDelete<{ message: string }>(`/api/affiliations/${affiliationId}`),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['receiver-staff'] })
      queryClient.invalidateQueries({ queryKey: ['org-community'] })
      setRejecting(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const org = data?.org
  const nurses = data?.nurses ?? []
  const orgPending = org?.status === 'PENDING'
  // الجولة 40: فصل طلبات انضمام الأطباء عن صفوف الكوادر — قرار قبول/رفض صريح
  // المشرف يعتمد الأطباء حصراً، وطلبات الكادر التمريضي من اختصاص المستلم (الجولة 39)
  const joinRequests = nurses.filter((n) => n.isJoinRequest && n.nurse.role === 'DOCTOR')
  const staffRows = nurses.filter((n) => !(n.isJoinRequest && n.nurse.role === 'DOCTOR'))

  if (isLoading) return <DashboardSkeleton />

  const pendingCount = staffRows.filter((n) => n.nurse.status === 'PENDING').length

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">أطباء جهتي</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-4 text-primary" />
            {org ? (
              <>
                الأطباء الخاصون بجهة <span className="font-bold text-foreground">{org.name}</span>
                {org.city ? ` — ${org.city}` : ''}
              </>
            ) : (
              'لا توجد جهة صحية مرتبطة بحسابك بعد'
            )}
          </p>
          {/* الجولة 44: مبدّل الجهات — للمسؤول الذي يدير أكثر من جهة صحية */}
          {myOrgs.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {myOrgs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOrgId(o.id)}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                    org?.id === o.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <Building2 className="size-3" />
                  {o.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {org && (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-2">
            <UserPlus className="size-4" />
            إضافة طبيب للجهة
          </Button>
        )}
      </div>

      {/* ---------- الجولة 38: مجتمع كوادر الجهة الصحية ---------- */}
      {org && (
        <EntityCadreCommunity
          org={{ name: org.name, city: org.city, status: org.status }}
          stats={data.community ?? { accreditedNurses: 0, accreditedDoctors: 0, availableNow: 0 }}
        />
      )}

      {/* ---------- الجولة 40: طلبات انضمام أطباء إلى جهتك — قرار قبول/رفض صريح ---------- */}
      {org && joinRequests.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 bg-sky-100/60 px-4 py-3 dark:border-sky-900/60 dark:bg-sky-900/30">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-sky-900 dark:text-sky-200">
              <Hourglass className="size-4" />
              طلبات انضمام أطباء إلى جهتك
              <Badge className="bg-sky-600 text-white">{joinRequests.length}</Badge>
            </h2>
            <p className="text-[11px] text-muted-foreground">
              أطباء يطلبون إضافة أنفسهم لجهتك — القبول يضيفهم لمجتمع كوادر الجهة فقط،
              واعتمادهم المهني يبقى من الإدارة بعد المستندات
            </p>
          </div>
          <div className="grid gap-2 p-3">
            {joinRequests.map((n) => (
              /* الجولة 41: بطاقة كتلية — الإجراءات في سطر مستقل يلتف ولا يفيض أفقياً */
              <div
                key={n.affiliationId}
                className="rounded-2xl border bg-background p-3.5"
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0 rounded-xl bg-sky-100 p-2.5 dark:bg-sky-900/40">
                    <UserPlus className="size-5 text-sky-700 dark:text-sky-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-extrabold">
                      <span className="max-w-full truncate">{n.nurse.name}</span>
                      <StatusBadge status={n.nurse.status} labels={USER_STATUS_LABELS} />
                      {n.requestedStatusLabel && (
                        <Badge variant="outline" className="text-[10px]">
                          يطلب: {n.requestedStatusLabel}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <StaffPhone data={n.nurse as StaffPhoneData} personName={n.nurse.name} />
                      {n.nurse.specialty && (
                        <span className="max-w-[10rem] truncate">{n.nurse.specialty}</span>
                      )}
                      {n.nurse.yearsOfExperience != null && n.nurse.yearsOfExperience > 0 && (
                        <span>{n.nurse.yearsOfExperience} سنة خبرة</span>
                      )}
                      <span>قدّم الطلب {formatDate(n.createdAt)}</span>
                    </p>
                    {n.joinNote && (
                      <p className="mt-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                        «{n.joinNote}»
                      </p>
                    )}
                  </div>
                </div>
                {/* الإجراءات — سطر مستقل يلتف دائماً (الجولة 41) */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    disabled={acceptJoinMutation.isPending}
                    onClick={() => {
                      setAcceptStatus('ENDORSED')
                      setAccepting(n)
                    }}
                  >
                    <Check className="size-3.5" />
                    قبول الطلب
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-red-300 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                    disabled={rejectJoinMutation.isPending}
                    onClick={() => setRejecting(n)}
                  >
                    <X className="size-3.5" />
                    رفض الطلب
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setDetails(n)}
                  >
                    <Eye className="size-3.5" />
                    عرض
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* تنبيه حالة الجهة: بانتظار الاعتماد */}
      {orgPending && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <Building2 className="size-5 shrink-0" />
          <p className="leading-relaxed">
            جهتك الصحية <span className="font-bold">({org?.name})</span> بانتظار اعتماد الإدارة —
            عند اعتمادها ستُعتمد ارتباطات أطباء الجهة تلقائياً، ويبقى اعتماد حساب كل طبيب
            ورفع مستنداته لدى الإدارة شرطاً لاستقبال التكليفات.
          </p>
        </div>
      )}

      {/* تنبيه الحاجز: لا تكليفات قبل الاعتماد والمستندات */}
      {org && !orgPending && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <ShieldAlert className="size-5 shrink-0" />
          <p className="leading-relaxed">
            الأطباء المضافة هنا تظهر مباشرة في حساب الإدارة — ولا يستقبل أي طبيب أي تكليف أو إجراء
            قبل <span className="font-bold">اعتماده من الإدارة ورفع مستنداته</span>
            {pendingCount > 0 && (
              <Badge className="ms-2 bg-amber-500 text-white">
                {pendingCount} بانتظار الاعتماد
              </Badge>
            )}
          </p>
        </div>
      )}

      {/* ---------- الجولة 33/46: تبويبات «أطباء جهتي» / «كل الأطباء» — ظاهرة دائماً ----------
          البلاغ الحرفي: «لا تظهر في قسم كوادر جهتي تبويب الكوادر في المنصة
          الا اذا يوجد كوادر جهتي» — التبويبان يظهران الآن دائماً حتى لو كانت
          قائمة أطباء الجهة فارغة أو بلا جهة مرتبطة بعد */}
      <Tabs value={view} onValueChange={(v) => setView(v as 'org' | 'all')}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="org" className="gap-1.5">
            <Building2 className="size-3.5" />
            أطباء جهتي
            <span className="text-xs text-muted-foreground">{staffRows.length}</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5 text-indigo-700 dark:text-indigo-400">
            <Globe2 className="size-3.5" />
            كل الأطباء في المنصة
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'all' ? (
        <WorkforceDirectory audience="DOCTOR" />
      ) : !org ? (
        <EmptyState
          icon={Building2}
          title="لا توجد جهة صحية مرتبطة بحسابك"
          description="إذا كانت جهتك جديدة فبانتظار اعتمادها من الإدارة — وإذا كانت قائمة يرجى مراجعة الإدارة لربطها بحسابك."
        />
      ) : staffRows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={joinRequests.length > 0 ? 'لا يوجد أطباء معتمدين بعد — راجع طلبات الانضمام أعلاه' : 'لا يوجد أطباء في جهتك بعد'}
          description="أضف الأطباء الخاصين بجهتك الصحية — سيراهم حساب الإدارة مباشرة ويعتمدهم بعد مراجعة مستنداتهم."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <UserPlus className="size-4" />
              إضافة طبيب للجهة
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2">
          {staffRows.map((n) => (
            /* الجولة 41: صف كتلي لا يفيض أفقياً أبداً — الهوية أعلى والإجراءات
                أسفل في سطر مستقل يلتف (كانت الإجراءات متراكبة تفيض عن الشاشة
                على الهاتف فتبدو المنصة مكسورة بعد القبول) */
            <div key={n.affiliationId} className="rounded-2xl border p-3.5">
              <div className="flex items-start gap-3">
                <span className="shrink-0 rounded-xl bg-secondary p-2.5">
                  <Users className="size-5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-extrabold">
                    <span className="max-w-full truncate">{n.nurse.name}</span>
                    <StatusBadge status={n.nurse.status} labels={USER_STATUS_LABELS} />
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <StaffPhone data={n.nurse as StaffPhoneData} personName={n.nurse.name} />
                    {n.nurse.gender && <span>{GENDER_LABELS[n.nurse.gender] ?? n.nurse.gender}</span>}
                    {n.nurse.specialty && (
                      <span className="max-w-[10rem] truncate">{n.nurse.specialty}</span>
                    )}
                    {n.nurse.yearsOfExperience != null && n.nurse.yearsOfExperience > 0 && (
                      <span>{n.nurse.yearsOfExperience} سنة خبرة</span>
                    )}
                    <span className="flex items-center gap-1">
                      <FileText className="size-3" />
                      {n.nurse._count.documents} مستند
                    </span>
                    <span>أُضيف {formatDate(n.createdAt)}</span>
                  </p>
                  {/* شارات الحالة — سطر مستقل يلتف ولا يفيض */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {n.available != null &&
                      (n.available ? (
                        <Badge className="gap-1 bg-emerald-500 text-white">متاح الآن</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-amber-700 dark:text-amber-400"
                        >
                          في تكليف
                        </Badge>
                      ))}
                    {/* الجولة 39: الاعتماد المهني من الإدارة حصراً — لا يمنحه اعتماد الجهة */}
                    <ProfessionalAccreditationBadge
                      approvedDocuments={n.approvedDocuments ?? 0}
                      documentsCount={n.nurse._count.documents}
                      size="sm"
                    />
                    <Badge variant="outline">{n.affiliationStatusLabel}</Badge>
                  </div>
                </div>
              </div>
              {/* الإجراءات — سطر مستقل يلتف دائماً (الجولة 41) */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5">
                <FavoriteStar
                  nurseId={n.nurse.id}
                  isFavorite={n.isFavorite}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ['receiver-staff'] })}
                />
                {/* الجولة 43: مدير تحويل حالة العضو — من محل اعتماد الجولة 39
                    (يعمل حالياً / يعمل سابقاً / تحت الإستدعاء / معتمد / تمت مقابلته) */}
                {n.nurse.role === 'DOCTOR' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={statusMutation.isPending}
                    onClick={() => {
                      setEditStatus(
                        ORG_CADRE_STATUS_OPTIONS.some((o) => o.value === n.affiliationStatus)
                          ? n.affiliationStatus
                          : 'ENDORSED'
                      )
                      setStatusEditing(n)
                    }}
                  >
                    <Repeat className="size-3.5" />
                    تغيير حالة العمل
                  </Button>
                )}
                {/* الجولة 46: السيرة الذاتية متاحة لكل المشرفين — المستندات تُدار من الخادم */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
                  onClick={() => {
                    setProfileUserId(n.nurse.id)
                    setProfileOpen(true)
                  }}
                >
                  <IdCard className="size-3.5" />
                  السيرة الذاتية
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setDetails(n)}
                >
                  <Eye className="size-3.5" />
                  عرض
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- حوار إضافة ممرض للجهة ---------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              {org ? `إضافة طبيب — للقائمة العامة وجهة ${org.name}` : 'إضافة طبيب — للقائمة العامة لأطباء المنصة'}
            </DialogTitle>
            <DialogDescription>
              {org
                ? 'يُضاف الطبيب إلى قائمة أطباء المنصة ويُربط أيضاً بجهتك الصحية — الحساب يُنشأ بحالة «قيد المراجعة» ويظهر فوراً في حساب الإدارة.'
                : 'يُضاف الطبيب إلى قائمة أطباء المنصة مباشرة بلا حاجة لجهة صحية — الحساب يُنشأ بحالة «قيد المراجعة» ويظهر فوراً في حساب الإدارة.'}{' '}
              لن يستقبل أي تكليف قبل اعتماده من الإدارة ورفعه مستنداته إجبارياً دون استثناء. أبلغ الطبيب رقم هاتفه وكلمة المرور لتسجيل الدخول.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
            className="space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-first">الاسم *</Label>
                <Input id="staff-first" placeholder="مثال: محمد" {...createForm.register('name')} />
                {createForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-phone">رقم الهاتف *</Label>
                <div className="relative">
                  <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="staff-phone"
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={9}
                    placeholder="7xxxxxxxx"
                    className="ps-10 text-start"
                    {...createForm.register('phone')}
                  />
                </div>
                {createForm.formState.errors.phone && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>الجنس *</Label>
                <Select
                  value={createForm.watch('gender') ?? ''}
                  onValueChange={(v) => createForm.setValue('gender', v as 'MALE' | 'FEMALE')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الجنس" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">ذكر</SelectItem>
                    <SelectItem value="FEMALE">أنثى</SelectItem>
                  </SelectContent>
                </Select>
                {createForm.formState.errors.gender && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.gender.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>المؤهل العلمي *</Label>
                <Select
                  value={createForm.watch('qualification') ?? ''}
                  onValueChange={(v) => createForm.setValue('qualification', v as never)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المؤهل" />
                  </SelectTrigger>
                  <SelectContent>
                    {qualOptions.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.formState.errors.qualification && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.qualification.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>التخصص الطبي — من كتالوج الإدارة *</Label>
                {/* الجولة 31: منتقي التخصص من كتالوج التخصصات الطبية — لا تخصصات حرة */}
                <Select
                  value={createForm.watch('specialty') || ''}
                  onValueChange={(v) => createForm.setValue('specialty', v, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التخصص الطبي من القائمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogSpecialties.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        لا توجد تخصصات في الكتالوج — راجع الإدارة
                      </div>
                    ) : (
                      catalogSpecialties.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {createForm.formState.errors.specialty && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.specialty.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-exp">سنوات الخبرة *</Label>
                <Input
                  id="staff-exp"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  placeholder="مثال: 5 — أو 0 للمتخرج الجديد"
                  {...createForm.register('yearsOfExperience')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-password">كلمة المرور *</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="staff-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="8 أحرف على الأقل مع حروف وأرقام"
                  className="ps-10 pe-10"
                  {...createForm.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                <UserPlus className="size-4" />
                {createMutation.isPending ? 'جارٍ الإضافة...' : 'إضافة الممرض'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- حوار تفاصيل الطبيب ---------- */}
      <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>بيانات الطبيب</DialogTitle>
            <DialogDescription>الحالة في الجهة والتقدم للاعتماد</DialogDescription>
          </DialogHeader>
          {details && (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">الاسم</p>
                  <p className="font-bold">{details.nurse.name}</p>
                </div>
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">رقم التواصل</p>
                  <div className="mt-1">
                    <StaffPhone data={details.nurse as StaffPhoneData} personName={details.nurse.name} />
                  </div>
                </div>
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">المؤهل</p>
                  <p className="font-bold">{details.nurse.qualification ?? '—'}</p>
                </div>
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">التخصص</p>
                  <p className="font-bold">{details.nurse.specialty ?? '—'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                <span className="text-muted-foreground">حالة الحساب:</span>
                <StatusBadge status={details.nurse.status} labels={USER_STATUS_LABELS} />
                <span className="text-muted-foreground">— الارتباط بالجهة:</span>
                <Badge variant="outline">{details.affiliationStatusLabel}</Badge>
              </div>
              {orgPending && details.affiliationStatus === 'PENDING' && (
                <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <Building2 className="mt-0.5 size-4 shrink-0" />
                  الارتباط قيد المراجعة لأن الجهة الصحية نفسها بانتظار اعتماد الإدارة —
                  سيُعتمد تلقائياً مع اعتماد الجهة دون أي إجراء إضافي.
                </p>
              )}
              {/* الجولة 40: تفاصيل طلب الانضمام — ملاحظة الطبيب ونوع العمل المطلوب */}
              {details.isJoinRequest && (
                <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <p className="flex items-start gap-2">
                    <Hourglass className="mt-0.5 size-4 shrink-0" />
                    هذا <span className="font-bold">طلب انضمام ذاتي</span> قدّمه الطبيب بنفسه —
                    القبول والرفض من قسم «طلبات الانضمام» في الأعلى، والقبول يضيفه لكوادر
                    الجهة فقط دون الاعتماد المهني (من الإدارة بعد المستندات).
                  </p>
                  {details.requestedStatusLabel && (
                    <p>نوع العمل المطلوب: <span className="font-bold">{details.requestedStatusLabel}</span></p>
                  )}
                  {details.joinNote && <p>ملاحظة الطبيب: «{details.joinNote}»</p>}
                </div>
              )}
              {details.nurse.status === 'PENDING' && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0" />
                  الطبيب بانتظار اعتماد الإدارة — يجب أن يرفع مستنداته (الهوية وصورة المزاولة) من
                  حسابه أولاً، ثم تعتمده الإدارة ليصبح جاهزاً لاستقبال التكليفات.
                </p>
              )}
              {/* الجولة 39: الاعتماد المهني — مستويان واضحان */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                <ShieldQuestion className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">الاعتماد المهني:</span>
                <ProfessionalAccreditationBadge
                  approvedDocuments={details.approvedDocuments ?? 0}
                  documentsCount={details.nurse._count.documents}
                />
                <span className="text-xs text-muted-foreground">
                  يُمنح من حساب الإدارة حصراً بعد رفع المستندات والموافقة عليها — واعتماد الجهة
                  يضيف الطبيب لمجتمع كوادر الجهة فقط.
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- الجولة 43: مدير تحويل حالة العضو (سابقاً/حالياً/استدعاء/معتمد/مقابلة) ---------- */}
      <Dialog open={!!statusEditing} onOpenChange={(open) => !open && setStatusEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="size-4 text-primary" />
              تغيير حالة العمل — ({statusEditing?.nurse.name})
            </DialogTitle>
            <DialogDescription>
              حوّل حالة الطبيب في جهة ({org?.name}) بين الحالات المهنية الخمس في أي وقت —
              الحالة الحالية معلَّمة، والحالات الإدارية تبقى من حساب الإدارة حصراً.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2" role="radiogroup" aria-label="تحويل حالة الطبيب في الجهة">
            {ORG_CADRE_STATUS_OPTIONS.map((opt) => {
              const selected = editStatus === opt.value
              const isCurrent = statusEditing?.affiliationStatus === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setEditStatus(opt.value)}
                  className={`flex items-start gap-3 rounded-2xl border p-3 text-start transition-colors ${
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary dark:bg-primary/10'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? 'border-primary' : 'border-muted-foreground/40'
                    }`}
                  >
                    {selected && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold">
                      {opt.label}
                      {isCurrent && (
                        <Badge className="bg-primary text-[10px] text-primary-foreground">الحالة الحالية</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusEditing(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              disabled={statusMutation.isPending || editStatus === statusEditing?.affiliationStatus}
              className="gap-2"
              onClick={() =>
                statusEditing &&
                statusMutation.mutate({ affiliationId: statusEditing.affiliationId, status: editStatus })
              }
            >
              <Repeat className="size-4" />
              {statusMutation.isPending
                ? 'جارٍ التحويل...'
                : `تحويل الحالة إلى: ${ORG_CADRE_STATUS_OPTIONS.find((o) => o.value === editStatus)?.label ?? ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- الجولة 42: قبول طلب الانضمام مع اختيار حالة الطبيب في الجهة ---------- */}
      <Dialog open={!!accepting} onOpenChange={(open) => !open && setAccepting(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-emerald-600" />
              قبول طلب انضمام ({accepting?.nurse.name})
            </DialogTitle>
            <DialogDescription>
              اختر حالة الطبيب في جهة ({org?.name}) عند قبوله — كل الخيارات تضيفه لكوادر الجهة
              بحسب حالته، واعتماده المهني يبقى من حساب الإدارة بعد المستندات.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2" role="radiogroup" aria-label="حالة الطبيب في الجهة">
            {ORG_CADRE_STATUS_OPTIONS.map((opt) => {
              const selected = acceptStatus === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAcceptStatus(opt.value)}
                  className={`flex items-start gap-3 rounded-2xl border p-3 text-start transition-colors ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-950/40'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? 'border-emerald-600' : 'border-muted-foreground/40'
                    }`}
                  >
                    {selected && <span className="size-2 rounded-full bg-emerald-600" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAccepting(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              disabled={acceptJoinMutation.isPending}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() =>
                accepting &&
                acceptJoinMutation.mutate({ affiliationId: accepting.affiliationId, status: acceptStatus })
              }
            >
              <Check className="size-4" />
              {acceptJoinMutation.isPending
                ? 'جارٍ القبول...'
                : `قبول وإضافة للجهة (${ORG_CADRE_STATUS_OPTIONS.find((o) => o.value === acceptStatus)?.label ?? ''})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- الجولة 40: تأكيد رفض طلب انضمام طبيب ---------- */}
      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(open) => !open && setRejecting(null)}
        tone="warning"
        icon={X}
        title={`رفض طلب انضمام (${rejecting?.nurse.name})`}
        description="سيُحذف طلب الانضمام نهائياً من طلبات جهتك ويصله إشعار بالرفض — إن أراد التقديم مجدداً فيمكنه ذلك في أي وقت."
        confirmLabel="نعم، ارفض الطلب"
        processing={rejectJoinMutation.isPending}
        onConfirm={() => rejecting && rejectJoinMutation.mutate(rejecting.affiliationId)}
      />

      {/* ---------- السيرة الذاتية الكاملة — لمن مُنح الإذن من الإدارة (الجولة 32) ---------- */}
      <FullProfileDialog
        userId={profileUserId}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  )
}
