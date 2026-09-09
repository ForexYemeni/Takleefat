'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Eye,
  EyeOff,
  FileText,
  Lock,
  PhoneIcon,
  Search,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate, USER_STATUS_LABELS, DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS, QUALIFICATION_OPTIONS } from '@/lib/utils'
import {
  createNurseSchema,
  type CreateNurseInput,
  type CreateNurseFormValues,
} from '@/lib/validations/user'
import { StatusBadge } from '@/components/shared/status-badge'
import { UserActionsMenu } from '@/components/admin/user-actions'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface AdminUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  rejectNote: string | null
  createdAt: string
  /** جهة الكادر (إن أضافه مستلم إداري لجهته) — تُعرض تحت الاسم */
  affiliations?: Array<{ hospital: { name: string; status: string } }>
  _count: { documents: number; assignments: number }
}

export interface AdminDocument {
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
  user?: { id: string; name: string; phone: string; specialty: string | null; status: string }
}

const STATUS_TABS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'PENDING', label: 'قيد المراجعة' },
  { value: 'APPROVED', label: 'معتمد' },
  { value: 'REJECTED', label: 'مرفوض' },
  { value: 'SUSPENDED', label: 'موقوف' },
] as const

export function NurseReview() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [detailsUser, setDetailsUser] = useState<AdminUser | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const createForm = useForm<CreateNurseFormValues, unknown, CreateNurseInput>({
    resolver: zodResolver(createNurseSchema),
    defaultValues: {
      name: '',
      phone: '',
      password: '',
      specialty: '',
      qualification: undefined,
      gender: undefined,
      yearsOfExperience: undefined,
    } as unknown as CreateNurseFormValues,
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateNurseInput) =>
      apiPost<{ message: string }>('/api/admin/users', { ...values, role: 'NURSE' }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setCreateOpen(false)
      createForm.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', 'NURSE'],
    queryFn: () => apiFetcher<{ users: AdminUser[] }>('/api/admin/users?role=NURSE'),
  })

  const users = (data?.users ?? []).filter((u) => {
    const matchesStatus = status === 'ALL' || u.status === status
    const matchesSearch =
      !search || u.name.includes(search) || u.phone.includes(search)
    return matchesStatus && matchesSearch
  })

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">الكادر التمريضي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مراجعة واعتماد حسابات الكوادر التمريضية في منصة تكليفات
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الهاتف..."
              className="ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-2">
            <UserPlus className="size-4" />
            إضافة كادر
          </Button>
        </div>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              {tab.label}
              {tab.value !== 'ALL' && (
                <span className="text-xs text-muted-foreground">
                  {(data?.users ?? []).filter((u) => u.status === String(tab.value)).length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا توجد حسابات مطابقة"
          description="لم يتم العثور على حسابات كادر تمريضي ضمن هذا التصنيف."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>الاسم</TableHead>
                  <TableHead className="hidden md:table-cell">الهاتف</TableHead>
                  <TableHead className="hidden lg:table-cell">التخصص</TableHead>
                  <TableHead className="hidden lg:table-cell">الخبرة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="hidden md:table-cell">تاريخ التسجيل</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-bold">{user.name}</p>
                      <p className="text-xs text-muted-foreground md:hidden">{user.phone}</p>
                      {user.affiliations?.[0]?.hospital && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary">
                          <Building2 className="size-3" />
                          {user.affiliations[0].hospital.name}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell" dir="ltr">
                      <span className="text-start">{user.phone}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{user.specialty ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {user.yearsOfExperience != null ? `${user.yearsOfExperience} سنة` : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
                      {user.status === 'REJECTED' && user.rejectNote && (
                        <p className="mt-1 max-w-40 truncate text-[11px] text-muted-foreground">
                          {user.rejectNote}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <UserActionsMenu
                        user={{ ...user, documentsCount: user._count.documents }}
                        onChanged={() => {
                          queryClient.invalidateQueries({ queryKey: ['admin-users'] })
                          queryClient.invalidateQueries({ queryKey: ['stats'] })
                        }}
                      >
                        <DropdownMenuItem onClick={() => setDetailsUser(user)} className="gap-2">
                          <Eye className="size-4" />
                          عرض التفاصيل
                        </DropdownMenuItem>
                      </UserActionsMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* تفاصيل الكادر + مستنداته */}
      <Dialog open={!!detailsUser} onOpenChange={(open) => !open && setDetailsUser(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>بيانات الكادر التمريضي</DialogTitle>
            <DialogDescription>
              بيانات الحساب والمستندات المرفوعة في منصة تكليفات
            </DialogDescription>
          </DialogHeader>
          {detailsUser && <NurseDetails userId={detailsUser.id} />}
        </DialogContent>
      </Dialog>

      {/* حوار إضافة كادر تمريضي جديد */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة كادر تمريضي جديد</DialogTitle>
            <DialogDescription>
              يُنشأ الحساب معتمداً تلقائياً ويمكن للكادر تسجيل الدخول فوراً في منصة تكليفات.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="nurse-name">الاسم مع اللقب</Label>
              <Input id="nurse-name" placeholder="مثال: سارة أحمد" {...createForm.register('name')} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nurse-phone">رقم الهاتف</Label>
              <div className="relative">
                <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="nurse-phone"
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
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.phone.message}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nurse-specialty">التخصص (اختياري)</Label>
                <Input
                  id="nurse-specialty"
                  placeholder="مثال: تمريض طوارئ"
                  {...createForm.register('specialty')}
                />
                {createForm.formState.errors.specialty && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.specialty.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nurse-experience">سنوات الخبرة (اختياري)</Label>
                <Input
                  id="nurse-experience"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  placeholder="أدخل عدد السنوات"
                  {...createForm.register('yearsOfExperience')}
                />
                {createForm.formState.errors.yearsOfExperience && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.yearsOfExperience.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
                    {QUALIFICATION_OPTIONS.map((q) => (
                      <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.formState.errors.qualification && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.qualification.message}
                  </p>
                )}
              </div>
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
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.gender.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nurse-password">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="nurse-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
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
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                <UserPlus className="size-4" />
                {createMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * تفاصيل الكادر التمريضي — البيانات الشخصية + التقييمات + المستندات داخل الحوار
 */
interface UserDetailsResponse {
  user: AdminUser & { walletAddress: string | null; accountNumber: string | null; updatedAt: string }
  nurse: {
    documents: AdminDocument[]
    ratings: {
      average: number | null
      count: number
      dimensions: {
        punctuality: number | null
        quality: number | null
        communication: number | null
        discipline: number | null
      }
      recent: Array<{
        id: string
        overall: number
        comment: string | null
        createdAt: string
        receiver: { name: string } | null
        assignment: { title: string } | null
      }>
    }
  }
}

function NurseDetails({ userId }: { userId: string }) {
  const [viewerDoc, setViewerDoc] = useState<AdminDocument | null>(null)

  const { data } = useQuery({
    queryKey: ['admin-user-details', userId],
    queryFn: () => apiFetcher<UserDetailsResponse>(`/api/admin/users/${userId}`),
  })

  const user = data?.user
  const nurse = data?.nurse

  return (
    <div className="space-y-4">
      {/* البيانات الشخصية */}
      {user && (
        <div className="rounded-2xl border bg-gradient-to-bl from-primary/5 to-transparent p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-base font-extrabold">
                {user.name}
                <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
              </p>
              <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
                {user.phone}
              </p>
            </div>
            {nurse?.ratings.average != null && (
              <div className="rounded-xl border bg-background px-3 py-2 text-center">
                <p className="text-base font-extrabold text-amber-600">★ {nurse.ratings.average}</p>
                <p className="text-[10px] text-muted-foreground">{nurse.ratings.count} تقييم</p>
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-2.5">
              <p className="text-[11px] text-muted-foreground">التخصص</p>
              <p className="truncate font-bold">{user.specialty ?? '—'}</p>
            </div>
            <div className="rounded-xl border bg-background p-2.5">
              <p className="text-[11px] text-muted-foreground">المؤهل</p>
              <p className="truncate font-bold">{user.qualification ?? '—'}</p>
            </div>
            <div className="rounded-xl border bg-background p-2.5">
              <p className="text-[11px] text-muted-foreground">الخبرة</p>
              <p className="font-bold">{user.yearsOfExperience != null ? `${user.yearsOfExperience} سنة` : '—'}</p>
            </div>
          </div>
          {user.status === 'REJECTED' && user.rejectNote && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              سبب الرفض: {user.rejectNote}
            </p>
          )}
        </div>
      )}

      {/* المستندات المرفوعة */}
      {nurse?.documents.length ? (
        <div className="space-y-2">
          <p className="text-sm font-bold">المستندات المرفوعة</p>
          {nurse.documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setViewerDoc(doc)}
              className="flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors hover:bg-accent"
            >
              <span className="rounded-lg bg-secondary p-2">
                <FileText className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{doc.title}</span>
                <span className="block text-xs text-muted-foreground">{doc.fileName}</span>
              </span>
              <StatusBadge status={doc.status} labels={DOCUMENT_STATUS_LABELS} />
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          لا توجد مستندات مرفوعة لهذا الحساب بعد
        </p>
      )}

      <DocumentViewer
        document={viewerDoc}
        open={!!viewerDoc}
        onOpenChange={(open) => !open && setViewerDoc(null)}
      />
    </div>
  )
}
