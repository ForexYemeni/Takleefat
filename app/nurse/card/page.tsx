'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Copy, IdCard, Lock, Loader2, Share2, SquareArrowOutUpRight } from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { apiFetcher } from '@/lib/api-client'
import { ProfessionalCard, type ProfessionalCardProps } from '@/components/nurse/professional-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * بطاقتي المهنية — /nurse/card (الجولة الرابعة عشرة)
 * معاينة البطاقة العامة للكادر + أدوات المشاركة (نسخ الرابط / واتساب / مشاركة النظام)
 * البطاقة تُنشر علنياً فقط بعد اعتماد الحساب من الإدارة — وقبلها تظهر بحالة القفل.
 */

interface MyProfile {
  id: string
  name: string
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  gender: string | null
  createdAt: string
}

interface ProfessionalStats {
  stats: {
    completedAssignments: number
    ratingAverage: number | null
    ratingCount: number
  }
}

export default function NurseCardPage() {
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<{ user: MyProfile }>('/api/me/profile'),
  })
  const { data: statsData } = useQuery({
    queryKey: ['professional-profile'],
    queryFn: () => apiFetcher<ProfessionalStats>('/api/me/professional-profile'),
  })

  const profile = profileData?.user
  const approved = profile?.status === 'APPROVED'

  // الرابط العام + توليد QR محلياً في المتصفح (الحالة تُحدَّث داخل الوعد — لا مزامنة في جسم التأثير)
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    const url = `${window.location.origin}/n/${profile.id}`
    QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      width: 96,
      errorCorrectionLevel: 'M',
      color: { dark: '#0E1B4E', light: '#FFFFFF' },
    })
      .then((svg) => {
        if (cancelled) return
        setPublicUrl(url)
        setQrSvg(svg)
      })
      .catch(() => {
        if (!cancelled) setQrSvg(null)
      })
    return () => {
      cancelled = true
    }
  }, [profile?.id])

  const shareText = `${profile?.name ?? ''} — بطاقتي المهنية الموثقة على منصة تكليفات | Takleefat`

  const copyLink = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success('تم نسخ رابط البطاقة — شاركه مع الجهات الصحية')
    } catch {
      toast.error('تعذر النسخ — انسخ الرابط الظاهر أسفل البطاقة يدوياً')
    }
  }

  const shareWhatsApp = () => {
    if (!publicUrl) return
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${publicUrl}`)}`, '_blank', 'noopener')
  }

  const shareNative = async () => {
    if (!publicUrl) return
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'بطاقتي المهنية — تكليفات', text: shareText, url: publicUrl })
      } catch {
        // المستخدم ألغى المشاركة — لا رسالة خطأ
      }
    } else {
      await copyLink()
    }
  }

  const cardProps: ProfessionalCardProps | null =
    profile && statsData
      ? {
          name: profile.name,
          specialty: profile.specialty,
          qualification: profile.qualification,
          yearsOfExperience: profile.yearsOfExperience,
          gender: profile.gender,
          ratingAverage: statsData.stats.ratingAverage,
          ratingCount: statsData.stats.ratingCount,
          completedAssignments: statsData.stats.completedAssignments,
          memberSince: new Date(profile.createdAt).toLocaleDateString('ar', {
            year: 'numeric',
            month: 'long',
          }),
          qrSvg,
          publicUrl: approved ? publicUrl : null,
        }
      : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <IdCard className="size-6 text-primary" />
            بطاقتي المهنية
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بطاقة رقمية موثقة تشمل تخصصك وتقييماتك — شاركها مع الجهات الصحية بضغطة واحدة
          </p>
        </div>
        {approved && publicUrl && (
          <Link href={publicUrl} target="_blank" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-2">
              <SquareArrowOutUpRight className="size-4" />
              فتح الصفحة العامة
            </Button>
          </Link>
        )}
      </div>

      {approved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">مشاركة البطاقة</CardTitle>
            <CardDescription>
              أرسل رابط بطاقتك أو رمز QR للجهات الصحية — تعرض بطاقتك تقييماتك الحقيقية وتكليفاتك المكتملة فقط، دون رقم هاتفك
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={shareWhatsApp} className="gap-2">
              <Share2 className="size-4" />
              مشاركة عبر واتساب
            </Button>
            <Button variant="outline" onClick={copyLink} className="gap-2">
              <Copy className="size-4" />
              نسخ الرابط
            </Button>
            <Button variant="outline" onClick={shareNative} className="gap-2">
              <Share2 className="size-4" />
              مشاركة النظام
            </Button>
          </CardContent>
        </Card>
      )}

      {!approved && profile && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 pt-6">
            <Lock className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              بطاقتك المهنية تُنشر علنياً على الرابط <span dir="ltr" className="font-mono">/n/{profile.id}</span> بعد
              <span className="font-bold"> اعتماد حسابك ومراجعة مستنداتك من إدارة المنصة</span> — حتى ذلك الحين تبقى
              معاينة خاصة بك فقط. سيتم إشعارك فور الاعتماد.
            </p>
          </CardContent>
        </Card>
      )}

      {profileLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          جارٍ تحضير البطاقة...
        </div>
      ) : cardProps ? (
        <ProfessionalCard {...cardProps} />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">تعذر تحميل بيانات البطاقة</p>
      )}
    </div>
  )
}
