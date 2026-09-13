'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle2,
  Loader2,
  Settings,
  RefreshCw,
  SendHorizonal,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch, apiPost } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * لوحة إعدادات البريد الإلكتروني — الإدارة حصراً — الجولة 51
 * حالة خدمة البريد (Google Apps Script + Gmail) + إرسال بريد تجريبي + سجل الإرسال مع إعادة المحاولة.
 * الرابط والسر يبقيان في متغيرات البيئة — تُعرض حالة «مهيأة/غير مهيأة» فقط دون أي قيمة.
 */

interface EmailLogRow {
  id: string
  recipientEmailMasked: string
  notificationType: string
  subject: string
  status: string
  errorMessage: string | null
  sentAt: string | null
  createdAt: string
}

interface AdminEmailStatus {
  service: { configured: boolean; enabled: boolean; senderLabel: string }
  stats: { sent: number; failed: number; pending: number; lastSentAt: string | null }
  logs: EmailLogRow[]
}

const TYPE_LABELS: Record<string, string> = {
  EMAIL_VERIFICATION: 'رمز تأكيد البريد',
  ACCOUNT_SECURITY: 'أمان الحساب',
  TEST: 'رسالة تجريبية',
  POST_CREATED: 'تكليف جديد',
  APPLICATION_SUBMITTED: 'طلب تقديم',
  APPLICATION_APPROVED: 'قبول طلب',
  APPLICATION_REJECTED: 'رفض طلب',
  ASSIGNMENT_CREATED: 'تكليف معتمد',
  ASSIGNMENT_CANCELLED: 'إلغاء تكليف',
  DOCUMENT_REVIEWED: 'مراجعة مستند',
  ACCOUNT_APPROVED: 'اعتماد حساب',
  ACCOUNT_REJECTED: 'رفض حساب',
}

export function EmailServicePanel() {
  const qc = useQueryClient()
  const [testEmail, setTestEmail] = useState('')
  const [senderLabel, setSenderLabel] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-email-status'],
    queryFn: () => apiFetcher<AdminEmailStatus>('/api/admin/email'),
    refetchInterval: 60 * 1000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-email-status'] })

  const saveMutation = useMutation({
    mutationFn: (payload: { enabled?: boolean; senderLabel?: string }) =>
      apiPatch<{ message: string }>('/api/admin/email', payload),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const testMutation = useMutation({
    mutationFn: () =>
      apiPost<{ message: string; logId: string }>('/api/admin/email/test', {
        email: testEmail.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      setTestEmail('')
      invalidate()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const retryMutation = useMutation({
    mutationFn: (logId: string) =>
      apiPost<{ message: string; status: string }>(`/api/admin/email/logs/${logId}/retry`, {}),
    onSuccess: (res) => {
      if (res.status === 'sent') toast.success(res.message)
      else toast.error(res.message)
      invalidate()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const s = data
  const serviceLive = !!s?.service.configured && s.service.enabled

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2">
            <span className="rounded-xl bg-primary/10 p-1.5">
              <Settings className="size-4 text-primary" />
            </span>
            إعدادات البريد الإلكتروني
          </span>
          {s && (
            <Badge
              className={cn(
                serviceLive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              )}
              variant="secondary"
            >
              {serviceLive ? '🟢 تعمل' : s.service.configured ? '🟠 موقفة من الإدارة' : '🔴 غير مهيأة'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          خدمة الإرسال تعمل عبر Google Apps Script + Gmail حصراً — الرابط والسر محفوظان في متغيرات البيئة ولا يظهران هنا
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading || !s ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل حالة خدمة البريد...
          </p>
        ) : (
          <>
            {/* ---------- الحالة والإحصاءات ---------- */}
            <div className="grid gap-2 sm:grid-cols-4">
              <StatBox label="الرسائل المرسلة" value={s.stats.sent} tone="ok" />
              <StatBox label="الرسائل الفاشلة" value={s.stats.failed} tone={s.stats.failed > 0 ? 'bad' : 'neutral'} />
              <StatBox label="قيد الإرسال" value={s.stats.pending} tone="neutral" />
              <div className="rounded-2xl border p-3">
                <p className="text-xs text-muted-foreground">آخر عملية إرسال</p>
                <p className="mt-1 text-sm font-bold">
                  {s.stats.lastSentAt ? formatDate(s.stats.lastSentAt) : '—'}
                </p>
              </div>
            </div>

            {!s.service.configured && (
              <p className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                خدمة البريد غير مهيأة — أضف <span className="font-mono font-bold">GOOGLE_APPS_SCRIPT_URL</span> و{' '}
                <span className="font-mono font-bold">GOOGLE_APPS_SCRIPT_SECRET</span> في متغيرات البيئة ثم أعد النشر.
                خطوات الإعداد الكاملة في مجلد <span className="font-mono">google-apps-script/README.md</span> بالمستودع.
                حتى ذلك الحين كل العمليات الأساسية تعمل كالمعتاد والبريد يُسجَّل فاشلاً دون تعطيل أي شيء.
              </p>
            )}

            {/* ---------- التحكم ---------- */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-2xl border p-4">
                <div>
                  <p className="text-sm font-extrabold">تشغيل خدمة البريد</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">إيقافها يمنع الإرسال دون حذف أي إعداد</p>
                </div>
                <Switch
                  checked={s.service.enabled}
                  onCheckedChange={(v) => saveMutation.mutate({ enabled: v })}
                  disabled={saveMutation.isPending}
                  aria-label="تشغيل خدمة البريد"
                />
              </div>
              <div className="rounded-2xl border p-4">
                <Label htmlFor="email-sender-label" className="text-sm font-extrabold">
                  البريد المرسل (للعرض)
                </Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="email-sender-label"
                    dir="ltr"
                    placeholder="takleefat@gmail.com"
                    value={senderLabel ?? s.service.senderLabel}
                    onChange={(e) => setSenderLabel(e.target.value)}
                    style={{ textAlign: 'start' }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate({ senderLabel: senderLabel ?? s.service.senderLabel })}
                  >
                    حفظ
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  حساب Gmail الذي نُشر منه السكربت — تُدخله يدوياً للعرض في اللوحة
                </p>
              </div>
            </div>

            {/* ---------- البريد التجريبي ---------- */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-extrabold">إرسال بريد تجريبي</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                اتركه فارغاً للإرسال إلى بريدك المؤكد، أو أدخل بريداً مباشراً للفحص
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Input
                  dir="ltr"
                  inputMode="email"
                  placeholder="name@gmail.com"
                  className="max-w-72 flex-1"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  style={{ textAlign: 'start' }}
                />
                <Button
                  className="gap-1.5"
                  disabled={testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <SendHorizonal className="size-4" />
                  )}
                  إرسال بريد تجريبي
                </Button>
              </div>
            </div>

            {/* ---------- سجل الإرسال ---------- */}
            <div className="rounded-2xl border">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-extrabold">
                  <Activity className="size-4 text-primary" />
                  سجل إرسال البريد — آخر 20 رسالة
                </p>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={invalidate}>
                  <RefreshCw className="size-3.5" />
                  تحديث
                </Button>
              </div>
              {s.logs.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  لا رسائل مُسجَّلة بعد — أرسل رسالة تجريبية للبدء
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-secondary/80 text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 text-start font-bold">النوع</th>
                        <th className="px-3 py-2 text-start font-bold">المستلم</th>
                        <th className="px-3 py-2 text-start font-bold">الحالة</th>
                        <th className="px-3 py-2 text-start font-bold">التاريخ</th>
                        <th className="px-3 py-2 text-start font-bold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.logs.map((l) => (
                        <tr key={l.id} className="border-t">
                          <td className="px-3 py-2 font-bold">{TYPE_LABELS[l.notificationType] ?? l.notificationType}</td>
                          <td className="px-3 py-2 font-mono" dir="ltr">{l.recipientEmailMasked}</td>
                          <td className="px-3 py-2">
                            {l.status === 'sent' ? (
                              <span className="flex items-center gap-1 font-bold text-emerald-600">
                                <CheckCircle2 className="size-3.5" /> أُرسلت
                              </span>
                            ) : l.status === 'failed' ? (
                              <span className="flex items-center gap-1 font-bold text-red-600" title={l.errorMessage ?? ''}>
                                <XCircle className="size-3.5" /> فشلت
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-bold text-amber-600">
                                <Loader2 className="size-3.5 animate-spin" /> جارية
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDate(l.createdAt)}</td>
                          <td className="px-3 py-2">
                            {l.status === 'failed' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                disabled={retryMutation.isPending}
                                onClick={() => retryMutation.mutate(l.id)}
                              >
                                <RefreshCw className="size-3" />
                                إعادة الإرسال
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'bad' | 'neutral' }) {
  return (
    <div className="rounded-2xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-extrabold',
          tone === 'ok' && 'text-emerald-600',
          tone === 'bad' && 'text-red-600'
        )}
      >
        {value}
      </p>
    </div>
  )
}
