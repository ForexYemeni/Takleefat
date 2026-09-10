import { NextResponse } from 'next/server'
import { requireSession, handleApiError } from '@/lib/api-helpers'
import { deliverTestToUser } from '@/lib/push'

/**
 * POST /api/push/test — إشعار تجريبي حقيقي إلى كل أجهزة المستخدم الحالي
 *
 * الجولة السابعة عشرة — أداة تحقق فوري:
 * الإشعارات المنبثقة خارج التطبيق تتطلب اشتراكاً فعّالاً لكل جهاز، وهذا
 * المسار يتيح لأي مستخدم التأكد بعينه أن التفعيل يعمل: يُرسل إشعاراً حقيقياً
 * عبر VAPID/FCM إلى كل أجهزة حسابه ويعيد عدد الأجهزة التي وصلها فعلياً.
 * - delivered = 0 يعني لا يوجد اشتراك فعّال (الجهاز الحالي غير مفعّل)
 */
export async function POST() {
  try {
    const session = await requireSession()
    const result = await deliverTestToUser(session.user.id, {
      title: 'إشعار تجريبي | تكليفات',
      body: 'إذا ظهر لك هذا التنبيه خارج التطبيق فالإشعارات الفورية تعمل على هذا الجهاز',
      link: '/',
      tag: `test-${Date.now()}`,
    })
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
