'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Eye,
  MessageCircle,
  PencilLine,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { REQUIRED_DOC_TYPES, type DocLite } from '@/components/admin/nurse-docs'

/**
 * الجولة 63 — إرسال إشعار واتساب للكادر من شاشة الإدارة (طلب المستخدم الصريح):
 * تحديد سبب التواصل + المستندات الناقصة + ملاحظات الإدارة ← رسالة احترافية
 * قابلة للتعديل ← معاينة ← إرسال عبر واتساب (wa.me) مع توثيق الرسالة
 * في «سجل التواصل» (إشعار داخلي يصل للكادر عبر نظام الإشعارات القائم).
 * لا يُغيّر أي بيانات حساب — توثيق وتواصل فقط.
 */

const MISSING_DOC_OPTIONS: { value: string; label: string }[] = [
  { value: 'ID_CARD', label: 'الهوية الوطنية / البطاقة الشخصية' },
  { value: 'PRACTICE_LICENSE', label: 'صورة مزاولة المهنة' },
  { value: 'EXPERIENCE_CERT', label: 'شهادة الخبرة' },
  { value: 'QUALIFICATION', label: 'المؤهل العلمي' },
  { value: 'PERSONAL_PHOTO', label: 'صورة شخصية واضحة' },
  { value: 'DATA_FIX', label: 'بيانات ناقصة تحتاج استكمالاً' },
  { value: 'DATA_CORRECT', label: 'معلومات تحتاج تصحيحاً' },
]

const REASON_OPTIONS = [
  { value: 'missing_docs', label: 'مستندات ناقصة' },
  { value: 'data_fix', label: 'تصحيح بيانات' },
  { value: 'reupload', label: 'إعادة رفع مستند' },
  { value: 'other', label: 'ملاحظة أخرى' },
]

const STATUS_LINE: Record<string, string> = {
  PENDING: '🟠 قيد المراجعة',
  APPROVED: '🟢 معتمد',
  REJECTED: '🔴 مرفوض',
  SUSPENDED: '⚪ موقوف',
}

/** تحويل رقم اليمن إلى الصيغة الدولية لواتساب (967) */
export function toWhatsAppIntl(phone: string): string {
  let p = (phone || '').replace(/\D/g, '')
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('967')) return p
  if (p.startsWith('0')) return `967${p.slice(1)}`
  return `967${p}`
}

export interface WhatsAppTarget {
  id: string
  name: string
  phone: string
  status: string
  documents?: DocLite[] | null
}

export function WhatsAppNotificationModal({
  open,
  onOpenChange,
  target,
  onSent,
  initialNote = '',
  initialReason = 'missing_docs',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: WhatsAppTarget | null
  onSent?: () => void
  /** ملاحظة إدارة مبدئية (مثلاً سبب الرفض عند الرفض) */
  initialNote?: string
  /** سبب التواصل المبدئي */
  initialReason?: string
}) {
  const [reasons, setReasons] = useState<string[]>([initialReason])
  const [missing, setMissing] = useState<string[]>([])
  const [note, setNote] = useState(initialNote)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)

  // المستندات الناقصة فعلياً (من بيانات القائمة الحقيقية) تُحدَّد تلقائياً — وتبقى قابلة للتعديل
  useEffect(() => {
    if (!open || !target) return
    setReasons(initialReason ? [initialReason] : [])
    setNote(initialNote)
    setPreview(false)
    const auto: string[] = []
    for (const t of REQUIRED_DOC_TYPES) {
      const st = (target.documents ?? []).find((d) => d.type === t)?.status
      if (st !== 'APPROVED') auto.push(t)
    }
    setMissing(auto)
  }, [open, target, initialNote, initialReason])

  const builtMessage = useMemo(() => {
    if (!target) return ''
    const missingLabels = MISSING_DOC_OPTIONS.filter((o) => missing.includes(o.value)).map((o) => o.label)
    const parts: string[] = []
    parts.push(`السلام عليكم ${target.name}،`)
    parts.push('')
    parts.push('تمت مراجعة حسابك في منصة تكليفات | Takleefat.')
    parts.push('')
    parts.push('حالة الحساب:')
    parts.push(STATUS_LINE[target.status] ?? target.status)
    if (missingLabels.length > 0) {
      parts.push('')
      parts.push('يرجى استكمال/تصحيح المستندات والمتطلبات التالية:')
      parts.push(missingLabels.map((l) => `⚠ ${l}`).join('\n'))
    }
    if (note.trim()) {
      parts.push('')
      parts.push('ملاحظة الإدارة:')
      parts.push(note.trim())
    }
    parts.push('')
    parts.push('بعد استكمال البيانات والمستندات سيتم إعادة مراجعة حسابك من قبل الإدارة.')
    parts.push('')
    parts.push('تكليفات | TAKLEEFAT')
    parts.push('منصة رقمية تربط الجهات الصحية بالكوادر في اليمن.')
    return parts.join('\n')
  }, [target, missing, note])

  useEffect(() => {
    setMessage(builtMessage)
  }, [builtMessage])

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  async function send() {
    if (!target || !message.trim()) return
    setSending(true)
    try {
      // توثيق الرسالة في سجل التواصل + إشعار داخلي للكادر — الفشل لا يمنع فتح واتساب
      try {
        await apiPost(`/api/admin/users/${target.id}/contact-log`, { message: message.trim() })
      } catch {
        toast.warning('تم تحضير رسالة واتساب — تعذر تسجيلها في السجل، حاول لاحقاً')
      }
      const url = `https://wa.me/${toWhatsAppIntl(target.phone)}?text=${encodeURIComponent(message.trim())}`
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.success('تم فتح واتساب لتأكيد الإرسال — وسُجّلت الرسالة في سجل التواصل')
      onOpenChange(false)
      onSent?.()
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto grid-cols-1">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300">
              <MessageCircle className="size-4" />
            </span>
            إرسال إشعار عبر واتساب
          </DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                المستلم: <span className="font-bold text-foreground">{target.name}</span>{' '}
                <span dir="ltr" className="font-semibold text-foreground">
                  {target.phone}
                </span>
              </>
            ) : (
              'حدد الكادر المطلوب إشعاره'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* سبب التواصل */}
          <div className="space-y-2">
            <Label className="text-sm font-bold">سبب التواصل</Label>
            <div className="grid grid-cols-1 gap-1.5 rounded-2xl border bg-secondary/30 p-3 sm:grid-cols-2">
              {REASON_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium hover:bg-accent"
                >
                  <Checkbox checked={reasons.includes(o.value)} onCheckedChange={() => setReasons((r) => toggle(r, o.value))} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          {/* المستندات والنواقص */}
          <div className="space-y-2">
            <Label className="text-sm font-bold">المستندات / النواقص المطلوبة</Label>
            <p className="text-xs text-muted-foreground">
              حُدّدت النواقص الفعلية تلقائياً من ملف الكادر — عدّلها إن أحببت.
            </p>
            <div className="grid grid-cols-1 gap-1.5 rounded-2xl border bg-secondary/30 p-3 sm:grid-cols-2">
              {MISSING_DOC_OPTIONS.map((o) => {
                const auto = (REQUIRED_DOC_TYPES as readonly string[]).includes(o.value)
                return (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium hover:bg-accent"
                  >
                    <Checkbox checked={missing.includes(o.value)} onCheckedChange={() => setMissing((m) => toggle(m, o.value))} />
                    {o.label}
                    {auto && <span className="text-[10px] text-muted-foreground">(مستند)</span>}
                  </label>
                )
              })}
            </div>
          </div>

          {/* ملاحظات الإدارة */}
          <div className="space-y-2">
            <Label htmlFor="wa-note" className="text-sm font-bold">
              ملاحظات الإدارة (تظهر في الرسالة)
            </Label>
            <Textarea
              id="wa-note"
              rows={2}
              placeholder="مثال: يرجى رفع صورة واضحة من مزاولة المهنة وإضافة شهادة الخبرة."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* الرسالة القابلة للتعديل / المعاينة */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold">الرسالة</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreview((p) => !p)}
                className="h-7 gap-1.5 text-xs"
              >
                {preview ? <PencilLine className="size-3.5" /> : <Eye className="size-3.5" />}
                {preview ? 'تحرير الرسالة' : 'معاينة الرسالة'}
              </Button>
            </div>
            {preview ? (
              <div className="rounded-2xl border border-emerald-200/70 bg-[#e7ffdb] p-3 dark:border-emerald-900 dark:bg-emerald-950/60">
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[13px] leading-relaxed text-foreground">{message}</p>
                <p className="mt-1 text-end text-[10px] text-muted-foreground">معاينة كما ستظهر في واتساب</p>
              </div>
            ) : (
              <Textarea
                rows={9}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="text-[13px] leading-relaxed"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={send}
            disabled={sending || !message.trim()}
            className="gap-2 bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
          >
            <Send className="size-4" />
            {sending ? 'جارٍ التحضير...' : 'إرسال عبر واتساب'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
