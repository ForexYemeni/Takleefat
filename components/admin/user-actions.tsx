'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Layers,
  Loader2,
  MoreHorizontal,
  Percent,
  PlayCircle,
  PhoneCall,
  ShieldCheck,
  Trash2,
  UserCog,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { apiPatch, apiDelete, apiFetcher } from '@/lib/api-client'
import { USER_STATUS_LABELS, ROLE_LABELS } from '@/lib/utils'
import { ROLE_THEME, type RoleKey } from '@/lib/role-theme'
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
 * قائمة إجراءات الحساب — تُستخدم في صفحات الكادر الصحي والأطباء والمستلمين الإداريين والمشرفين:
 * عرض / اعتماد / رفض (بسبب) / إيقاف / تنشيط / نقل إلى دور آخر / تغيير كلمة المرور / حذف نهائي
 * مع بطاقات تأكيد احترافية بدل نوافذ المتصفح.
 */

/** الجولة 59 — خيارات نقل الدور مع وصف مختصر لكل دور (بلون دوره من هوية المنصة) */
const ROLE_CHOICES: { key: RoleKey; hint: string }[] = [
  { key: 'NURSE', hint: 'يتصفح التكليفات المُعلنة ويتقدم عليها وينفّذها' },
  { key: 'DOCTOR', hint: 'منظومة الأطباء — تكليفات طبية حسب التخصص' },
  { key: 'RECEIVER', hint: 'يُعلن التكليفات ويستلمها ويدير كوادر جهته' },
  { key: 'DOCTOR_SUPERVISOR', hint: 'يشرف على أطباء جهته الصحية ويديرهم' },
]

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
  /** إذن «موثوق جداً» لرؤية بيانات الاتصال — الجولة 36 */
  trustedContactViewer?: boolean
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
  // الجولة 57 — تأكيد الحذف بكلمة مرور الإدارة
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)
  const { data: session } = useSession()
  // الجولة 32 — نِسَب الحصة وأذونات البيانات الكاملة (المستلم الإداري ومشرف الأطباء)
  const [percentOpen, setPercentOpen] = useState(false)
  const [percentValue, setPercentValue] = useState<string>('')
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessValue, setAccessValue] = useState(false)
  // الجولة 36 — إذن «موثوق جداً» لرؤية بيانات الاتصال
  const [trustedOpen, setTrustedOpen] = useState(false)
  const [trustedValue, setTrustedValue] = useState(false)
  // الجولة 59 — نقل الحساب إلى دور آخر بتأكيد كلمة مرور الإدارة
  const [roleOpen, setRoleOpen] = useState(false)
  const [roleTarget, setRoleTarget] = useState<string | null>(null)
  const [rolePassword, setRolePassword] = useState('')
  const [showRolePassword, setShowRolePassword] = useState(false)
  // الجولة 60 — الصلاحيات المركّبة: منح/سحب أدوار إضافية فوق الدور الأساسي
  const [capsOpen, setCapsOpen] = useState(false)
  const [capsLoading, setCapsLoading] = useState(false)
  const [capsExtras, setCapsExtras] = useState<string[]>([]) // الحالية من القاعدة عند فتح الحوار
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]) // المختارة في الحوار
  const [capsPassword, setCapsPassword] = useState('')
  const [showCapsPassword, setShowCapsPassword] = useState(false)
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'APPROVED' }
    | { kind: 'SUSPENDED' }
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
    if (!deletePassword.trim()) return
    setPending(true)
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/users/${user.id}`, {
        password: deletePassword,
      })
      toast.success(res.message)
      setDeleteOpen(false)
      setDeletePassword('')
      setShowDeletePassword(false)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  /** الجولة 59 — نقل الحساب إلى دور آخر: بوابة كلمة مرور الإدارة إلزامية على الخادم */
  const roleMutation = async () => {
    if (!roleTarget || !rolePassword.trim()) return
    setPending(true)
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/users/${user.id}`, {
        role: roleTarget,
        password: rolePassword,
      })
      toast.success(res.message)
      setRoleOpen(false)
      setRoleTarget(null)
      setRolePassword('')
      setShowRolePassword(false)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  /** الجولة 60 — فتح حوار الصلاحيات المركّبة: جلب الحالة الموثوقة من القاعدة أولاً */
  const openCapsDialog = async () => {
    setCapsOpen(true)
    setCapsLoading(true)
    setCapsPassword('')
    setShowCapsPassword(false)
    try {
      const res = await apiFetcher<{ user: { role?: string; extraRoles?: string[] } }>(
        `/api/admin/users/${user.id}`
      )
      const current = Array.isArray(res.user?.extraRoles) ? res.user.extraRoles : []
      setCapsExtras(current)
      setSelectedExtras(current)
    } catch (e) {
      toast.error((e as Error).message)
      setCapsOpen(false)
    } finally {
      setCapsLoading(false)
    }
  }

  /** الجولة 60 — حفظ الصلاحيات المركّبة (استبدال كامل + بوابة كلمة مرور الإدارة على الخادم) */
  const capsMutation = async () => {
    if (!capsPassword.trim()) return
    setPending(true)
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/users/${user.id}`, {
        extraRoles: selectedExtras,
        password: capsPassword,
      })
      toast.success(res.message)
      setCapsOpen(false)
      setCapsPassword('')
      setShowCapsPassword(false)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  /** هل تغيّر اختيار الحوار عن الحالة الحالية من القاعدة؟ */
  const capsChanged =
    [...selectedExtras].sort().join(',') !== [...capsExtras].sort().join(',')

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

  /** فتح/إغلاق إذن «موثوق جداً» لرؤية بيانات الاتصال — الجولة 36 */
  const trustedMutation = async (next: boolean) => {
    setPending(true)
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/users/${user.id}`, {
        trustedContactViewer: next,
      })
      toast.success(res.message)
      setTrustedValue(next)
      invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  const [pending, setPending] = useState(false)

  // سياسة الاعتماد (الجولة 34 + 57): كادر صحي أو طبيب بلا مستندات مرفوعة لا يمكن اعتماده إطلاقاً
  const documentsMissing =
    (user.role === 'NURSE' || user.role === 'DOCTOR') && (user.documentsCount ?? 0) === 0

  // الجولة 32 — حسابات المستلمين/المشرفين: نسبة الحصة + أذونات البيانات الكاملة
  const shareManaged = user.role === 'RECEIVER' || user.role === 'DOCTOR_SUPERVISOR'

  // الجولة 59 — بيانات شريط النقل: الدور الحالي والدور المختار بألوانهما من هوية المنصة
  const currentRoleLabel =
    user.role && ROLE_LABELS[user.role] ? ROLE_LABELS[user.role] : 'الدور الحالي'
  const currentTheme =
    user.role && user.role in ROLE_THEME ? ROLE_THEME[user.role as RoleKey] : null
  const targetTheme =
    roleTarget && roleTarget in ROLE_THEME ? ROLE_THEME[roleTarget as RoleKey] : null

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
          {shareManaged && (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                setTrustedValue(user.trustedContactViewer ?? false)
                setTrustedOpen(true)
              }}
            >
              <PhoneCall
                className={`size-4 ${user.trustedContactViewer ? 'text-emerald-600' : ''}`}
              />
              <span className="flex flex-col">
                <span>الموثوق لبيانات الاتصال</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {user.trustedContactViewer
                    ? 'موثوق جداً — يرى أرقام أي كادر/طبيب في أي وقت'
                    : 'غير موثوق — الأرقام حسب قاعدة السداد والإنهاء'}
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
              setRoleTarget(null)
              setRolePassword('')
              setShowRolePassword(false)
              setRoleOpen(true)
            }}
            className="gap-2"
          >
            <UserCog className="size-4" />
            <span className="flex flex-col">
              <span>نقل الحساب إلى دور آخر</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                {user.role && ROLE_LABELS[user.role]
                  ? `الدور الحالي: ${ROLE_LABELS[user.role]}`
                  : 'تغيير دور الحساب بالكامل — بتأكيد كلمة المرور'}
              </span>
            </span>
          </DropdownMenuItem>
          {/* الجولة 60 — الصلاحيات المركّبة: أدوار إضافية فوق الدور الأساسي دون تغييره */}
          <DropdownMenuItem onClick={openCapsDialog} className="gap-2">
            <Layers className="size-4" />
            <span className="flex flex-col">
              <span>الصلاحيات المركّبة</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                أدوار إضافية فوق دوره الأساسي — يفتح أكثر من لوحة
              </span>
            </span>
          </DropdownMenuItem>
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
            onClick={() => {
              setDeletePassword('')
              setShowDeletePassword(false)
              setDeleteOpen(true)
            }}
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

      {/* إذن «موثوق جداً» لرؤية بيانات الاتصال — الجولة 36 */}
      <Dialog open={trustedOpen} onOpenChange={setTrustedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className={`size-4 ${trustedValue ? 'text-emerald-600' : 'text-muted-foreground'}`} />
              تصنيف «موثوق جداً» لبيانات الاتصال
            </DialogTitle>
            <DialogDescription>
              يفتح لـ {user.name} رؤية أرقام تواصل أي كادر صحي أو طبيب في أي وقت —
              حتى بعد إنهاء التكليفات.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border bg-secondary/40 p-3">
              <div>
                <p className="text-sm font-bold">
                  {trustedValue ? 'موثوق جداً' : 'غير موثوق'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {trustedValue
                    ? 'يرى أرقام التواصل في الدليل والسير وتكليفاته دائماً'
                    : 'الأرقام تُفتح له أثناء التكليفات السارية المسددة فقط'}
                </p>
              </div>
              <Switch
                checked={trustedValue}
                onCheckedChange={(v) => setTrustedValue(v)}
                disabled={pending}
                aria-label="تبديل إذن موثوق لبيانات الاتصال"
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              بعد إنهاء أي تكليف تُخفى بيانات الاتصال من الطرفين تلقائياً — ولا تبقى ظاهرة
              إلا للإدارة ولمن تصنفه الإدارة «موثوق جداً». الإذن يُفعّل أو يُسحب في أي وقت
              ويصل صاحب الحساب إشعار بالتغيير فوراً.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrustedOpen(false)}>
              إغلاق
            </Button>
            <Button
              onClick={() => trustedMutation(trustedValue)}
              disabled={pending || trustedValue === (user.trustedContactViewer ?? false)}
              className="gap-2"
            >
              <PhoneCall className="size-4" />
              {trustedValue ? 'تصنيف موثوق جداً' : 'سحب التصنيف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* الجولة 59 — نقل الحساب إلى دور آخر: من أي دور إلى أي دور بالاتجاهين
          (كادر ↔ مستلم ↔ مشرف ↔ طبيب) مع بوابة تأكيد بكلمة مرور الإدارة —
          نفس نمط الحذف النهائي، لكن النقل قابل للعكس وكل البيانات تبقى محفوظة */}
      <Dialog open={roleOpen} onOpenChange={(v) => !pending && setRoleOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-4 ring-primary/10">
                <UserCog className="size-5" />
              </span>
              نقل الحساب إلى دور آخر
            </DialogTitle>
            <DialogDescription>
              نقل حساب {user.name} إلى أي دور في المنصة — كل بياناته ومستنداته
              وتكليفاته السابقة تبقى محفوظة كاملة، والنقل قابل للعكس في أي وقت.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* شريط النقل: الدور الحالي ← الدور الجديد (بلون كل دور من هوية المنصة) */}
            <div className="flex items-center justify-center gap-3 rounded-xl border bg-secondary/40 p-3">
              <span className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs font-bold shadow-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: currentTheme?.accent ?? 'hsl(var(--muted-foreground))' }}
                  aria-hidden
                />
                {currentRoleLabel}
              </span>
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold shadow-sm transition-colors"
                style={
                  roleTarget && targetTheme
                    ? { backgroundColor: targetTheme.accentSoft, color: targetTheme.accentStrong }
                    : { backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--muted-foreground))' }
                }
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: targetTheme?.accent ?? 'hsl(var(--muted-foreground))',
                  }}
                  aria-hidden
                />
                {roleTarget && ROLE_LABELS[roleTarget] ? ROLE_LABELS[roleTarget] : 'اختر الدور الجديد'}
              </span>
            </div>

            {/* بطاقات اختيار الدور الجديد — كل دور بلونه من الهوية اللونية */}
            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="اختيار الدور الجديد"
            >
              {ROLE_CHOICES.filter((r) => r.key !== user.role).map((r) => {
                const selected = roleTarget === r.key
                const theme = ROLE_THEME[r.key]
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRoleTarget(r.key)}
                    className="flex items-start gap-2.5 rounded-xl border p-3 text-start transition-all hover:bg-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={
                      selected
                        ? {
                            boxShadow: `inset 0 0 0 2px ${theme.accent}`,
                            backgroundColor: theme.accentSoft,
                            borderColor: 'transparent',
                          }
                        : undefined
                    }
                  >
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                      style={
                        selected
                          ? { backgroundColor: theme.accent, borderColor: theme.accent }
                          : { borderColor: 'hsl(var(--border))' }
                      }
                    >
                      {selected && <Check className="size-3 text-white" />}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-bold">{theme.label}</span>
                      <span className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {r.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ما يحدث بعد النقل — شفافية كاملة قبل التأكيد */}
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3.5 text-xs leading-relaxed text-teal-900">
              <p className="font-extrabold">ماذا يحدث بعد النقل؟</p>
              <p className="mt-1">
                الدور الجديد يسري فوراً عند تحديث صفحته أو تسجيل دخوله • كل بياناته
                ومستنداته وتكليفاته السابقة تبقى محفوظة كاملة • يمكن نقله مجدداً إلى
                أي دور في أي وقت • يصل صاحب الحساب إشعار بالتغيير فوراً.
              </p>
            </div>

            {/* بوابة الهوية: كلمة مرور حساب الإدارة — إلزامية قبل أي نقل */}
            <div className="space-y-2">
              <Label htmlFor={`role-pwd-${user.id}`} className="font-bold">
                كلمة مرور حساب الإدارة الخاص بك
                {session?.user?.name ? ` — ${session.user.name}` : ''}
              </Label>
              <div className="relative">
                <Input
                  id={`role-pwd-${user.id}`}
                  type={showRolePassword ? 'text' : 'password'}
                  dir="ltr"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={rolePassword}
                  onChange={(e) => setRolePassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && roleTarget && rolePassword.trim() && !pending)
                      roleMutation()
                  }}
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowRolePassword((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showRolePassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showRolePassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-teal-600" />
                بوابة أمان إضافية: لن يُنفَّذ النقل إلا بعد التحقق من كلمة مرور حسابك
                الإداري على الخادم — حماية من أي ضغطة خاطئة أو استخدام غير مصرح بجهازك.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button
              onClick={roleMutation}
              disabled={pending || !roleTarget || !rolePassword.trim()}
              className="gap-2"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  جارٍ نقل الحساب...
                </>
              ) : (
                <>
                  <UserCog className="size-4" />
                  تأكيد النقل
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* الجولة 60 — الصلاحيات المركّبة: منح/سحب أدوار إضافية فوق الدور الأساسي
          — الدور الأساسي يبقى كما هو، والحساب يفتح لوحة كل صلاحية ممنوحة له،
          ببوابة تأكيد بكلمة مرور الإدارة مثل النقل والحذف */}
      <Dialog open={capsOpen} onOpenChange={(v) => !pending && setCapsOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-4 ring-primary/10">
                <Layers className="size-5" />
              </span>
              الصلاحيات المركّبة
            </DialogTitle>
            <DialogDescription>
              منح {user.name} صلاحية فتح لوحات أدوار إضافية فوق دوره الأساسي — دوره
              الأساسي وكل بياناته لا تتغير إطلاقاً، ويمكن سحب أي صلاحية في أي وقت.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* الدور الأساسي — ثابت ولا يُمس */}
            <div className="flex items-center justify-between rounded-xl border bg-secondary/40 p-3">
              <span className="flex items-center gap-2 text-xs font-bold">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: currentTheme?.accent ?? 'hsl(var(--muted-foreground))' }}
                  aria-hidden
                />
                الدور الأساسي: {currentRoleLabel}
              </span>
              <span className="rounded-md bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground shadow-sm">
                يبقى كما هو — لا يتغير
              </span>
            </div>

            {/* مفاتيح الصلاحيات — كل دور بلونه (الدور الأساسي مستبعد) */}
            <div
              className="space-y-2"
              role="group"
              aria-label="الصلاحيات الإضافية الممنوحة"
            >
              {capsLoading && (
                <div className="flex items-center justify-center gap-2 rounded-xl border bg-secondary/40 p-4 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  جارٍ جلب الصلاحيات الحالية...
                </div>
              )}
              {!capsLoading &&
                ROLE_CHOICES.filter((r) => r.key !== user.role).map((r) => {
                  const enabled = selectedExtras.includes(r.key)
                  const theme = ROLE_THEME[r.key]
                  return (
                    <div
                      key={r.key}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors"
                      style={enabled ? { backgroundColor: theme.accentSoft, borderColor: 'transparent' } : undefined}
                    >
                      <span className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                          aria-hidden
                        />
                        <span className="flex flex-col">
                          <span className="text-sm font-bold">{theme.label}</span>
                          <span className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {r.hint}
                          </span>
                        </span>
                      </span>
                      <Switch
                        checked={enabled}
                        disabled={pending}
                        onCheckedChange={(v) =>
                          setSelectedExtras((prev) =>
                            v ? [...prev, r.key] : prev.filter((k) => k !== r.key)
                          )
                        }
                        aria-label={`${enabled ? 'سحب' : 'منح'} صلاحية ${theme.label}`}
                      />
                    </div>
                  )
                })}
            </div>

            {/* ماذا يحدث؟ — شفافية كاملة قبل الحفظ */}
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3.5 text-xs leading-relaxed text-teal-900">
              <p className="font-extrabold">ماذا يحدث للصلاحيات الممنوحة؟</p>
              <p className="mt-1">
                يظهر له مبدّل لوحات في حسابه فيفتح لوحة كل صلاحية ويعمل بكل قدراتها
                (استدعاء الأطباء، إدارة الكوادر، التصفح والتقديم...) • الدور الأساسي
                وكل البيانات والتكليفات تبقى كما هي • سحب الصلاحية يغلق اللوحة فوراً
                • يصل صاحب الحساب إشعاراً بكل منح أو سحب.
              </p>
            </div>

            {/* بوابة الهوية: كلمة مرور حساب الإدارة — إلزامية قبل أي منح/سحب */}
            <div className="space-y-2">
              <Label htmlFor={`caps-pwd-${user.id}`} className="font-bold">
                كلمة مرور حساب الإدارة الخاص بك
                {session?.user?.name ? ` — ${session.user.name}` : ''}
              </Label>
              <div className="relative">
                <Input
                  id={`caps-pwd-${user.id}`}
                  type={showCapsPassword ? 'text' : 'password'}
                  dir="ltr"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={capsPassword}
                  onChange={(e) => setCapsPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && capsChanged && capsPassword.trim() && !pending)
                      capsMutation()
                  }}
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCapsPassword((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showCapsPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showCapsPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-teal-600" />
                بوابة أمان إضافية: لن يُنفَّذ المنح أو السحب إلا بعد التحقق من كلمة مرور
                حسابك الإداري على الخادم — حماية من أي ضغطة خاطئة أو استخدام غير مصرح.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCapsOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button
              onClick={capsMutation}
              disabled={pending || capsLoading || !capsChanged || !capsPassword.trim()}
              className="gap-2"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  جارٍ حفظ الصلاحيات...
                </>
              ) : (
                <>
                  <Layers className="size-4" />
                  حفظ الصلاحيات
                </>
              )}
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
            : user.role === 'NURSE' || user.role === 'DOCTOR'
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

      {/* الجولة 57 — تأكيد الحذف بكلمة مرور الإدارة: بوابة هوية إلزامية
          قبل أي حذف نهائي لحساب (مستلم إداري / مشرف أطباء / طبيب / كادر صحي)
          — الخادم يرفض أي حذف بلا كلمة مرور صحيحة حتى لو تسرب الجلسة */}
      <Dialog open={deleteOpen} onOpenChange={(v) => !pending && setDeleteOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-4 ring-red-500/10">
                <Trash2 className="size-5" />
              </span>
              <span className="text-red-700">حذف الحساب نهائياً</span>
            </DialogTitle>
            <DialogDescription>
              سيتم حذف حساب {user.name} نهائياً من منصة تكليفات — هذا الإجراء لا يمكن
              التراجع عنه إطلاقاً.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ما سيُحذف */}
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 text-xs leading-relaxed text-red-800">
              <p className="font-extrabold">ما سيُحذف مع الحساب:</p>
              <p className="mt-1">
                المستندات المرفوعة • التقديمات • التكليفات المرتبطة • التكليفات المُعلنة •
                الإشعارات — <span className="font-extrabold">لا استرجاع ولا عودة بعد التأكيد</span>.
              </p>
            </div>

            {/* بوابة الهوية: كلمة مرور حساب الإدارة */}
            <div className="space-y-2">
              <Label htmlFor={`del-pwd-${user.id}`} className="font-bold">
                كلمة مرور حساب الإدارة الخاص بك
                {session?.user?.name ? ` — ${session.user.name}` : ''}
              </Label>
              <div className="relative">
                <Input
                  id={`del-pwd-${user.id}`}
                  type={showDeletePassword ? 'text' : 'password'}
                  dir="ltr"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && deletePassword.trim() && !pending) deleteMutation()
                  }}
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showDeletePassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showDeletePassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-teal-600" />
                بوابة أمان إضافية: لن يُنفَّذ الحذف إلا بعد التحقق من كلمة مرور حسابك الإداري
                على الخادم — حماية من أي ضغطة خاطئة أو استخدام غير مصرح بجهازك.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={deleteMutation}
              disabled={pending || !deletePassword.trim()}
              className="gap-2"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  جارٍ الحذف النهائي...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  تأكيد الحذف النهائي
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}


export { USER_STATUS_LABELS }
