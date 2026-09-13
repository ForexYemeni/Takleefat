'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BellOff,
  BellRing,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  MailPlus,
  Pencil,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch, apiPost, apiDelete } from '@/lib/api-client'
import {
  EMAIL_CATEGORY_LABELS,
  TOGGLEABLE_CATEGORIES,
  SECURITY_CATEGORY,
  type EmailPreferences,
} from '@/lib/email/config'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * بطاقة البريد الإلكتروني — الجولة 51
 * =====================================================
 * بطاقة موحدة تُركَّب في الملف الشخصي لجميع الأدوار الخمسة:
 * الإدارة / المستلم الإداري / مشرف الأطباء والكادر / الطبيب / الممرض.
 *
 * الحالات: بلا بريد → إضافة + رمز 6 أرقام → غير مؤكد → مؤكد (إعدادات الإشعارات).
 * البريد يظهر مقنّعاً دائماً (mo***@gmail.com)، وأقسام الأمان مقفلة لا تُعطَّل.
 */

interface EmailStatus {
  email: string | null
  maskedEmail: string | null
  emailVerified: boolean
  enabled: boolean
  preferences: EmailPreferences
  verificationExpiresAt: string | null
}

const RESEND_COOLDOWN = 60

export function EmailAccountCard() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'idle' | 'input' | 'verifying'>('idle')
  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-email'],
    queryFn: () => apiFetcher<EmailStatus>('/api/me/email'),
  })

  // عداد تبريد إعادة الإرسال
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['my-email'] })

  /** إضافة/تعديل البريد — يرسل الرمز ولا يعرضه أبداً */
  const setEmailMutation = useMutation({
    mutationFn: () => apiPost<{ message: string; maskedEmail: string }>('/api/me/email', { email: emailInput.trim() }),
    onSuccess: (res) => {
      toast.success(res.message)
      setCodeInput('')
      setCooldown(RESEND_COOLDOWN)
      setMode('verifying')
      invalidate()
      setTimeout(() => codeRef.current?.focus(), 150)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  /** تأكيد الرمز */
  const verifyMutation = useMutation({
    mutationFn: () => apiPost<{ message: string }>('/api/me/email/verify', { code: codeInput.trim() }),
    onSuccess: (res) => {
      toast.success('✓ ' + res.message)
      setMode('idle')
      setCodeInput('')
      invalidate()
    },
    onError: (e) => {
      toast.error((e as Error).message)
      setCodeInput('')
      codeRef.current?.focus()
    },
  })

  /** إعادة إرسال الرمز */
  const resendMutation = useMutation({
    mutationFn: () => apiPost<{ message: string }>('/api/me/email/resend', {}),
    onSuccess: (res) => {
      toast.success('📩 ' + res.message)
      setCooldown(RESEND_COOLDOWN)
      setCodeInput('')
      codeRef.current?.focus()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  /** إزالة البريد */
  const removeMutation = useMutation({
    mutationFn: () => apiDelete<{ message: string }>('/api/me/email'),
    onSuccess: (res) => {
      toast.success(res.message)
      setMode('idle')
      setEmailInput('')
      invalidate()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  /** تحديث إعدادات الإشعارات */
  const settingsMutation = useMutation({
    mutationFn: (payload: { enabled?: boolean; preferences?: Partial<EmailPreferences> }) =>
      apiPatch<{ message: string; enabled: boolean; preferences: EmailPreferences }>('/api/me/email-settings', payload),
    onSuccess: () => {
      toast.success('تم تحديث إعدادات إشعارات البريد')
      invalidate()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const s = data
  const verified = !!s?.emailVerified
  const pendingVerification = !!s?.email && !s.emailVerified
  const effectiveMode = mode === 'idle' && pendingVerification ? 'verifying' : mode

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2">
            <span className="rounded-xl bg-primary/10 p-1.5">
              <Mail className="size-4 text-primary" />
            </span>
            البريد الإلكتروني
          </span>
          {s?.email && (
            <Badge
              className={cn(
                verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              )}
              variant="secondary"
            >
              {verified ? '✓ مؤكد' : '⚠️ غير مؤكد'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          قناة إشعارات رسمية إضافية — التكليفات والتحديثات والتنبيهات تصلك فور حدوثها. الدخول يبقى برقم الهاتف وكلمة المرور.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل حالة البريد...
          </p>
        ) : !s?.email ? (
          <>
            {/* ---------- الحالة 1: لا بريد ---------- */}
            <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              لم تتم إضافة بريد إلكتروني
            </p>
            {effectiveMode !== 'input' ? (
              <Button className="gap-1.5" onClick={() => setMode('input')}>
                <MailPlus className="size-4" />
                إضافة البريد الإلكتروني
              </Button>
            ) : (
              <EmailInputForm
                value={emailInput}
                onChange={setEmailInput}
                pending={setEmailMutation.isPending}
                onSubmit={() => setEmailMutation.mutate()}
                onCancel={() => setMode('idle')}
              />
            )}
          </>
        ) : verified ? (
          <>
            {/* ---------- الحالة 3: مؤكد ---------- */}
            {effectiveMode === 'input' ? (
              <EmailInputForm
                value={emailInput}
                onChange={setEmailInput}
                pending={setEmailMutation.isPending}
                onSubmit={() => setEmailMutation.mutate()}
                onCancel={() => setMode('idle')}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="size-4 shrink-0" />
                  ✓ البريد الإلكتروني مؤكد
                  <span dir="ltr" className="rounded-lg bg-white/70 px-2 py-0.5 font-mono text-xs text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                    {s.maskedEmail}
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setEmailInput('')
                    setMode('input')
                  }}
                >
                  <Pencil className="size-3.5" />
                  تعديل البريد الإلكتروني
                </Button>
              </div>
            )}

            {/* ---------- إعدادات إشعارات البريد ---------- */}
            <div className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-extrabold">
                    <BellRing className="size-4 text-primary" />
                    إعدادات إشعارات البريد الإلكتروني
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    اختر ما يصلك على بريدك — أقسام الأمان تبقى مفعّلة دائماً بحكم سياسة النظام
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(v) => settingsMutation.mutate({ enabled: v })}
                    disabled={settingsMutation.isPending}
                    aria-label="تفعيل جميع إشعارات البريد"
                  />
                  {s.enabled ? (
                    <span className="flex items-center gap-1 text-primary">
                      <BellRing className="size-3.5" />
                      الإشعارات مفعّلة
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <BellOff className="size-3.5" />
                      الإشعارات موقفة
                    </span>
                  )}
                </label>
              </div>

              <div className={cn('mt-3 grid gap-2 sm:grid-cols-2', !s.enabled && 'opacity-60')}>
                {TOGGLEABLE_CATEGORIES.map((cat) => (
                  <label
                    key={cat}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2.5 text-sm font-bold"
                  >
                    {EMAIL_CATEGORY_LABELS[cat]}
                    <Switch
                      checked={s.preferences[cat]}
                      onCheckedChange={(v) =>
                        settingsMutation.mutate({ preferences: { [cat]: v } as Partial<EmailPreferences> })
                      }
                      disabled={settingsMutation.isPending || !s.enabled}
                    />
                  </label>
                ))}
                {/* قسم الأمان — مقفل دائماً */}
                <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="size-4" />
                    {EMAIL_CATEGORY_LABELS[SECURITY_CATEGORY]}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <Lock className="size-3" />
                    مفعّل دائماً
                  </span>
                </div>
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Lock className="mt-0.5 size-3 shrink-0" />
                رموز التحقق وتنبيهات أمان الحساب تُرسل دائماً ولا يمكن تعطيلها — حماية لحسابك.
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              {removeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              إزالة البريد الإلكتروني
            </Button>
          </>
        ) : (
          <>
            {/* ---------- الحالة 2: أُضيف لكنه غير مؤكد — إدخال الرمز ---------- */}
            <div className="flex items-start gap-2 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/40">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
                  ⚠️ البريد الإلكتروني غير مؤكد
                </p>
                <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/80">
                  أدخل رمز التحقق المرسل إلى <span dir="ltr" className="font-mono font-bold">{s.maskedEmail}</span> — الرمز صالح 15 دقيقة
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="email-verification-code">رمز التحقق (6 أرقام)</Label>
                <Input
                  id="email-verification-code"
                  ref={codeRef}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && codeInput.length === 6 && !verifyMutation.isPending) {
                      verifyMutation.mutate()
                    }
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  dir="ltr"
                  className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]"
                />
              </div>
              <Button
                className="h-12 w-full gap-2 text-base"
                disabled={codeInput.length !== 6 || verifyMutation.isPending}
                onClick={() => verifyMutation.mutate()}
              >
                {verifyMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                تأكيد البريد
              </Button>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  disabled={cooldown > 0 || resendMutation.isPending}
                  onClick={() => resendMutation.mutate()}
                >
                  {resendMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  {cooldown > 0 ? `إعادة إرسال الرمز (${cooldown} ثانية)` : 'إعادة إرسال الرمز'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setMode('input')
                    setEmailInput('')
                  }}
                >
                  <Pencil className="size-3.5" />
                  تغيير البريد
                </Button>
              </div>
            </div>
          </>
        )}

        {/* نموذج إدخال البريد عند التعديل من الحالة المؤكدة */}
        {verified && effectiveMode === 'input' && null}
      </CardContent>
    </Card>
  )
}

/** نموذج إدخال البريد + إرسال رمز التحقق */
function EmailInputForm({
  value,
  onChange,
  pending,
  onSubmit,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  pending: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const valid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.trim())
  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div className="space-y-2">
        <Label htmlFor="account-email">البريد الإلكتروني</Label>
        <Input
          id="account-email"
          type="email"
          dir="ltr"
          inputMode="email"
          autoComplete="email"
          placeholder="name@gmail.com"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid && !pending) onSubmit()
          }}
          style={{ textAlign: 'start' }}
        />
        <p className="text-xs text-muted-foreground">
          سيصلك رمز تحقق من 6 أرقام إلى هذا البريد لتأكيده — لا يظهر رمز التحقق داخل التطبيق
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="gap-1.5" disabled={!valid || pending} onClick={onSubmit}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
          إرسال رمز التحقق
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </div>
  )
}
