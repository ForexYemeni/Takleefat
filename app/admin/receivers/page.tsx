'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, MoreHorizontal, PhoneIcon, Search, UserPlus, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate, USER_STATUS_LABELS } from '@/lib/utils'
import { createReceiverSchema, type CreateReceiverInput } from '@/lib/validations/user'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Eye, EyeOff } from 'lucide-react'

interface ReceiverUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  createdAt: string
  _count: { documents: number; assignments: number }
}

export default function AdminReceiversPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', 'RECEIVER'],
    queryFn: () => apiFetcher<{ users: ReceiverUser[] }>('/api/admin/users?role=RECEIVER'),
  })

  const form = useForm<CreateReceiverInput>({
    resolver: zodResolver(createReceiverSchema),
    defaultValues: { name: '', phone: '', password: '' },
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateReceiverInput) =>
      apiPost<{ message: string }>('/api/admin/users', values),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setCreateOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const receivers = (data?.users ?? []).filter(
    (u) => !search || u.name.includes(search) || u.phone.includes(search)
  )

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">المستلمون الإداريون</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة حسابات الجهات المستقبِلة للتكليفات في منصة تكليفات
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث..."
              className="ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-2">
            <UserPlus className="size-4" />
            إضافة مستلم
          </Button>
        </div>
      </div>

      {receivers.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="لا يوجد مستلمون إداريون"
          description="أضف أول حساب مستلم إداري ليتمكن من استلام التكليفات."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <UserPlus className="size-4" />
              إضافة مستلم
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>الاسم</TableHead>
                  <TableHead className="hidden md:table-cell">الهاتف</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="hidden md:table-cell">تكليفات</TableHead>
                  <TableHead className="hidden md:table-cell">تاريخ الإنشاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-bold">{user.name}</TableCell>
                    <TableCell className="hidden md:table-cell" dir="ltr">
                      <span className="text-start">{user.phone}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{user._count.assignments} تكليف</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(user.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* حوار إضافة مستلم */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مستلم إداري جديد</DialogTitle>
            <DialogDescription>
              يُنشأ الحساب معتمداً تلقائياً ويمكن للمستلم تسجيل الدخول فوراً في منصة تكليفات.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="receiver-name">الاسم الكامل</Label>
              <Input id="receiver-name" placeholder="مثال: محمد عبدالله" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiver-phone">رقم الهاتف</Label>
              <div className="relative">
                <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="receiver-phone"
                  type="tel"
                  dir="ltr"
                  placeholder="7xxxxxxxx"
                  className="ps-10 text-start"
                  {...form.register('phone')}
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiver-password">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="receiver-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="ps-10 pe-10"
                  {...form.register('password')}
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
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
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
