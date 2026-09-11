'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GraduationCap,
  Loader2,
  PencilLine,
  PhoneIcon,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate, QUALIFICATION_OPTIONS, USER_STATUS_LABELS } from '@/lib/utils'
import { updateQualificationSchema, type UpdateQualificationInput } from '@/lib/validations/user'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
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

/** خيارات مؤهل الأطباء — نفس قيم DOCTOR_QUALIFICATION_VALUES في مخططات التحقق */
const DOCTOR_QUALIFICATION_OPTIONS = [
  { value: 'بكالوريوس طب وجراحة', label: 'بكالوريوس طب وجراحة' },
  { value: 'ماجستير', label: 'ماجستير' },
  { value: 'دكتوراه', label: 'دكتوراه' },
  { value: 'شهادة زمالة', label: 'شهادة زمالة' },
]

const ROLE_TABS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'NURSE', label: 'الكادر التمريضي' },
  { value: 'DOCTOR', label: 'الأطباء' },
] as const

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

/**
 * قسم «المؤهلات العلمية» — الجولة 31
 * عرض وتعديل المؤهلات العلمية لجميع الأطباء والكوادر التمريضية من حساب الإدارة:
 * - قائمة موحدة (كوادر + أطباء) مع المؤهل الحالي والتخصص والجهة
 * - تعديل المؤهل من قائمة الدور المعتمدة (نفس قوائم التسجيل)
 * - إشعار صاحب الحساب عند تحديث مؤهله (من الخادم)
 */

const patchFormSchema = updateQualificationSchema.omit({ userId: true })

export function QualificationsManager() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [editing, setEditing] = useState<QualificationUser | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-qualifications'],
    queryFn: () => apiFetcher<{ users: QualificationUser[] }>('/api/admin/qualifications'),
  })

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
      setEditing(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const users = data?.users ?? []

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

  const stats = useMemo(
    () => ({
      total: users.length,
      nurses: users.filter((u) => u.role === 'NURSE').length,
      doctors: users.filter((u) => u.role === 'DOCTOR').length,
      missing: users.filter((u) => !u.qualification).length,
    }),
    [users]
  )

  const optionsFor = (role: string) =>
    role === 'DOCTOR' ? DOCTOR_QUALIFICATION_OPTIONS : QUALIFICATION_OPTIONS

  const openEdit = (user: QualificationUser) => {
    setEditing(user)
    form.reset({ qualification: user.qualification ?? '' })
  }

  const submit = form.handleSubmit((values) => {
    if (!editing) return
    patchMutation.mutate({ userId: editing.id, qualification: values.qualification })
  })

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
            عرض وتعديل المؤهلات العلمية لجميع الأطباء والكوادر التمريضية — من قوائم الدور المعتمدة
            نفسها المُستخدمة في التسجيل
          </p>
        </div>
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

      {/* ---------- بطاقات الإحصاء ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" /> إجمالي المستفيدين
          </p>
          <p className="mt-1 text-2xl font-extrabold text-primary">{stats.total}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">الكادر التمريضي</p>
          <p className="mt-1 text-2xl font-extrabold">{stats.nurses}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Stethoscope className="size-3.5" /> الأطباء
          </p>
          <p className="mt-1 text-2xl font-extrabold">{stats.doctors}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">بلا مؤهل محدد</p>
          <p
            className={`mt-1 text-2xl font-extrabold ${stats.missing > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}
          >
            {stats.missing}
          </p>
        </div>
      </div>

      {/* ---------- تصفية الدور ---------- */}
      <Tabs value={roleFilter} onValueChange={setRoleFilter}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {ROLE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              {tab.label}
              <span className="text-xs text-muted-foreground">
                {tab.value === 'ALL'
                  ? users.length
                  : users.filter((u) => u.role === tab.value).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ---------- القائمة ---------- */}
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
                ? `المؤهل الحالي لـ (${editing.name}): ${editing.qualification ?? 'غير محدد'} — اختر المؤهل الجديد من قائمة ${editing.role === 'DOCTOR' ? 'الأطباء' : 'الكادر التمريضي'} المعتمدة`
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
                      <SelectValue placeholder="اختر المؤهل من القائمة" />
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
