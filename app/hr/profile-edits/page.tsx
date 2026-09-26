import Link from 'next/link'
import { ArrowLeft, FilePenLine, ShieldCheck } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { ProfileEditReview, ProfileEditReviewHeader } from '@/components/shared/profile-edit-review'

export const metadata = { title: 'طلبات تعديل الملفات | فرصة — تكليفات' }

/**
 * طلبات تعديل الملفات المهنية — الموارد البشرية (الجولة 74)
 *
 * الجولة 81 — التصرّح الاحترافي: الإدارة تملك هذه المراجعة دائماً بلا إعداد،
 * ولحسابات الموارد البشرية إذن اختياري تفعّله الإدارة لكل حساب على حدة
 * (profileEditReviewAccess) — يُقرأ من القاعدة لحظياً في كل زيارة، فالحساب
 * غير المفعّل يرى شاشة إذن أنيقة بدل الطلبات، والمفعّل يرى شاشة المراجعة كاملة.
 */
export default async function HrProfileEditsPage() {
  const session = await getServerSession(authOptions)
  const hr = session?.user?.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { profileEditReviewAccess: true },
      })
    : null

  if (!hr?.profileEditReviewAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <ShieldCheck className="size-7" />
          </span>
          <h1 className="mt-4 flex items-center justify-center gap-2 text-lg font-black">
            <FilePenLine className="size-5 text-primary" />
            المراجعة مصرّحة للإدارة حالياً
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            طلبات تعديل الملفات المهنية (التخصص / المؤهل / سنوات الخبرة) تُراجع من الإدارة دائماً،
            ولحسابات الموارد البشرية تُفعّل اختياريةً من لوحة الإدارة لكل حساب. لا يملك حسابك هذا
            الإذن حالياً — إن احتجته تواصل مع الإدارة لتفعيله، وستظهر لك الطلبات وإشعاراتها فوراً.
          </p>
          <Button asChild className="mt-5 rounded-xl">
            <Link href="/hr">
              العودة للوحة الموارد البشرية
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ProfileEditReviewHeader subtitle="طلبات الكادر والأطباء لتعديل تخصصهم أو مؤهلهم العلمي أو سنوات خبرتهم — راجعها واعتمدها ليُطبَّق التعديل فوراً" />
      <ProfileEditReview />
    </div>
  )
}
