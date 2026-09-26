import { HrDashboard } from '@/components/forsah/hr-dashboard'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata = { title: 'لوحة الموارد البشرية | فرصة — تكليفات' }

/**
 * الجولة 81 — إذن مراجعة طلبات تعديل الملفات المهنية يُقرأ من القاعدة لحظياً
 * ويُمرَّر للوحة الرئيسية: الحساب المفعّل له الإذن يرى بطاقة الطلبات بعدّادها
 * الحي، وغير المفعّل لا يظهر له شيء إطلاقاً.
 */
export default async function HrHomePage() {
  const session = await getServerSession(authOptions)
  const hr = session?.user?.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { profileEditReviewAccess: true },
      })
    : null

  return <HrDashboard profileEditAccess={hr?.profileEditReviewAccess ?? false} />
}
