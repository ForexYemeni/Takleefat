import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { qualificationCatalogUpdateSchema } from '@/lib/validations/user'

/**
 * إدارة كتالوج المؤهلات العلمية — الجولة 32
 * PATCH  /api/admin/qualifications/[id] — تعديل اسم المؤهل أو تفعيل/تعطيله
 *          تعديل الاسم يُحدّث فوراً مؤهلات كل الحسابات الحاملة للاسم القديم
 *          (نفس الجمهور فقط) حتى تبقى البيانات متوافقة مع الكتالوج.
 * DELETE /api/admin/qualifications/[id] — حذف المؤهل نهائياً
 *          ممنوع الحذف وهو قيد الاستخدام (حساب يحمله) — عطّله بدلاً من ذلك.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const parsed = qualificationCatalogUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const existing = await db.qualification.findUnique({ where: { id } })
    if (!existing) return jsonError('المؤهل غير موجود في الكتالوج', 404)

    const { name, isActive } = parsed.data
    const newName = name?.trim()

    if (newName && newName !== existing.name) {
      const dup = await db.qualification.findUnique({ where: { name: newName } })
      if (dup) return jsonError('يوجد مؤهل بنفس الاسم في الكتالوج', 409)
    }

    const [qualification] = await db.$transaction([
      db.qualification.update({
        where: { id },
        data: {
          ...(newName ? { name: newName } : {}),
          ...(isActive != null ? { isActive } : {}),
        },
      }),
      // ترحيل اسم المؤهل إلى كل الحسابات الحاملة للاسم القديم من نفس الجمهور
      ...(newName
        ? [
            db.user.updateMany({
              where: { qualification: existing.name, role: existing.audience },
              data: { qualification: newName },
            }),
          ]
        : []),
    ])

    return NextResponse.json({
      message:
        newName && newName !== existing.name
          ? `تم تحديث اسم المؤهل إلى «${newName}» وترحيله لكل الحسابات الحاملة`
          : 'تم تحديث المؤهل',
      qualification,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const existing = await db.qualification.findUnique({ where: { id } })
    if (!existing) return jsonError('المؤهل غير موجود في الكتالوج', 404)

    // حماية البيانات: مؤهل محمّل على حسابات فعلية لا يُحذف — التعطيل هو البديل الآمن
    const inUse = await db.user.count({
      where: { qualification: existing.name, role: existing.audience },
    })
    if (inUse > 0) {
      return jsonError(
        `لا يمكن حذف هذا المؤهل لاستخدام ${inUse} ${inUse === 1 ? 'حساب' : 'حساباً'} — عطّله بدلاً من حذفه حتى لا تفقد الحسابات قيمة مؤهلها`,
        409
      )
    }

    await db.qualification.delete({ where: { id } })

    return NextResponse.json({ message: `تم حذف المؤهل «${existing.name}» من الكتالوج` })
  } catch (error) {
    return handleApiError(error)
  }
}
