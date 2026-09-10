import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import {
  getContactSettings,
  setContactChannel,
  CONTACT_CHANNEL_KEYS,
  type ContactChannelKey,
  type ContactSettings,
} from '@/lib/contact'

// نموذج التحديث — كل حقل اختياري (تحديث جزئي لكل قناة على حدة)
const contactUpdateSchema = z.object({
  whatsapp: z.string().trim().max(40, 'الرقم طويل جداً').optional(),
  whatsappEnabled: z.boolean().optional(),
  phone: z.string().trim().max(40, 'الرقم طويل جداً').optional(),
  phoneEnabled: z.boolean().optional(),
  sms: z.string().trim().max(40, 'الرقم طويل جداً').optional(),
  smsEnabled: z.boolean().optional(),
  email: z
    .string()
    .trim()
    .max(160, 'البريد طويل جداً')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'صيغة البريد الإلكتروني غير صحيحة')
    .optional(),
  emailEnabled: z.boolean().optional(),
})

/**
 * GET /api/admin/contact — إعدادات التواصل كاملة (الإدارة فقط)
 * تشمل القنوات المتوقفة والفارغة لتعبئة نموذج الإدارة.
 */
export async function GET() {
  try {
    await requireRole('ADMIN')
    const settings = await getContactSettings()
    return NextResponse.json({ contact: settings })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/admin/contact — حفظ قنوات التواصل (الإدارة فقط)
 * قناة بلا بيانات أو متوقفة لا تظهر في الأيقونة العائمة للمستخدمين.
 */
export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const parsed = contactUpdateSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const data = parsed.data

    // لكل قناة: القيمة وحالة التشغيل تُحفظ معاً — المفاتيح الغائبة تبقى كما هي
    const current = await getContactSettings()
    const currentEnabled: Record<ContactChannelKey, boolean> = {
      whatsapp: current.whatsappEnabled,
      phone: current.phoneEnabled,
      sms: current.smsEnabled,
      email: current.emailEnabled,
    }
    for (const key of CONTACT_CHANNEL_KEYS) {
      const value = data[key]
      const enabled = data[`${key}Enabled` as keyof typeof data] as boolean | undefined
      if (value !== undefined || enabled !== undefined) {
        await setContactChannel(
          key,
          value !== undefined ? value : current[key],
          enabled !== undefined ? enabled : currentEnabled[key]
        )
      }
    }

    const contact = await getContactSettings()
    return NextResponse.json({ message: 'تم حفظ إعدادات التواصل بنجاح', contact })
  } catch (error) {
    return handleApiError(error)
  }
}
