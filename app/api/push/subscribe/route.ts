import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@/lib/validations/push'
import { MAX_SUBSCRIPTIONS_PER_USER } from '@/lib/push'

/**
 * POST /api/push/subscribe — تسجيل جهاز للإشعارات الفورية (idempotent: upsert بـ userId+endpoint)
 * DELETE /api/push/subscribe — إلغاء اشتراك جهاز من الحساب الحالي
 *
 * الجولة الرابعة عشرة: الاشتراك مقيد بجلسة صالحة، وحد أقصى MAX_SUBSCRIPTIONS_PER_USER لكل مستخدم
 * الجولة العشرون — إصلاح الجذر الثاني لعدم وصول الإشعارات الحقيقية:
 * كان الـ endpoint فريداً عالمياً مع نقل ملكيته لآخر حساب يحمّل لوحته على الجهاز،
 * فكانت إشعارات بقية الحسابات (المستلم/الكادر/المدير) تُرسل إلى لا شيء.
 * الآن: نفس الجهاز يُسجَّل لكل حساب استخدمه على حدة (صفوف مستقلة بنفس الـ endpoint)
 * فيصل كل إشعار لصاحبه مهما كان الحساب النشط حالياً على الجهاز.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const parsed = pushSubscribeSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'بيانات الاشتراك غير صحيحة', 422)
    }
    const { endpoint, keys, userAgent } = parsed.data

    const subscription = await db.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId: session.user.id, endpoint },
      },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        // الجهاز نفسه لحساب هذا المستخدم — تُحدَّث المفاتيح فقط
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    })

    // تنظيف الأقدم عند تجاوز الحد (يُبقى الأحدث، والاشتراك الحالي محفوظ دائماً)
    const count = await db.pushSubscription.count({ where: { userId: session.user.id } })
    if (count > MAX_SUBSCRIPTIONS_PER_USER) {
      const oldest = await db.pushSubscription.findMany({
        where: { userId: session.user.id, NOT: { endpoint } },
        orderBy: { createdAt: 'asc' },
        take: count - MAX_SUBSCRIPTIONS_PER_USER,
        select: { id: true },
      })
      await Promise.all(
        oldest.map((s) => db.pushSubscription.delete({ where: { id: s.id } }).catch(() => null))
      )
    }

    return NextResponse.json(
      { message: 'تم تفعيل الإشعارات الفورية لهذا الجهاز', subscription },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession()
    const parsed = pushUnsubscribeSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return jsonError('نقطة نهاية الاشتراك مطلوبة', 422)
    }
    // حذف اشتراك المستخدم الحالي حصراً — لا يُلغي أحد اشتراك غيره
    const removed = await db.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: session.user.id },
    })
    if (removed.count === 0) {
      return jsonError('لا يوجد اشتراك مطابق لهذا الجهاز في حسابك', 404)
    }
    return NextResponse.json({ message: 'تم إيقاف الإشعارات الفورية لهذا الجهاز' })
  } catch (error) {
    return handleApiError(error)
  }
}
