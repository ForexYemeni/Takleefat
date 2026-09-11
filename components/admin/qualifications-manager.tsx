'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GraduationCap,
  Loader2,
  PencilLine,
  PhoneIcon,
  PlusCircle,
  Power,
  Search,
  Stethoscope,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiFetcher, apiPatch, apiPost, apiDelete } from '@/lib/api-client'
import { formatDate, USER_STATUS_LABELS } from '@/lib/utils'
import {
  updateQualificationSchema,
  qualificationCatalogSchema,
  type UpdateQualificationInput,
  type QualificationCatalogInput,
} from '@/lib/validations/user'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const ROLE_TABS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'NURSE', label: 'الكادر التمريضي' },
  { value: 'DOCTOR', label: 'الأطباء' },
] as const

interface CatalogQualification {
  id: string
  name: string
  audience: 'NURSE' | 'DOCTOR'
  isActive: boolean
  createdAt: string
  usersCount: number
}

interface QualificationUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  hospitalName: string | null
  createdAt: string
  affiliations: Array<{ hospital: { name: string } }>
  _count: { documents: number }
}

interface QualificationsResponse {
  users: QualificationUser[]
  catalog: CatalogQualification[]
}

/**
 * قسم «المؤهلات العلمية» — الجولة 32
 * كتالوج كامل قابل للإدارة من حساب الإدارة:
 * - تبويب «كتالوج المؤهلات»: إضافة مؤهلات جديدة / تعديل الأسماء (مع ترحيل فوري
 *   لكل الحسابات الحاملة) / تعطيل وإعادة تفعيل / حذف ما لم يكن قيد الاستخدام
 * - تبويب «إسناد المؤهلات»: تعديل مؤهل أي كادر/طبيب من خيارات الكتالوج النشطة
 * - كل الإضافة والتعديل يصل صاحب الحساب إشعاراً به
 */

const patchFormSchema = updateQualificationSchema.omit({ userId: true })
const addFormSchema = qualificationCatalogSchema

export function QualificationsManager() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'catalog' | 'assign'>('catalog')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-qualifications'],
    queryFn: () => apiFetcher<QualificationsResponse>('/api/admin/qualifications'),
  })

  const users = data?.users ?? []
  const catalog = data?.catalog ?? []

  const stats = useMemo(
    () => ({
      total: catalog.length,
      nurse: catalog.filter((q) => q.audience === 'NURSE').length,
      doctor: catalog.filter((q) => q.audience === 'DOCTOR').length,
      inactive: catalog.filter((q) => !q.isActive).length,
    }),
    [catalog]
  )

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      {/* ---------- الرأس ---------- */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <GraduationCap className="size-6 text-primary" />
            المؤهلات العلمية
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            كتالوج المؤهلات المُدار من حساب الإدارة — أضف مؤهلات جديدة وعدّلها وفعّلها
            أو عطّلها، وأسندها للكوادر والأطباء
          </p>
        </div>
      </div>

      {/* ---------- بطاقات الإحصاء ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GraduationCap className="size-3.5" /> إجمالي المؤهلات
          </p>
          <p className="mt-1 text-2xl font-extrabold text-primary">{stats.total}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">مؤهلات الكادر التمريضي</p>
          <p className="mt-1 text-2xl font-extrabold">{stats.nurse}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Stethoscope className="size-3.5" /> مؤهلات الأطباء
          </p>
          <p className="mt-1 text-2xl font-extrabold">{stats.doctor}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">موقوفة عن الاستخدام</p>
          <p
            className={`mt-1 text-2xl font-extrabold ${stats.inactive > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}
          >
            {stats.inactive}
          </p>
        </div>
      </div>

      {/* ---------- التبويبات ---------- */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'catalog' | 'assign')}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="catalog" className="gap-1.5">
            <GraduationCap className="size-3.5" />
            كتالوج المؤهلات
            <span className="text-xs text-muted-foreground">{catalog.length}</span>
          </TabsTrigger>
          <TabsTrigger value="assign" className="gap-1.5">
            <Users className="size-3.5" />
            إسناد المؤهلات
            <span className="text-xs text-muted-foreground">{users.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'catalog' ? (
        <CatalogTab catalog={catalog} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['admin-qualifications'] })} />
      ) : (
        <AssignTab users={users} catalog={catalog} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['admin-qualifications'] })} />
      )}
    </div>
  )
}

/* ================================================================
 * التبويب الأول — كتالوج المؤهلات (إضافة / تعديل / تعطيل / حذف)
 * ================================================================ */

function CatalogTab({
  catalog,
  onRefresh,
}: {
  catalog: CatalogQualification[]
  onRefresh: () => void
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogQualification | null>(null)
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState<CatalogQualification | null>(null)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-qualifications'] })
    onRefresh()
  }

  const addForm = useForm<QualificationCatalogInput>({
    resolver: zodResolver(addFormSchema),
    defaultValues: { name: '', audience: 'NURSE' },
  })

  const addMutation = useMutation({
    mutationFn: (values: QualificationCatalogInput) =>
      apiPost<{ message: string }>('/api/admin/qualifications', values),
    onSuccess: (res) => {
      toast.success(res.message)
      refresh()
      setAddOpen(false)
      addForm.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiPatch<{ message: string }>(`/api/admin/qualifications/${id}`, { name }),
    onSuccess: (res) => {
      toast.success(res.message)
      setEditing(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ message: string }>(`/api/admin/qualifications/${id}`, { isActive }),
    onSuccess: (res) => {
      toast.success(res.message)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/admin/qualifications/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      setDeleting(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const filtered = catalog.filter(
    (q) => !search || q.name.includes(search)
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث في الكتالوج..."
            className="ps-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setAddOpen(true)} className="shrink-0 gap-2">
          <PlusCircle className="size-4" />
          إضافة مؤهل جديد
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="لا توجد مؤهلات مطابقة"
          description="أضف مؤهلاً علمياً جديداً من الزر أعلاه — سيظهر فوراً في كل نماذج التسجيل والإسناد."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>اسم المؤهل</TableHead>
                  <TableHead>الجمهور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="hidden md:table-cell">الحاملون</TableHead>
                  <TableHead className="hidden md:table-cell">أُضيف في</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-bold">
                      <span className="flex items-center gap-1.5">
                        <GraduationCap className="size-4 text-primary" />
                        {q.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={q.audience === 'DOCTOR' ? 'default' : 'secondary'}>
                        {q.audience === 'DOCTOR' ? 'الأطباء' : 'الكادر التمريضي'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {q.isActive ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                          نشط
                        </Badge>
                      ) : (
                        <Badge variant="destructive">موقوف</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="size-3" />
                        {q.usersCount} حساب
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {formatDate(q.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setEditing(q)
                            setNewName(q.name)
                          }}
                        >
                          <PencilLine className="size-3.5" />
                          تعديل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={toggleMutation.isPending}
                          onClick={() =>
                            toggleMutation.mutate({ id: q.id, isActive: !q.isActive })
                          }
                        >
                          <Power className="size-3.5" />
                          {q.isActive ? 'تعطيل' : 'تفعيل'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`gap-1.5 ${q.usersCount > 0 ? 'opacity-50' : 'text-red-600 focus:text-red-600'}`}
                          disabled={q.usersCount > 0}
                          title={
                            q.usersCount > 0
                              ? `لا يمكن الحذف — ${q.usersCount} حساب يحمله (عطّله بدلاً من الحذف)`
                              : 'حذف نهائي من الكتالوج'
                          }
                          onClick={() => setDeleting(q)}
                        >
                          <Trash2 className="size-3.5" />
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ---------- حوار إضافة مؤهل ---------- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="size-4 text-primary" />
              إضافة مؤهل علمي جديد
            </DialogTitle>
            <DialogDescription>
              يظهر المؤهل الجديد فوراً في صفحة التسجيل وكل نماذج إنشاء وإسناد المؤهلات.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addForm.handleSubmit((v) => addMutation.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qual-name">اسم المؤهل *</Label>
              <Input
                id="qual-name"
                placeholder="مثال: دبلوم عالي — أو — بكالوريوس صيدلة"
                {...addForm.register('name')}
              />
              {addForm.formState.errors.name && (
                <p className="text-xs text-destructive">{addForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>الجمهور *</Label>
              <Select
                value={addForm.watch('audience') || 'NURSE'}
                onValueChange={(v) => addForm.setValue('audience', v as 'NURSE' | 'DOCTOR', { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الجمهور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NURSE">الكادر التمريضي</SelectItem>
                  <SelectItem value="DOCTOR">الأطباء</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                مؤهلات الكادر تظهر في تسجيل وإنشاء الكوادر — ومؤهلات الأطباء في منظومة الأطباء.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={addMutation.isPending} className="gap-2">
                {addMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {addMutation.isPending ? 'جارٍ الإضافة...' : 'إضافة المؤهل'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- حوار تعديل اسم المؤهل ---------- */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="size-4 text-primary" />
              تعديل اسم المؤهل
            </DialogTitle>
            <DialogDescription>
              سيُرحَّل الاسم الجديد فوراً إلى كل الحسابات الحاملة للمؤهل «{editing?.name}»
              {editing ? ` (${editing.usersCount} حساب)` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qual-rename">الاسم الجديد *</Label>
              <Input
                id="qual-rename"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="الاسم الجديد للمؤهل"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button
              disabled={renameMutation.isPending || !newName.trim() || newName.trim() === editing?.name}
              onClick={() =>
                editing && renameMutation.mutate({ id: editing.id, name: newName.trim() })
              }
              className="gap-2"
            >
              {renameMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              حفظ الاسم الجديد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- تأكيد الحذف ---------- */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        tone="danger"
        icon={Trash2}
        title="حذف المؤهل من الكتالوج"
        description={`سيُحذف المؤهل «${deleting?.name}» نهائياً من الكتالوج ولن يظهر في أي نموذج بعد الحذف. الحذف متاح فقط للمؤهلات غير المستخدمة.`}
        confirmLabel="نعم، احذف المؤهل"
        processing={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}

/* ================================================================
 * التبويب الثاني — إسناد المؤهلات للكوادر والأطباء
 * ================================================================ */

function AssignTab({
  users,
  catalog,
  onRefresh,
}: {
  users: QualificationUser[]
  catalog: CatalogQualification[]
  onRefresh: () => void
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [editing, setEditing] = useState<QualificationUser | null>(null)

  const form = useForm<z.input<typeof patchFormSchema>, unknown, z.output<typeof patchFormSchema>>({
    resolver: zodResolver(patchFormSchema),
    defaultValues: { qualification: '' },
  })

  const patchMutation = useMutation({
    mutationFn: ({ userId, qualification }: UpdateQualificationInput) =>
      apiPatch<{ message: string }>('/api/admin/qualifications', { userId, qualification }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-qualifications'] })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onRefresh()
      setEditing(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
        const matchesSearch =
          !search || u.name.includes(search) || u.phone.includes(search)
        return matchesRole && matchesSearch
      }),
    [users, roleFilter, search]
  )

  /** خيارات المؤهل من الكتالوج النشط بحسب دور صاحب الحساب */
  const optionsFor = (role: string) =>
    catalog
      .filter((q) => q.isActive && q.audience === (role === 'DOCTOR' ? 'DOCTOR' : 'NURSE'))
      .map((q) => ({ value: q.name, label: q.name }))

  const openEdit = (user: QualificationUser) => {
    setEditing(user)
    form.reset({ qualification: user.qualification ?? '' })
  }

  const submit = form.handleSubmit((values) => {
    if (!editing) return
    patchMutation.mutate({ userId: editing.id, qualification: values.qualification })
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          تعديل المؤهل العلمي لأي كادر تمريضي أو طبيب — الخيارات من كتالوج المؤهلات النشطة أعلاه
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو الهاتف..."
            className="ps-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={roleFilter} onValueChange={setRoleFilter}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {ROLE_TABS.map((tabItem) => (
            <TabsTrigger key={tabItem.value} value={tabItem.value} className="gap-1.5">
              {tabItem.label}
              <span className="text-xs text-muted-foreground">
                {tabItem.value === 'ALL'
                  ? users.length
                  : users.filter((u) => u.role === tabItem.value).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="لا توجد حسابات مطابقة"
          description="لم يتم العثور على كوادر أو أطباء ضمن هذا التصنيف."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>الاسم</TableHead>
                  <TableHead className="hidden md:table-cell">الهاتف</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead className="hidden lg:table-cell">التخصص</TableHead>
                  <TableHead>المؤهل العلمي</TableHead>
                  <TableHead className="hidden lg:table-cell">الجهة الصحية</TableHead>
                  <TableHead className="hidden md:table-cell">تاريخ التسجيل</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-bold">{user.name}</TableCell>
                    <TableCell className="hidden md:table-cell" dir="ltr">
                      <span className="text-start">{user.phone}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'DOCTOR' ? 'default' : 'secondary'}>
                        {user.role === 'DOCTOR' ? 'طبيب' : 'كادر تمريضي'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {user.specialty ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {user.qualification ? (
                        <Badge variant="outline" className="gap-1">
                          <GraduationCap className="size-3" />
                          {user.qualification}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">غير محدد</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {user.affiliations[0]?.hospital.name ??
                        user.hospitalName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openEdit(user)}
                      >
                        <PencilLine className="size-3.5" />
                        تعديل المؤهل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ---------- حوار تعديل المؤهل ---------- */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-primary" />
              تعديل المؤهل العلمي
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `المؤهل الحالي لـ (${editing.name}): ${editing.qualification ?? 'غير محدد'} — اختر المؤهل الجديد من كتالوج ${editing.role === 'DOCTOR' ? 'الأطباء' : 'الكادر التمريضي'} النشط`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-secondary/40 p-3 text-sm">
                <span className="font-bold">{editing.name}</span>
                <Badge variant="secondary">{editing.role === 'DOCTOR' ? 'طبيب' : 'كادر تمريضي'}</Badge>
                <StatusBadge status={editing.status} labels={USER_STATUS_LABELS} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                  <PhoneIcon className="size-3" />
                  {editing.phone}
                </span>
              </div>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label>المؤهل العلمي الجديد *</Label>
                  <Select
                    value={form.watch('qualification') || ''}
                    onValueChange={(v) => form.setValue('qualification', v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المؤهل من كتالوج الإدارة" />
                    </SelectTrigger>
                    <SelectContent>
                      {optionsFor(editing.role).map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.qualification && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.qualification.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    سيصل صاحب الحساب إشعاراً بتحديث مؤهله العلمي فور الحفظ.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={patchMutation.isPending} className="gap-2">
                    {patchMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    {patchMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ المؤهل'}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
