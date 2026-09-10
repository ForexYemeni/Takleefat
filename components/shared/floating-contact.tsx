'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Headset, Mail, MessageCircle, MessageSquare, Phone, X } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * أيقونة التواصل العائمة — أسفل يسار الشاشة في كل صفحات التطبيق
 * زر دائري احترافي: عند الضغط عليه تظهر قنوات التواصل المُفعّلة من الإدارة
 * (واتساب / اتصال مباشر / رسالة نصية / بريد إلكتروني) — والقنوات التي بلا
 * بيانات أو متوقفة لا تظهر، وإذا لم تُضبط أي قناة تختفي الأيقونة إطلاقاً.
 * تُخفى داخل حساب الإدارة (الإدارة هي جهة التواصل نفسها).
 */

interface ActiveChannels {
  whatsapp?: string
  phone?: string
  sms?: string
  email?: string
}

/** رمز الدولة الافتراضي — نفس منهجية whatsappLink في lib/utils.ts */
const WHATSAPP_COUNTRY_CODE = process.env.NEXT_PUBLIC_WHATSAPP_COUNTRY_CODE ?? '967'

/** رابط واتساب ذكي: يقبل المحلي (777000000) أو بالصفر (0777...) أو الدولي (967777000000) */
function waMeLink(phone: string, message: string): string {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = WHATSAPP_COUNTRY_CODE + digits.slice(1)
  else if (digits.length <= 9) digits = WHATSAPP_COUNTRY_CODE + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/** إزاحة يسار الشاشة داخل لوحات التحكم — الشريط الجانبي (16rem) على يسار الشاشات الكبيرة */
function positionClass(pathname: string): string {
  if (pathname.startsWith('/nurse') || pathname.startsWith('/receiver')) {
    return 'bottom-5 left-5 lg:left-[calc(16rem+1.25rem)]'
  }
  return 'bottom-5 left-5'
}

const CONTACT_MESSAGE = 'مرحباً، أحتاج مساعدة بخصوص منصة تكليفات | Takleefat'

export function FloatingContact() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // مخفية داخل حساب الإدارة — الإدارة تدير القنوات ولا ترسل تواصلاً لنفسها
  const isAdmin = pathname.startsWith('/admin')

  const { data } = useQuery({
    queryKey: ['contact-channels'],
    queryFn: () => apiFetcher<{ channels: ActiveChannels }>('/api/contact'),
    enabled: !isAdmin,
    staleTime: 60 * 1000,
  })

  const channels = data?.channels
  const items: Array<{
    key: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    color: string
    href: string
  }> = []

  if (channels?.whatsapp) {
    items.push({
      key: 'whatsapp',
      label: 'واتساب الإدارة',
      icon: MessageCircle,
      color: 'bg-[#25D366] hover:bg-[#1fb857]',
      href: waMeLink(channels.whatsapp, CONTACT_MESSAGE),
    })
  }
  if (channels?.phone) {
    items.push({
      key: 'phone',
      label: 'اتصال مباشر',
      icon: Phone,
      color: 'bg-sky-600 hover:bg-sky-700',
      href: `tel:${channels.phone.replace(/[^\d+]/g, '')}`,
    })
  }
  if (channels?.sms) {
    items.push({
      key: 'sms',
      label: 'رسالة نصية',
      icon: MessageSquare,
      color: 'bg-violet-600 hover:bg-violet-700',
      href: `sms:${channels.sms.replace(/[^\d+]/g, '')}`,
    })
  }
  if (channels?.email) {
    items.push({
      key: 'email',
      label: 'بريد إلكتروني',
      icon: Mail,
      color: 'bg-amber-600 hover:bg-amber-700',
      href: `mailto:${channels.email.trim()}`,
    })
  }

  // إغلاق القائمة عند الضغط خارجها
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (isAdmin || !channels || items.length === 0) return null

  return (
    <div ref={containerRef} className={cn('fixed z-50 flex flex-col items-start gap-2.5', positionClass(pathname))}>
      {/* قنوات التواصل — تظهر عند الفتح */}
      {open && (
        <div className="flex flex-col items-start gap-2.5 pb-1">
          {items.map((item, i) => (
            <Link
              key={item.key}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{ animationDelay: `${i * 55}ms` }}
              className={cn(
                'flex animate-[contact-pop_.18s_ease-out_both] items-center gap-2 rounded-full py-2.5 ps-3 pe-4 text-sm font-extrabold text-white shadow-xl transition-colors',
                item.color
              )}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-white/20">
                <item.icon className="size-4" />
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* الزر الدائري الرئيسي */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'إغلاق قائمة التواصل' : 'التواصل مع إدارة المنصة'}
        aria-expanded={open}
        className={cn(
          'relative flex size-14 items-center justify-center rounded-full text-white shadow-xl transition-all hover:scale-105 active:scale-95',
          open ? 'bg-slate-700' : 'bg-primary'
        )}
      >
        {!open && (
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/40" />
        )}
        {open ? <X className="size-6" /> : <Headset className="size-6" />}
        {!open && (
          <span className="absolute -top-0.5 -end-0.5 size-3.5 rounded-full border-2 border-background bg-emerald-500" />
        )}
      </button>
    </div>
  )
}
