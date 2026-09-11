'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Eye,
  FileCheck2,
  FileText,
  Search,
  Stethoscope,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDateTime, DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS, formatFileSize } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * مراجعة المستندات — بطاقات الكوادر (الجولة العاشرة):
 * بدل سرد كل مستند منفصلاً، تُعرض بطاقة احترافية لكل كادر باسمه،
 * وعند الضغط عليها تظهر جميع مستنداته المرفوعة مع أدوات الاعتماد والرفض.
 */

interface AdminDoc {
  id: string
  userId: string
  type: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  status: string
  reviewNote: string | null
  createdAt: string
  user: { id: string; name: string; phone: string; role: string; specialty: string | null; status: string }
}

interface DocOwner {
  user: AdminDoc['user']
  docs: AdminDoc[]
}

/** الجولة 33: ألوان وهوية كل جمهور — تيل للكادر التمريضي ونيلي للأطباء */
const AUDIENCE_UI = {
  NURSE: {
    label: 'كادر تمريضي',
    avatarClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    icon: Users,
  },
  DOCTOR: {
    label: 'طبيب',
    avatarClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    icon: Stethoscope,
  },
} as const

export default function AdminDocumentsPage() {
  const queryClient = useQueryClient()
  // الجولة 33: جلب دفعة واحدة + تصفية حية (الجمهور + الحالة + البحث) بعدادات فورية
  const [audience, setAudience] = useState('ALL')
  const [status, setStatus] = useState('PENDING')
  const [search, setSearch] = useState('')
  const [openUser, setOpenUser] = useState<DocOwner | null>(null)
  const [viewDoc, setViewDoc] = useState<AdminDoc | null>(null)
  const [rejectDoc, setRejectDoc] = useState<AdminDoc | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-documents', 'all'],
    queryFn: () => apiFetcher<{ documents: AdminDoc[] }>('/api/admin/documents?status=ALL'),
  })

  // كل مستندات الكادر المختار (كل الحالات) — لبطاقة «جميع المستندات المرفوعة»
  const { data: userData, isLoading: userDocsLoading } = useQuery({
    queryKey: ['admin-documents-user', openUser?.user.id],
    queryFn: () =>
      apiFetcher<{ documents: AdminDoc[] }>(`/api/admin/documents?userId=${openUser!.user.id}`),
    enabled: !!openUser,
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, newStatus, note }: { id: string; newStatus: string; note?: string }) =>
      apiPatch<{ message: string }>(`/api/admin/documents/${id}`, {
        status: newStatus,
        reviewNote: note ?? '',
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-documents'] })
      queryClient.invalidateQueries({ queryKey: ['admin-documents-user'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setViewDoc(null)
      setRejectDoc(null)
      setRejectNote('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const documents = data?.documents ?? []

  // ---------- التصفية الحية (الجولة 33) ----------
  const audienceDocs = useMemo(
    () =>
      documents.filter(
        (d) => audience === 'ALL' || d.user.role === audience
      ),
    [documents, audience]
  )

  const audienceCounts = useMemo(
    () => ({
      ALL: documents.length,
      NURSE: documents.filter((d) => d.user.role === 'NURSE').length,
      DOCTOR: documents.filter((d) => d.user.role === 'DOCTOR').length,
    }),
    [documents]
  )

  const statusCounts = useMemo(
    () => ({
      PENDING: audienceDocs.filter((d) => d.status === 'PENDING').length,
      APPROVED: audienceDocs.filter((d) => d.status === 'APPROVED').length,
      REJECTED: audienceDocs.filter((d) => d.status === 'REJECTED').length,
      ALL: audienceDocs.length,
    }),
    [audienceDocs]
  )

  // تجميع المستندات حسب الكادر — بطاقة واحدة لكل كادر (بعد كل الفلاتر)
  const owners = useMemo<DocOwner[]>(() => {
    const map = new Map<string, DocOwner>()
    for (const doc of audienceDocs) {
      if (status !== 'ALL' && doc.status !== status) continue
      const existing = map.get(doc.userId)
      if (existing) existing.docs.push(doc)
      else map.set(doc.userId, { user: doc.user, docs: [doc] })
    }
    const term = search.trim()
    const list = Array.from(map.values())
    if (!term) return list
    return list.filter(
      (o) => o.user.name.includes(term) || o.user.phone.includes(term)
    )
  }, [audienceDocs, status, search])

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">مراجعة المستندات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          فصل احترافي بين الأطباء والكادر التمريضي — بطاقة لكل صاحب حساب، اضغط عليها لعرض
          جميع مستنداته واعتمادها أو رفضها
        </p>
      </div>

      {/* ---------- الجولة 33: تبويبات الجمهور — فصل الأطباء عن الكادر التمريضي ---------- */}
      <Tabs value={audience} onValueChange={setAudience}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="ALL" className="gap-1.5">
            <FileCheck2 className="size-3.5" />
            الكل
            <span className="text-xs text-muted-foreground">{audienceCounts.ALL}</span>
          </TabsTrigger>
          <TabsTrigger value="NURSE" className="gap-1.5">
            <Users className="size-3.5 text-teal-600" />
            الكادر التمريضي
            <span className="text-xs text-muted-foreground">{audienceCounts.NURSE}</span>
          </TabsTrigger>
          <TabsTrigger value="DOCTOR" className="gap-1.5">
            <Stethoscope className="size-3.5 text-indigo-600" />
            الأطباء
            <span className="text-xs text-muted-foreground">{audienceCounts.DOCTOR}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="PENDING" className="gap-1.5">
              قيد المراجعة
              <span className="text-xs text-muted-foreground">{statusCounts.PENDING}</span>
            </TabsTrigger>
            <TabsTrigger value="APPROVED" className="gap-1.5">
              معتمد
              <span className="text-xs text-muted-foreground">{statusCounts.APPROVED}</span>
            </TabsTrigger>
            <TabsTrigger value="REJECTED" className="gap-1.5">
              مرفوض
              <span className="text-xs text-muted-foreground">{statusCounts.REJECTED}</span>
            </TabsTrigger>
            <TabsTrigger value="ALL" className="gap-1.5">
              كل الحالات
              <span className="text-xs text-muted-foreground">{statusCounts.ALL}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الهاتف"
            className="ps-9"
          />
        </div>
      </div>

      {owners.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="لا توجد مستندات"
          description={
            audience === 'DOCTOR'
              ? 'لا توجد مستندات أطباء ضمن هذا التصنيف — جرّب تبويباً آخر أو حالة أخرى.'
              : audience === 'NURSE'
                ? 'لا توجد مستندات كادر تمريضي ضمن هذا التصنيف — جرّب تبويباً آخر أو حالة أخرى.'
                : 'لا توجد مستندات ضمن هذا التصنيف حالياً.'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {owners.map((owner) => {
            const counts = {
              PENDING: owner.docs.filter((d) => d.status === 'PENDING').length,
              APPROVED: owner.docs.filter((d) => d.status === 'APPROVED').length,
              REJECTED: owner.docs.filter((d) => d.status === 'REJECTED').length,
            }
            const ui = AUDIENCE_UI[owner.user.role as 'NURSE' | 'DOCTOR'] ?? AUDIENCE_UI.NURSE
            const AudienceIcon = ui.icon
            return (
              <button
                key={owner.user.id}
                onClick={() => setOpenUser(owner)}
                className={`group rounded-2xl border bg-card p-4 text-start transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${
                  owner.user.role === 'DOCTOR'
                    ? 'border-r-4 border-r-indigo-400/60'
                    : 'border-r-4 border-r-teal-400/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${ui.avatarClass}`}>
                    {owner.user.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold group-hover:text-primary">{owner.user.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold">
                      <AudienceIcon className={`size-3 ${owner.user.role === 'DOCTOR' ? 'text-indigo-600' : 'text-teal-600'}`} />
                      <span className={owner.user.role === 'DOCTOR' ? 'text-indigo-700 dark:text-indigo-400' : 'text-teal-700 dark:text-teal-400'}>
                        {ui.label}
                      </span>
                      <span className="font-normal text-muted-foreground">— {owner.user.specialty ?? 'بدون تخصص'}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" dir="ltr">
                      {owner.user.phone}
                    </p>
                  </div>
                  <StatusBadge status={owner.user.status} labels={{ PENDING: 'قيد المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض', SUSPENDED: 'موقوف' }} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="size-3" />
                    {owner.docs.length} {owner.docs.length === 1 ? 'مستند' : 'مستندات'}
                  </Badge>
                  {counts.PENDING > 0 && (
                    <Badge className="border-transparent bg-amber-100 text-[11px] text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      {counts.PENDING} بانتظار المراجعة
                    </Badge>
                  )}
                  {counts.APPROVED > 0 && (
                    <Badge className="border-transparent bg-emerald-100 text-[11px] text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {counts.APPROVED} معتمد
                    </Badge>
                  )}
                  {counts.REJECTED > 0 && (
                    <Badge className="border-transparent bg-red-100 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      {counts.REJECTED} مرفوض
                    </Badge>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ---------- حوار جميع مستندات الكادر ---------- */}
      <Dialog open={!!openUser} onOpenChange={(open) => !open && setOpenUser(null)}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`flex size-9 items-center justify-center rounded-full text-base font-extrabold ${openUser ? AUDIENCE_UI[openUser.user.role as 'NURSE' | 'DOCTOR']?.avatarClass ?? AUDIENCE_UI.NURSE.avatarClass : ''}`}>
                {openUser?.user.name.slice(0, 1)}
              </span>
              مستندات {openUser?.user.name}
              {openUser && (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  {openUser.user.role === 'DOCTOR' ? <Stethoscope className="size-3 text-indigo-600" /> : <Users className="size-3 text-teal-600" />}
                  {AUDIENCE_UI[openUser.user.role as 'NURSE' | 'DOCTOR']?.label ?? 'كادر تمريضي'}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              جميع المستندات المرفوعة (كل الحالات) — اعتمد أو ارفض كل مستند مع إشعار صاحبه
            </DialogDescription>
          </DialogHeader>

          {userDocsLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
          ) : (userData?.documents ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد مستندات مرفوعة لهذا الكادر بعد
            </p>
          ) : (
            <div className="space-y-2.5">
              {(userData?.documents ?? []).map((doc) => (
                <div key={doc.id} className="rounded-xl border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-secondary p-2">
                      <FileText className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold">{doc.title}</p>
                        <StatusBadge status={doc.status} labels={DOCUMENT_STATUS_LABELS} />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type} • {doc.fileName} •{' '}
                        {formatFileSize(doc.fileSize)} • {formatDateTime(doc.createdAt)}
                      </p>
                      {doc.reviewNote && (
                        <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          سبب الرفض: {doc.reviewNote}
                        </p>
                      )}
                    </div>
                    <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setViewDoc(doc)}>
                        <Eye className="size-3.5" />
                        عرض
                      </Button>
                      {doc.status !== 'APPROVED' && (
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          disabled={reviewMutation.isPending}
                          onClick={() => reviewMutation.mutate({ id: doc.id, newStatus: 'APPROVED' })}
                        >
                          <CheckCircle2 className="size-3.5" />
                          اعتماد
                        </Button>
                      )}
                      {doc.status !== 'REJECTED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setRejectDoc(doc)}
                        >
                          <XCircle className="size-3.5" />
                          رفض
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DocumentViewer
        document={viewDoc}
        open={!!viewDoc}
        onOpenChange={(open) => !open && setViewDoc(null)}
      />

      {/* حوار رفض المستند */}
      <Dialog open={!!rejectDoc} onOpenChange={(open) => !open && setRejectDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض المستند</DialogTitle>
            <DialogDescription>
              سيتم إشعار {rejectDoc?.user.name} بسبب رفض المستند «{rejectDoc?.title}».
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doc-reject-note">سبب الرفض</Label>
            <Textarea
              id="doc-reject-note"
              rows={3}
              placeholder="مثال: الصورة غير واضحة — يرجى رفع صورة أوضح"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDoc(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || reviewMutation.isPending}
              onClick={() =>
                rejectDoc && reviewMutation.mutate({ id: rejectDoc.id, newStatus: 'REJECTED', note: rejectNote })
              }
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
