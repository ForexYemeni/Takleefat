'use client'

import { useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Eye,
  IdCard,
  KeyRound,
  MoreHorizontal,
  Percent,
  PlayCircle,
  ShieldCheck,
  Trash2,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiPatch, apiDelete } from '@/lib/api-client'
import { USER_STATUS_LABELS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

/**
 * قائمة إجراءات الحساب — تُستخدم في صفحتي الكادر التمريضي والمستلمين الإداريين:
 * عرض / اعتماد / رفض (بسبب) / إيقاف / تنشيط / تغيير كلمة المرور / حذف نهائي
 * مع بطاقات تأكيد احترافية بدل نوافذ المتصفح.
 */

interface ActionUser {
  id: string
  name: string
  status: string
  role?: string
  /** عدد المستندات المرفوعة — يُستخدم لمنع اعتماد الكادر قبل رفع مستنداته */
  documentsCount?: number
  /** نِسَب الحصة والأذونات — للمستلم الإداري ومشرف الأطباء (الجولة 32) */
  commissionPercent?: number | null
  fullProfileAccess?: boolean
  /** النسبة التلقائية (نصف نسبة الإدارة) — للعرض في الحوار */
  autoSharePercent?: number
}

export function UserActionsMenu({
  user,
  children,
  onChanged,
}: {
  user: ActionUser
  /** عناصر إضافية أعلى القائمة (مثل: عرض التفاصيل) */
  children?: React.ReactNode
  onChanged?: () => void
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // الجولة 32 — نِسَب الحصة وأذونات البيانات الكاملة (المستلم الإداري ومشرف الأطباء)
  const [percentOpen, setPercentOpen] = useState(false)
  const [percentValue, setPercentValue] = useState<string>('')
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessValue, setAccessValue] = useState(false)
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'APPROVED' }
    | { kind: 'SUSPENDED' }
    | { kind: 'DELETE' }
    | null
  >(null)

  const invalidate = () => {
    onChanged?.()
  }

  const statusMutation = async (newStatus: 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'PENDING', note?: string) => {
    setPending(true)
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/users/${user.id}`, {
        status: newStatus,
        rejectNote: note ?? '',
      })
      toast.success(res.message)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  const passwordMutation = async () => {
    setPending(true)
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/users/${user.id}`, {
        password: newPassword,
      })
      toast.success(res.message)
      setPasswordOpen(false)
      setNewPassword('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  const deleteMutation = async () => {
    setPending(true)
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/users/${user.id}`)
      toast.success(res.message)
      setConfirmAction(null)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** حفظ نسبة الحصة — فارغ = العودة للتلقائي (نصف نسبة الإدارة) */
  const percentMutation = async () => {
    setPending(true)
    try {
      const trimmed = percentValue.trim()
      const payload = { commissionPercent: trimmed === '' ? null : Number(trimmed) }
      const res = await apiPatch<{ message: string }>(`/api/admin/users/${user.id}`, payload)
      toast.success(res.message)
      setPercentOpen(false)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  /** فتح/إغلاق إذن رؤية البيانات الكاملة (السيرة الذاتية) */
  const accessMutation = async (next: boolean) => {
    setPending(true)
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/users/${user.id}`, {
        fullProfileAccess: next,
      })
      toast.success(res.message)
      setAccessValue(next)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  const [pending, setPending] = useState(false)

  // سياسة الاعتماد: كادر تمريضي بلا مستندات مرفوعة لا يمكن اعتماده إطلاقاً
  const documentsMissing = user.role === 'NURSE' && (user.documentsCount ?? 0) === 0

  // الجولة 32 — حسابات المستلمين/المشرفين: نسبة الحصة + أذونات البيانات الكاملة
  const shareManaged = user.role === 'RECEIVER' || user.role === 'DOCTOR_SUPERVISOR'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="إجراءات الحساب">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {children}
          {children && <DropdownMenuSeparator />}
          {user.status !== 'APPROVED' && (
            <DropdownMenuItem
              disabled={documentsMissing}
              onClick={() => setConfirmAction({ kind: 'APPROVED' })}
              className="gap-2 text-emerald-700 focus:text-emerald-700"
            >
              <BadgeCheck className="size-4" />
              <span className="flex flex-col">
                <span>
                  {user.status === 'SUSPENDED' ? 'إعادة تنشيط الحساب' : 'اعتماد الحساب'}
                </span>
                {documentsMissing && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    غير متاح — لا توجد مستندات مرفوعة
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          )}
          {user.status !== 'REJECTED' && user.status !== 'APPROVED' && (
            <DropdownMenuItem
              onClick={() => {
                setRejectNote('')
                setRejectOpen(true)
              }}
              className="gap-2 text-amber-700 focus:text-amber-700"
            >
              <UserX className="size-4" />
              رفض الحساب
            </DropdownMenuItem>
          )}
          {user.status === 'APPROVED' && (
            <DropdownMenuItem
              onClick={() => setConfirmAction({ kind: 'SUSPENDED' })}
              className="gap-2 text-amber-700 focus:text-amber-700"
            >
              <Ban className="size-4" />
              إيقاف الحساب مؤقتاً
            </DropdownMenuItem>
          )}
          {user.status === 'SUSPENDED' && !documentsMissing && (
            <DropdownMenuItem
              onClick={() => setConfirmAction({ kind: 'APPROVED' })}
              className="gap-2 text-emerald-700 focus:text-emerald-700"
            >
              <PlayCircle className="size-4" />
              إعادة تنشيط الحساب
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {shareManaged && (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                setPercentValue(
                  user.commissionPercent != null ? String(user.commissionPercent) : ''
                )
                setPercentOpen(true)
              }}
            >
              <Percent className="size-4" />
              <span className="flex flex-col">
                <span>نسبة الحصة من التكليفات</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {user.commissionPercent != null
                    ? `مخصصة حالياً: ${user.commissionPercent}٪`
                    : `تلقائي: ${user.autoSharePercent ?? 5}٪ (نصف نسبة الإدارة)`}
                </span>
              </span>
            </DropdownMenuItem>
          )}
          {shareManaged && (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                setAccessValue(user.fullProfileAccess ?? false)
                setAccessOpen(true)
              }}
            >
              <ShieldCheck
                className={`size-4 ${user.fullProfileAccess ? 'text-emerald-600' : ''}`}
              />
              <span className="flex flex-col">
                <span>أذونات رؤية البيانات الكاملة</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {user.fullProfileAccess ? 'مفتوح — مع السيرة الذاتية والمستندات' : 'مغلق — البيانات المختصرة فقط'}
                </span>
              </span>
            </DropdownMenuItem>
          )}
          {shareManaged && <DropdownMenuSeparator />}
          {user.role === 'NURSE' && user.status === 'APPROVED' && (
            <DropdownMenuItem className="gap-2" asChild>
              <a href={`/n/${user.id}`} target="_blank" rel="noopener noreferrer">
                <IdCard className="size-4" />
                عرض البطاقة العامة
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              setNewPassword('')
              setPasswordOpen(true)
            }}
            className="gap-2"
          >
            <KeyRound className="size-4" />
            تعيين كلمة مرور جديدة
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmAction({ kind: 'DELETE' })}
            className="gap-2 text-red-600 focus:text-red-600"
          >
            <Trash2 className="size-4" />
            حذف نهائي
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* رفض الحساب — بسبب */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض الحساب</DialogTitle>
            <DialogDescription>
              سيتم إشعار {user.name} بسبب الرفض. يجب توضيح السبب.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-${user.id}`}>سبب الرفض</Label>
            <Textarea
              id={`reject-${user.id}`}
              rows={3}
              placeholder="مثال: صورة المزاولة غير واضحة، يرجى رفع نسخة أوضح"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim()}
              onClick={async () => {
                await statusMutation('REJECTED', rejectNote)
                setRejectOpen(false)
              }}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تعيين كلمة مرور جديدة */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              تعيين كلمة مرور جديدة
            </DialogTitle>
            <DialogDescription>
              سيتم تحديث كلمة مرور حساب {user.name} — أبلغها له بشكل آمن لتسجيل الدخول.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`pwd-${user.id}`}>كلمة المرور الجديدة</Label>
            <Input
              id={`pwd-${user.id}`}
              type={showPassword ? 'text' : 'password'}
              placeholder="8 أحرف على الأقل مع حروف وأرقام"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="accent-teal-600"
              />
              إظهار كلمة المرور
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={!newPassword.trim()} onClick={passwordMutation} className="gap-2">
              <KeyRound className="size-4" />
              حفظ كلمة المرور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نِسَب الحصة من قيمة كل تكليف — الجولة 32 */}
      <Dialog open={percentOpen} onOpenChange={setPercentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="size-4 text-primary" />
              نسبة الحصة من كل تكليف
            </DialogTitle>
            <DialogDescription>
              نسبة {user.name} من قيمة كل تكليف يُنهيه — تُحتسب تلقائياً عند توزيع الرسوم.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-bold text-foreground">التلقائي: {user.autoSharePercent ?? 5}٪</span>{' '}
                — نصف نسبة الإدارة. اترك الحقل فارغاً لاستخدامها.
              </p>
              <p className="mt-1">
                لتخصيص نسبة خاصة لهذا الحساب أدخل رقماً من 0 إلى 100 — مثال: 9 أو 10.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`percent-${user.id}`}>النسبة المئوية (٪) — فارغ = تلقائي</Label>
              <Input
                id={`percent-${user.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.5"
                placeholder={`مثال: 9 — أو اتركه فارغاً للتلقائي (${user.autoSharePercent ?? 5}٪)`}
                value={percentValue}
                onChange={(e) => setPercentValue(e.target.value)}
              />
              {percentValue.trim() !== '' &&
                (isNaN(Number(percentValue)) ||
                  Number(percentValue) < 0 ||
                  Number(percentValue) > 100) && (
                  <p className="text-xs text-destructive">أدخل نسبة بين 0 و 100</p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPercentOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={percentMutation}
              disabled={pending || (percentValue.trim() !== '' && (isNaN(Number(percentValue)) || Number(percentValue) < 0 || Number(percentValue) > 100))}
              className="gap-2"
            >
              <Percent className="size-4" />
              {percentValue.trim() === '' ? 'العودة للتلقائي' : 'حفظ النسبة المخصصة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* أذونات رؤية البيانات الكاملة — الجولة 32 */}
      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className={`size-4 ${accessValue ? 'text-emerald-600' : 'text-muted-foreground'}`} />
              إذن رؤية البيانات الكاملة
            </DialogTitle>
            <DialogDescription>
              يفتح لـ {user.name} إمكانية رؤية{' '}
              {user.role === 'DOCTOR_SUPERVISOR' ? 'الأطباء' : 'الكوادر التمريضية'} كاملين مع
              السيرة الذاتية والمستندات وكل البيانات من حسابه.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border bg-secondary/40 p-3">
              <div>
                <p className="text-sm font-bold">
                  {accessValue ? 'الإذن مفتوح' : 'الإذن مغلق'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {accessValue
                    ? 'يظهر له زر «السيرة الذاتية الكاملة» في المفضلة وكوادر/أطباء جهته'
                    : 'يرى البيانات المهنية المختصرة فقط كما هو معتاد'}
                </p>
              </div>
              <Switch
                checked={accessValue}
                onCheckedChange={(v) => setAccessValue(v)}
                disabled={pending}
                aria-label="تبديل إذن رؤية البيانات الكاملة"
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              الإذن يُفعَّل أو يُسحب في أي وقت — ويصل صاحب الحساب إشعار بالتغيير فوراً.
              البيانات تبقى محمية بنظام الأذونات ولا تُعرض لأي حساب آخر.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessOpen(false)}>
              إغلاق
            </Button>
            <Button
              onClick={() => accessMutation(accessValue)}
              disabled={pending || accessValue === (user.fullProfileAccess ?? false)}
              className="gap-2"
            >
              <ShieldCheck className="size-4" />
              {accessValue ? 'فتح الإذن' : 'سحب الإذن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* بطاقات التأكيد */}
      <ConfirmDialog
        open={confirmAction?.kind === 'APPROVED'}
        onOpenChange={(v) => !v && setConfirmAction(null)}
        tone="success"
        title={user.status === 'SUSPENDED' ? 'إعادة تنشيط الحساب' : 'اعتماد الحساب'}
        description={
          user.status === 'SUSPENDED'
            ? `سيتمكن ${user.name} من تسجيل الدخول واستخدام المنصة مجدداً بعد إعادة التنشيط.`
            : user.role === 'NURSE'
              ? `بعد الاعتماد يستطيع ${user.name} تسجيل الدخول والتقديم على التكليفات فوراً — تم التحقق من وجود مستنداته المرفوعة.`
              : `بعد الاعتماد يستطيع ${user.name} تسجيل الدخول وإنشاء التكليفات فوراً.`
        }
        confirmLabel="نعم، اعتمد الحساب"
        processing={pending}
        onConfirm={async () => {
          await statusMutation('APPROVED')
          setConfirmAction(null)
        }}
      />

      <ConfirmDialog
        open={confirmAction?.kind === 'SUSPENDED'}
        onOpenChange={(v) => !v && setConfirmAction(null)}
        tone="warning"
        icon={Ban}
        title="إيقاف الحساب مؤقتاً"
        description={`سيُمنع ${user.name} من تسجيل الدخول مؤقتاً دون حذف أي بيانات، ويمكن إعادة تنشيطه في أي وقت.`}
        confirmLabel="نعم، أوقف الحساب"
        processing={pending}
        onConfirm={async () => {
          await statusMutation('SUSPENDED')
          setConfirmAction(null)
        }}
      />

      <ConfirmDialog
        open={confirmAction?.kind === 'DELETE'}
        onOpenChange={(v) => !v && setConfirmAction(null)}
        tone="danger"
        icon={Trash2}
        title="حذف الحساب نهائياً"
        description={`سيتم حذف حساب ${user.name} نهائياً مع جميع مستنداته وتقديماته وتكليفاته وإشعاراته. هذا الإجراء لا يمكن التراجع عنه!`}
        confirmLabel="نعم، احذف نهائياً"
        processing={pending}
        onConfirm={deleteMutation}
      />
    </>
  )
}


export { USER_STATUS_LABELS }
