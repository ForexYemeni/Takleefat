'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ClipboardList, CheckCircle2, History, Plus, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost, apiPatch } from '@/lib/api-client'
import { formatDateTime, formatDate, ASSIGNMENT_STATUS_LABELS } from '@/lib/utils'
import { createAssignmentSchema, type CreateAssignmentInput } from '@/lib/validations/assignment'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

export interface AdminAssignment {
  id: string
  title: string
  description: string | null
  facility: string
  department: string | null
  startDate: string
  endDate: string | null
  status: string
  receivedAt: string | null
  createdAt: string
  nurse: { id: string; name: string; specialty: string | null }
  receiver: { id: string; name: string }
  _count?: { logs: number }
}

interface AssignmentLogEntry {
  id: string
  action: string
  note: string | null
  createdAt: string
  user: { name: string }
}

const STATUS_TABS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'ACTIVE', label: 'جاري' },
  { value: 'RECEIVED', label: 'تم الاستلام' },
  { value: 'COMPLETED', label: 'مكتمل' },
  { value: 'CANCELLED', label: 'ملغي' },
] as const

export default function AdminAssignmentsPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [details, setDetails] = useState<AdminAssignment | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-assignments'],
    queryFn: () => apiFetcher<{ assignments: AdminAssignment[] }>('/api/admin/assignments'),
  })

  const assignments = (data?.assignments ?? []).filter(
    (a) => status === 'ALL' || a.status === status
  )

  const statusMutation = useMutation({
    mutationFn: ({ id, newStatus, note }: { id: string; newStatus: string; note?: string }) =>
      apiPatch<{ message: string }>(`/api/admin/assignments/${id}`, {
        status: newStatus,
        note: note ?? '',
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setDetails(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">التكليفات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إنشاء التكليفات الطبية والتمريضية ومتابعتها حتى الإنجاز
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          إنشاء تكليف جديد
        </Button>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد تكليفات"
          description="ابدأ بإنشاء أول تكليف وإسناده للكادر التمريضي."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="size-4" />
              إنشاء تكليف جديد
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>التكليف</TableHead>
                  <TableHead className="hidden md:table-cell">الكادر</TableHead>
                  <TableHead className="hidden lg:table-cell">المستلم</TableHead>
                  <TableHead className="hidden lg:table-cell">المدة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-bold">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.facility}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{a.nurse.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">{a.receiver.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-xs">{formatDate(a.startDate)}</p>
                      {a.endDate && <p className="text-xs text-muted-foreground">حتى {formatDate(a.endDate)}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setDetails(a)}>
                        التفاصيل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <CreateAssignmentDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* تفاصيل التكليف */}
      <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{details?.title}</DialogTitle>
            <DialogDescription>{details?.facility}</DialogDescription>
          </DialogHeader>
          {details && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border bg-secondary/40 p-4 sm:grid-cols-2">
                <InfoRow label="الكادر التمريضي" value={details.nurse.name} />
                <InfoRow label="التخصص" value={details.nurse.specialty ?? '—'} />
                <InfoRow label="المستلم الإداري" value={details.receiver.name} />
                <InfoRow label="القسم" value={details.department ?? '—'} />
                <InfoRow label="تاريخ البدء" value={formatDate(details.startDate)} />
                <InfoRow
                  label="تاريخ الانتهاء"
                  value={details.endDate ? formatDate(details.endDate) : 'غير محدد'}
                />
                <InfoRow
                  label="وقت الاستلام"
                  value={details.receivedAt ? formatDateTime(details.receivedAt) : 'لم يُستلم بعد'}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">الحالة:</span>
                  <StatusBadge status={details.status} labels={ASSIGNMENT_STATUS_LABELS} />
                </div>
              </div>

              {details.description && (
                <div>
                  <p className="mb-1 text-sm font-bold">وصف التكليف</p>
                  <p className="rounded-xl border p-3 text-sm leading-relaxed text-muted-foreground">
                    {details.description}
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-dashed p-3">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <History className="size-3.5" />
                  آخر تحديث: {formatDateTime(details.createdAt)} — بواسطة إدارة منصة تكليفات
                </p>
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {details.status === 'RECEIVED' && (
                  <Button
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ id: details.id, newStatus: 'COMPLETED' })
                    }
                  >
                    <CheckCircle2 className="size-4" />
                    إنهاء التكليف (مكتمل)
                  </Button>
                )}
                {details.status === 'COMPLETED' && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: details.id, newStatus: 'RECEIVED' })}
                  >
                    <History className="size-4" />
                    إعادة إلى «تم الاستلام»
                  </Button>
                )}
                {details.status !== 'CANCELLED' && details.status !== 'COMPLETED' && (
                  <Button
                    variant="destructive"
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: details.id, newStatus: 'CANCELLED' })}
                  >
                    <XCircle className="size-4" />
                    إلغاء التكليف
                  </Button>
                )}
                {details.status === 'CANCELLED' && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: details.id, newStatus: 'ACTIVE' })}
                  >
                    <History className="size-4" />
                    إعادة تنشيط التكليف
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

/**
 * حوار إنشاء تكليف جديد
 */
function CreateAssignmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [endDate, setEndDate] = useState('')

  const form = useForm<CreateAssignmentInput>({
    resolver: zodResolver(createAssignmentSchema),
    defaultValues: {
      title: '',
      description: '',
      facility: '',
      department: '',
      startDate: '',
      endDate: '',
      nurseId: '',
      receiverId: '',
    },
  })

  const { data: nursesData } = useQuery({
    queryKey: ['approved-nurses'],
    queryFn: () => apiFetcher<{ users: Array<{ id: string; name: string; specialty: string | null }> }>(
      '/api/admin/users?role=NURSE&status=APPROVED'
    ),
    enabled: open,
  })

  const { data: receiversData } = useQuery({
    queryKey: ['approved-receivers'],
    queryFn: () => apiFetcher<{ users: Array<{ id: string; name: string }> }>(
      '/api/admin/users?role=RECEIVER&status=APPROVED'
    ),
    enabled: open,
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateAssignmentInput) =>
      apiPost<{ message: string }>('/api/admin/assignments', values),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onOpenChange(false)
      form.reset()
      setEndDate('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: CreateAssignmentInput) => {
    createMutation.mutate({ ...values, endDate })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إنشاء تكليف جديد</DialogTitle>
          <DialogDescription>
            إسناد تكليف طبي/تمريضي لكادر معتمد مع تحديد الجهة المستقبِلة
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="a-title">عنوان التكليف</Label>
            <Input id="a-title" placeholder="مثال: تكليف تمريضي — قسم الطوارئ" {...form.register('title')} />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a-facility">الجهة الصحية</Label>
              <Input id="a-facility" placeholder="مثال: مستشفى الملكية" {...form.register('facility')} />
              {form.formState.errors.facility && (
                <p className="text-xs text-destructive">{form.formState.errors.facility.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-department">القسم (اختياري)</Label>
              <Input id="a-department" placeholder="مثال: العناية المركزة" {...form.register('department')} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a-start">تاريخ البدء</Label>
              <Input
                id="a-start"
                type="date"
                {...form.register('startDate')}
              />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-end">تاريخ الانتهاء (اختياري)</Label>
              <Input
                id="a-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الكادر التمريضي (معتمد)</Label>
              <Select onValueChange={(v) => form.setValue('nurseId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الكادر" />
                </SelectTrigger>
                <SelectContent>
                  {(nursesData?.users ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name} {n.specialty ? `— ${n.specialty}` : ''}
                    </SelectItem>
                  ))}
                  {(nursesData?.users ?? []).length === 0 && (
                    <SelectItem value="none" disabled>
                      لا يوجد كادر معتمد
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.nurseId && (
                <p className="text-xs text-destructive">{form.formState.errors.nurseId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>المستلم الإداري (معتمد)</Label>
              <Select onValueChange={(v) => form.setValue('receiverId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المستلم" />
                </SelectTrigger>
                <SelectContent>
                  {(receiversData?.users ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                  {(receiversData?.users ?? []).length === 0 && (
                    <SelectItem value="none" disabled>
                      لا يوجد مستلمون معتمدون
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.receiverId && (
                <p className="text-xs text-destructive">{form.formState.errors.receiverId.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="a-desc">وصف التكليف (اختياري)</Label>
            <Textarea id="a-desc" rows={3} placeholder="تفاصيل المهام والمسؤوليات..." {...form.register('description')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="gap-2">
              <CalendarDays className="size-4" />
              {createMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء التكليف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
