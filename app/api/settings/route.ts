import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { settingsSchema } from '@/lib/validations/post'
import { getSettings, setSetting } from '@/lib/settings'

/**
 * GET /api/settings — إعدادات المنصة (الرسوم وطرق الدفع)
 * متاحة لجميع المستخدمين المسجلين لتظهر الرسوم وطرق الدفع للأطراف المعنية.
 */
export async function GET() {
  try {
    await requireRole('ADMIN', 'NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    const settings = await getSettings()
    return NextResponse.json({ settings })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/settings — تحديث الرسوم وطرق الدفع (الإدارة فقط)
 */
export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const parsed = settingsSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const {
      feeMode,
      applicationFee,
      adminFeeType,
      adminPercentage,
      adminFeeFixed,
      paymentMethod,
      paymentAccountNumber,
      paymentAccountName,
      paymentNotes,
      receiverSharePercent,
    } = parsed.data

    await Promise.all([
      setSetting('feeMode', feeMode),
      setSetting('applicationFee', String(applicationFee)),
      setSetting('adminFeeType', adminFeeType),
      setSetting('adminPercentage', String(adminPercentage)),
      setSetting('adminFeeFixed', String(adminFeeFixed)),
      setSetting('paymentMethod', paymentMethod),
      setSetting('paymentAccountNumber', paymentAccountNumber),
      setSetting('paymentAccountName', paymentAccountName),
      setSetting('paymentNotes', paymentNotes || ''),
      ...(receiverSharePercent != null
        ? [setSetting('receiverSharePercent', String(receiverSharePercent))]
        : []),
    ])

    const settings = await getSettings()
    return NextResponse.json({ message: 'تم حفظ الإعدادات بنجاح', settings })
  } catch (error) {
    return handleApiError(error)
  }
}
