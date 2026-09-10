'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Headset,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * قسم التواصل — إدارة المنصة
 * أرقام وبيانات التواصل التي تظهر للمستخدمين في الأيقونة العائمة أسفل يسار الشاشة:
 * واتساب + اتصال مباشر + رسائل نصية + بريد إلكتروني — لكل قناة تشغيل/إيقاف،
 * والقناة التي بلا بيانات أو متوقفة لا تظهر للمستخدمين إطلاقاً.
 */

interface ContactSettings {
  whatsapp: string
  whatsappEnabled: boolean
  phone: string
  phoneEnabled: boolean
  sms: string
  smsEnabled: boolean
  email: string
  emailEnabled: boolean
}

interface ChannelConfig {
  key: 'whatsapp' | 'phone' | 'sms' | 'email'
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  placeholder: string
  hint: string
  inputDir?: 'ltr'
}

const CHANNELS: ChannelConfig[] = [
  {
    key: 'whatsapp',
    label: 'واتساب',
    description: 'محادثة فورية مع إدارة المنصة — الأكثر استخداماً',
    icon: MessageCircle,
    color: 'bg-[#25D366]',
    placeholder: 'مثال: 777000000',
    hint: 'أدخل الرقم المحلي (777000000) أو الدولي (967777000000) — تُفتح محادثة واتساب مباشرة مع الإدارة',
    inputDir: 'ltr',
  },
  {
    key: 'phone',
    label: 'اتصال مباشر',
    description: 'اتصال هاتفي مباشر برقم الإدارة',
    icon: Phone,
    color: 'bg-sky-600',
    placeholder: 'مثال: 777000000',
    hint: 'عند الضغط عليه يبدأ المستخدم اتصالاً مباشراً بهذا الرقم من هاتفه',
    inputDir: 'ltr',
  },
  {
    key: 'sms',
    label: 'رسائل نصية',
    description: 'إرسال رسالة نصية (SMS) للإدارة',
    icon: MessageSquare,
    color: 'bg-violet-600',
    placeholder: 'مثال: 777000000',
    hint: 'يفتح تطبيق الرسائل لدى المستخدم برسالة جديدة موجهة إلى رقم الإدارة',
    inputDir: 'ltr',
  },
  {
    key: 'email',
    label: 'بريد إلكتروني',
    description: 'مراسلة الإدارة عبر البريد الإلكتروني',
    icon: Mail,
    color: 'bg-amber-600',
    placeholder: 'مثال: info@taklefat.com',
    hint: 'يفتح تطبيق البريد لدى المستخدم برسالة جديدة موجهة إلى هذا العنوان',
  },
]

const EMPTY_CONTACT: ContactSettings = {
  whatsapp: '',
  whatsappEnabled: false,
  phone: '',
  phoneEnabled: false,
  sms: '',
  smsEnabled: false,
  email: '',
  emailEnabled: false,
}

export default function AdminContactPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-contact'],
    queryFn: () => apiFetcher<{ contact: ContactSettings }>('/api/admin/contact'),
  })

  // مسودة التعديل — تُدمج فوق بيانات الخادم (بلا useEffect: بيانات الخادم هي المصدر حتى أول تعديل)
  const [draft, setDraft] = useState<Partial<ContactSettings> | null>(null)
  const form: ContactSettings = { ...EMPTY_CONTACT, ...(data?.contact ?? {}), ...(draft ?? {}) }

  const setField = (key: keyof ContactSettings, value: string | boolean) =>
    setDraft((d) => ({ ...(d ?? {}), [key]: value }))

  const isEnabled = (key: ChannelConfig['key']): boolean =>
    key === 'whatsapp'
      ? form.whatsappEnabled
      : key === 'phone'
        ? form.phoneEnabled
        : key === 'sms'
          ? form.smsEnabled
          : form.emailEnabled

  const saveMutation = useMutation({
    mutationFn: (values: ContactSettings) =>
      apiPatch<{ message: string }>('/api/admin/contact', values),
    onSuccess: (res) => {
      toast.success(res.message)
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['admin-contact'] })
      queryClient.invalidateQueries({ queryKey: ['contact-channels'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <DashboardSkeleton />

  /** القنوات التي ستظهر فعلياً للمستخدمين — مُفعّلة ولها بيانات */
  const activeChannels = CHANNELS.filter((c) => isEnabled(c.key) && form[c.key]?.trim())

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Headset className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">التواصل</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            بيانات التواصل مع إدارة المنصة — تظهر في أيقونة تواصل عائمة أسفل يسار الشاشة لدى
            المستخدمين (واتساب، اتصال، رسائل، بريد). فعِّل القنوات التي تريد استقبال التواصل عبرها
            فقط — والقناة التي بلا بيانات أو متوقفة لا تظهر للمستخدمين إطلاقاً
          </p>
        </div>
      </div>

      {/* معاينة حية — كما ستظهر للأيقونة العائمة */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-emerald-600" />
            معاينة حية — القنوات التي سيراها المستخدمون الآن
          </CardTitle>
          <CardDescription>
            {activeChannels.length === 0
              ? 'لا توجد قنوات نشطة — الأيقونة العائمة مخفية عن المستخدمين تماماً'
              : `${activeChannels.length} ${activeChannels.length === 1 ? 'قناة نشطة' : 'قنوات نشطة'} — تظهر عند الضغط على أيقونة التواصل العائمة`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            {/* زر دائري تجريبي مثل المعروض في التطبيق */}
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Headset className="size-5" />
            </span>
            {activeChannels.map((c) => (
              <span
                key={c.key}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-md',
                  c.color
                )}
              >
                <c.icon className="size-4" />
                {c.label}
              </span>
            ))}
            {activeChannels.length === 0 && (
              <Badge variant="secondary">الأيقونة مخفية — لا توجد قنوات مُفعّلة ببيانات</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* بطاقات القنوات */}
      <div className="grid gap-4 lg:grid-cols-2">
        {CHANNELS.map((c) => {
          const enabled = isEnabled(c.key)
          const value = form[c.key] ?? ''
          return (
            <Card key={c.key} className={cn(enabled && value.trim() && 'border-primary/40')}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-full text-white shadow-sm',
                        c.color
                      )}
                    >
                      <c.icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-extrabold">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => setField(`${c.key}Enabled`, v)}
                      aria-label={`تشغيل قناة ${c.label}`}
                    />
                    <span
                      className={cn(
                        'text-[10px] font-bold',
                        enabled ? 'text-emerald-600' : 'text-muted-foreground'
                      )}
                    >
                      {enabled ? 'مُفعّلة' : 'متوقفة'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`contact-${c.key}`} className="sr-only">
                    {c.label}
                  </Label>
                  <Input
                    id={`contact-${c.key}`}
                    dir={c.inputDir}
                    className={c.inputDir === 'ltr' ? 'text-start' : undefined}
                    placeholder={c.placeholder}
                    value={value}
                    onChange={(e) => setField(c.key, e.target.value)}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{c.hint}</p>
                  {enabled && !value.trim() && (
                    <p className="text-[11px] font-bold text-amber-600">
                      القناة مُفعّلة لكن بلا بيانات — لن تظهر للمستخدمين حتى تُدخل {c.key === 'email' ? 'البريد' : 'الرقم'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button
          className="gap-2"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(form)}
        >
          <Save className="size-4" />
          {saveMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ إعدادات التواصل'}
        </Button>
      </div>
    </div>
  )
}
