'use client'

import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Clock3,
  Coins,
  Hash,
  Hospital,
  Loader2,
  PhoneIcon,
  ShieldAlert,
  UserRound,
  Wallet,
} from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import {
  ASSIGNMENT_STATUS_LABELS,
  POST_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  WITHDRAWAL_STATUS_LABELS,
  USER_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * الملف التفصيلي الكامل للمستلم الإداري — متاح قبل الاعتماد وبعده وبأي حالة.
 * يعرض: البيانات الشخصية + الجهة الصحية + الأرباح والمحفظة
 * + التكليفات المُعلنة + التكليفات + طلبات السحب.
 */

export interface ReceiverDetailsUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  hospitalName: string | null
  rejectNote: string | null
  walletAddress: string | null
  accountNumber: string | null
  createdAt: string
  updatedAt: string
  _count: { documents: number; assignments: number; posts: number; notifications: number }
}

interface ReceiverDetailsResponse {
  user: ReceiverDetailsUser
  receiver: {
    posts: Array<{
      id: string
      number: number
      title: string
      facility: string
      department: string | null
      value: number
      hours: number | null
      status: string
      createdAt: string
      _count: { applications: number }
    }>
    assignments: Array<{
      id: string
      title: string
      facility: string
      department: string | null
      status: string
      value: number | null
      adminFee: number | null
      paymentStatus: string
      createdAt: string
      nurse: { name: string } | null
    }>
    earnings: {
      summary: {
        totalEarned: number
        withdrawn: number
        pending: number
        available: number
        sharePercent: number
      }
      records: Array<{
        id: string
        amount: number
        percent: number
        createdAt: string
        assignment: { id: string; title: string } | null
      }>
    }
    withdrawals: Array<{
      id: string
      amount: number
      walletAddress: string
      accountNumber: string
      status: string
      note: string | null
      createdAt: string
      processedAt: string | null
    }>
    totals: { posts: number; withdrawals: number }
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

function InfoItem({
  icon: Icon,
  label,
  value,
  ltr = false,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  ltr?: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-background p-3">
      <span className="rounded-lg bg-secondary p-2 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-bold" dir={ltr ? 'ltr' : undefined}>
          {value ?? '—'}
        </span>
      </span>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  tone?: 'default' | 'success' | 'warning' | 'muted'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-primary'
  return (
    <div className="rounded-xl border bg-background p-3 text-center">
      <p className={`text-lg font-extrabold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function EmptyRows({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  )
}

export function ReceiverProfileDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-user-details', userId],
    queryFn: () => apiFetcher<ReceiverDetailsResponse>(`/api/admin/users/${userId}`),
    enabled: !!userId && open,
  })

  const user = data?.user
  const receiver = data?.receiver
  // الجولة 31: النافذة واعية بالدور — مشرف الأطباء يرى نفس الملف التفصيلي الكامل بنصوصه هو
  // (كانت تُعرض فارغة تماماً لأن المحتوى مرتبط بوجود مفتاح receiver الذي كان للمستلم حصراً)
  const isSupervisor = user?.role === 'DOCTOR_SUPERVISOR'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-4 text-primary" />
            {isSupervisor ? 'الملف التفصيلي لمشرف الأطباء' : 'الملف التفصيلي للمستلم الإداري'}
          </DialogTitle>
          <DialogDescription>
            بيانات الحساب كاملة — متاحة قبل الاعتماد وبعده في منصة تكليفات
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            جارٍ تحميل البيانات...
          </div>
        )}

        {isError && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">
            {(error as Error)?.message ?? 'تعذر تحميل بيانات الحساب'}
          </p>
        )}

        {user && receiver && (
          <div className="space-y-4">
            {/* ---------- بطاقة الهوية ---------- */}
            <div className="rounded-2xl border bg-gradient-to-bl from-primary/5 to-transparent p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground">
                  {initials(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
                    {user.name}
                    <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground" dir="ltr">
                    <PhoneIcon className="size-3.5" />
                    <span className="text-start">{user.phone}</span>
                  </p>
                </div>
                <Badge variant="outline" className="gap-1.5">
                  <Briefcase className="size-3" />
                  {isSupervisor ? 'مشرف أطباء' : 'مستلم إداري'}
                </Badge>
              </div>

              {user.status === 'REJECTED' && user.rejectNote && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  سبب الرفض: {user.rejectNote}
                </p>
              )}
            </div>

            {/* ---------- البيانات الأساسية ---------- */}
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoItem
                icon={Hospital}
                label="الجهة الصحية (المستشفى)"
                value={user.hospitalName ?? 'لم تُسجل'}
              />
              <InfoItem icon={Clock3} label="تاريخ التسجيل" value={formatDateTime(user.createdAt)} />
              <InfoItem
                icon={BadgeCheck}
                label="آخر تحديث للحساب"
                value={formatDateTime(user.updatedAt)}
              />
              <InfoItem
                icon={Wallet}
                label="عنوان المحفظة (للسحب)"
                value={user.walletAddress || 'لم يُحدد بعد'}
                ltr={!!user.walletAddress}
              />
              <InfoItem
                icon={Hash}
                label="رقم الحساب (للسحب)"
                value={user.accountNumber || 'لم يُحدد بعد'}
                ltr={!!user.accountNumber}
              />
              <InfoItem icon={Building2} label="معرّف الحساب" value={<span className="text-xs">{user.id}</span>} ltr />
            </div>

            {/* ---------- ملخص الأرباح ---------- */}
            <div className="rounded-2xl border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <Coins className="size-4 text-primary" />
                  {isSupervisor
                    ? 'الأرباح المتراكمة (نسبة مشرف الأطباء)'
                    : 'الأرباح المتراكمة (نسبة المستلم الإداري)'}
                </p>
                <Badge variant="secondary">
                  النسبة الحالية: {receiver.earnings.summary.sharePercent}%
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="إجمالي الأرباح" value={formatCurrency(receiver.earnings.summary.totalEarned)} />
                <StatCard
                  label="متاح للسحب"
                  value={formatCurrency(receiver.earnings.summary.available)}
                  tone="success"
                />
                <StatCard
                  label="قيد المعالجة"
                  value={formatCurrency(receiver.earnings.summary.pending)}
                  tone="warning"
                />
                <StatCard
                  label="تم سحبه"
                  value={formatCurrency(receiver.earnings.summary.withdrawn)}
                  tone="muted"
                />
              </div>
            </div>

            {/* ---------- السجلات التفصيلية ---------- */}
            <Tabs defaultValue="posts" dir="rtl">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="posts" className="gap-1.5">
                  {isSupervisor ? 'تكليفات الأطباء المُعلنة' : 'التكليفات المُعلنة'}
                  <span className="text-xs text-muted-foreground">{receiver.totals.posts}</span>
                </TabsTrigger>
                <TabsTrigger value="assignments" className="gap-1.5">
                  التكليفات
                  <span className="text-xs text-muted-foreground">{user._count.assignments}</span>
                </TabsTrigger>
                <TabsTrigger value="withdrawals" className="gap-1.5">
                  طلبات السحب
                  <span className="text-xs text-muted-foreground">{receiver.totals.withdrawals}</span>
                </TabsTrigger>
              </TabsList>

              {/* التكليفات المُعلنة */}
              <TabsContent value="posts" className="mt-2">
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                        <TableHead>#</TableHead>
                        <TableHead>العنوان</TableHead>
                        <TableHead className="hidden sm:table-cell">الجهة</TableHead>
                        <TableHead>القيمة</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead className="hidden sm:table-cell">تقديمات</TableHead>
                        <TableHead className="hidden md:table-cell">التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiver.posts.length === 0 ? (
                        <EmptyRows
                          colSpan={7}
                          text={
                            isSupervisor
                              ? 'لم يُنشئ هذا المشرف أي تكليف أطباء مُعلن بعد'
                              : 'لم يُنشئ هذا المستلم أي تكليف مُعلن بعد'
                          }
                        />
                      ) : (
                        receiver.posts.map((post) => (
                          <TableRow key={post.id}>
                            <TableCell className="font-mono text-xs">{post.number || '—'}</TableCell>
                            <TableCell className="max-w-44 truncate font-semibold">{post.title}</TableCell>
                            <TableCell className="hidden max-w-32 truncate sm:table-cell">
                              {post.facility}
                            </TableCell>
                            <TableCell className="font-bold">{formatCurrency(post.value)}</TableCell>
                            <TableCell>
                              <StatusBadge status={post.status} labels={POST_STATUS_LABELS} />
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge variant="secondary">{post._count.applications}</Badge>
                            </TableCell>
                            <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                              {formatDate(post.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* التكليفات */}
              <TabsContent value="assignments" className="mt-2">
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                        <TableHead>العنوان</TableHead>
                        <TableHead className="hidden sm:table-cell">الكادر</TableHead>
                        <TableHead>القيمة</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead className="hidden sm:table-cell">الرسوم</TableHead>
                        <TableHead className="hidden md:table-cell">التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiver.assignments.length === 0 ? (
                        <EmptyRows
                          colSpan={6}
                          text={
                            isSupervisor
                              ? 'لا توجد تكليفات أطباء مسندة لهذا المشرف بعد'
                              : 'لا توجد تكليفات مسندة لهذا المستلم بعد'
                          }
                        />
                      ) : (
                        receiver.assignments.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="max-w-40 truncate font-semibold">{a.title}</TableCell>
                            <TableCell className="hidden sm:table-cell">{a.nurse?.name ?? '—'}</TableCell>
                            <TableCell className="font-bold">{formatCurrency(a.value)}</TableCell>
                            <TableCell>
                              <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <StatusBadge status={a.paymentStatus} labels={PAYMENT_STATUS_LABELS} />
                            </TableCell>
                            <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                              {formatDate(a.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* طلبات السحب */}
              <TabsContent value="withdrawals" className="mt-2">
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                        <TableHead>المبلغ</TableHead>
                        <TableHead className="hidden sm:table-cell">رقم الحساب</TableHead>
                        <TableHead className="hidden md:table-cell">عنوان المحفظة</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead className="hidden md:table-cell">التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiver.withdrawals.length === 0 ? (
                        <EmptyRows
                          colSpan={5}
                          text={
                            isSupervisor
                              ? 'لا توجد طلبات سحب لهذا المشرف بعد'
                              : 'لا توجد طلبات سحب لهذا المستلم بعد'
                          }
                        />
                      ) : (
                        receiver.withdrawals.map((w) => (
                          <TableRow key={w.id}>
                            <TableCell className="font-bold">{formatCurrency(w.amount)}</TableCell>
                            <TableCell className="hidden font-mono text-xs sm:table-cell" dir="ltr">
                              <span className="text-start">{w.accountNumber}</span>
                            </TableCell>
                            <TableCell className="hidden max-w-36 truncate font-mono text-xs md:table-cell" dir="ltr">
                              <span className="text-start">{w.walletAddress}</span>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={w.status} labels={WITHDRAWAL_STATUS_LABELS} />
                            </TableCell>
                            <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                              {formatDate(w.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
