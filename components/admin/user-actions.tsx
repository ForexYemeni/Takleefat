'use client'

import { useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Eye,
  IdCard,
  KeyRound,
  MoreHorizontal,
  PlayCircle,
  Trash2,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { apiPatch, apiDelete } from '@/lib/api-client'
import { USER_STATUS_LABELS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

  const [pending, setPending] = useState(false)

  // سياسة الاعتماد: كادر تمريضي بلا مستندات مرفوعة لا يمكن اعتماده إطلاقاً
  const documentsMissing = user.role === 'NURSE' && (user.documentsCount ?? 0) === 0

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
