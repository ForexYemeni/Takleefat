import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { saveImageToDb, validateImageFile } from '@/lib/storage'
import { isProfilePhotoRequired } from '@/lib/utils'

/**
 * صورة البروفايل (الأيقونة) — الجولة 61 | تكليفات | Takleefat
 * ============================================================
 * POST   /api/me/profile-photo — رفع/استبدال صورة البروفايل للكادر (NURSE/DOCTOR)
 * DELETE /api/me/profile-photo — إزالة الصورة
 *
 * القاعدة المعتمدة من صاحب المنصة:
 *  - الصورة إجبارية للكادر الذكور (gender MALE) — فلا يُسمح بإزالتها
 *    (يُسمح بالاستبدال فقط)، واختيارية للإناث لمن ترغب.
 *  - تظهر الصورة للمستلمين الإداريين ومشرفي الأطباء والإدارة وفي
 *    البطاقة المهنية العامة والتقديمات — تُقدَّم من مسار الملفات عامة.
 *  - الضغط يتم من جهة العميل قبل الرفع (نفس نظام مستندات الكادر).
 *  - الاستبدال يُنشئ BLOB جديداً ورابطاً جديداً — القديم يبقى بلا مرجع (غير مرئي).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      return jsonError('اختر صورة البروفايل أولاً', 422)
    }

    const validationError = validateImageFile(file)
    if (validationError) return jsonError(validationError, 422)

    const stored = await saveImageToDb(file)

    await db.user.update({
      where: { id: session.user.id },
      data: { profilePhotoBlobId: stored.id },
    })

    return NextResponse.json({
      message: 'تم تحديث صورة البروفايل بنجاح — ستظهر الآن في بطاقتك المهنية والتقديمات',
      url: stored.url,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { gender: true, role: true, profilePhotoBlobId: true },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)
    if (!user.profilePhotoBlobId) return jsonError('لا توجد صورة بروفايل لإزالتها', 422)

    // الإجبارية للذكور: إزالة ممنوعة — الاستبدال فقط (قرار صاحب المنصة)
    if (isProfilePhotoRequired(user.role, user.gender)) {
      return jsonError(
        'صورة البروفايل إجبارية للكادر الذكور — يمكنك استبدالها بصورة أخرى بدلاً من إزالتها',
        403
      )
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { profilePhotoBlobId: null },
    })

    return NextResponse.json({ message: 'تمت إزالة صورة البروفايل' })
  } catch (error) {
    return handleApiError(error)
  }
}
