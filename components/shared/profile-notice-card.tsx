'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Camera, Info, ShieldCheck, X } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { isProfilePhotoRequired } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * بطاقة الخصوصية وإكمال الملف — الجولة 61 | تكليفات | Takleefat
 * ==============================================================
 * بطاقة احترافية أعلى نظرة عامة للكادر المعتمد (الجولة 61 — طلب صاحب المنصة):
 *  1. للذكور من الكادر بلا صورة بروفايل: تنبيه بارز غير قابل للإخفاء
 *     بأن الصورة إجبارية مع زر مباشر لإكمالها في الملف الشخصي.
 *  2. بلاغ الشفافية: تم إخفاء المستندات عن المستلمين الإداريين ومشرفي
 *     الأطباء — تُفتح لهم فقط بموافقة صريحة من الإدارة على طلب رسمي
 *     بسبب معلن، وكل مشاهدة تُسجَّل. (قابل للإخفاء ويُحفظ اختياره).
 *  3. للإناث بلا صورة: سطر إيحاء لطيف (الصورة اختيارية لمن ترغب).
 */

interface NoticeProfile {
  role: string
  status: string
  gender: string | null
  profilePhotoBlobId: string | null
}

const DISMISS_KEY = 'takleefat-docs-privacy-notice-v1'

export function ProfileNoticeCard({ profilePath }: { profilePath: string }) {
  const [dismissed, setDismissed] = useState(true) // افتراضياً مخفية حتى يُقرأ التخزين (منع الوميض)

  const { data } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<{ user: NoticeProfile }>('/api/me/profile'),
  })

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      // بلا تخزين محلي — تبقى الظاهرة
      setDismissed(false)
    }
  }, [])

  const user = data?.user
  if (!user || user.status !== 'APPROVED') return null

  const maleMissingPhoto = isProfilePhotoRequired(user.role, user.gender) && !user.profilePhotoBlobId
  const optionalSuggestion =
    !user.profilePhotoBlobId && !isProfilePhotoRequired(user.role, user.gender)

  // تنبيه الصورة الإجباري للذكور — لا يُخفى أبداً حتى تُرفع الصورة
  if (maleMissingPhoto) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-bl from-amber-50 via-amber-50/60 to-transparent p-5 shadow-sm dark:border-amber-800 dark:from-amber-950/40 dark:via-amber-950/20">
        <div className="absolute -left-10 -top-10 size-32 rounded-full bg-amber-400/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Camera className="size-7" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-base font-black text-amber-900 dark:text-amber-200">
              أكمل صورة البروفايل — إجبارية للكادر الذكور
            </p>
            <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
              رفع صورتك المهنية مطلوب لإكمال ملفك — ستظهر للمستلمين الإداريين
              ومشرفي الأطباء وفي بطاقتك المهنية العامة والتقديمات، بدلاً من رؤية
              مستنداتك التي أصبحت محمية بإذن الإدارة.
            </p>
          </div>
          <Button asChild className="gap-2 bg-amber-600 text-white hover:bg-amber-700">
            <Link href={profilePath}>
              <Camera className="size-4" />
              أضف صورتك الآن
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  // بطاقة الشفافية العامة — قابلة للإخفاء مع الحفظ
  if (dismissed) return null
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-bl from-emerald-50 via-emerald-50/50 to-transparent p-5 shadow-sm dark:border-emerald-900 dark:from-emerald-950/30 dark:via-emerald-950/15">
      <div className="absolute -left-10 -top-10 size-32 rounded-full bg-emerald-400/10 blur-2xl" />
      <button
        type="button"
        aria-label="إخفاء هذا التنبيه"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISS_KEY, '1')
          } catch {
            // بلا تخزين محلي — الإخفاء لهذه الجلسة فقط
          }
          setDismissed(true)
        }}
        className="absolute end-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="relative flex items-start gap-3.5 pe-8">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          <ShieldCheck className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-base font-black text-emerald-900 dark:text-emerald-200">
            مستنداتك محمية الآن — خصوصية أعلى وشفافية كاملة
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            تم إخفاء مستنداتك الرسمية (الهوية والمزاولة) عن المستلمين الإداريين
            ومشرفي الأطباء حفاظاً على خصوصيتك — لا تُفتح لهم إلا بموافقة صريحة
            من إدارة المنصة على طلب رسمي بسبب معلن، وكل مشاهدة لمستنداتك
            تُسجَّل ويمكن للإدارة سحب أي إذن في أي وقت.
          </p>
          {optionalSuggestion && (
            <p className="flex items-start gap-1.5 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>
                يُنصح بإضافة صورة بروفايل مهنية من{' '}
                <Link href={profilePath} className="font-extrabold text-primary hover:underline">
                  الملف الشخصي
                </Link>{' '}
                — اختيارية لمن ترغب، وتعزز ثقة الجهات بصورتك بدل الاعتماد على المستندات.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
