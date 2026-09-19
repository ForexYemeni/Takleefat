import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'

/**
 * الجولة 63 — سجل التواصل الإداري عبر واتساب (إضافي بحت):
 *
 * GET  /api/admin/users/[id]/contact-log
 *      آخر رسائل واتساب المسجّلة للإدارة لهذا الكادر (نوع ADMIN_WHATSAPP)
 *      — يُعرض في «سجل التواصل» داخل حوار مراجعة الملف.
 *
 * POST /api/admin/users/[id]/contact-log   body: { message, title? }
 *      توثيق رسالة واتساب أرسلتها الإدارة: تُسجَّل كإشعار داخلي للكادر
 *      (يصل تنبيهاً فورياً في تطبيقه عبر نظام الإشعارات القائم) وتظهر
 *      للإدارة في سجل التواصل. لا يُغيّر أي بيانات حساب قائمة.
 *      رابط الإشعار يُشتق من دور الكادر (مستنداته) لاستكمال المطلوب.
 */

const DOCS_LINK_BY_ROLE: Record<string, string> = {
  NURSE: '/nurse/documents',
  DOCTOR: '/doctor/documents',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const entries = await db.notification.findMany({
      where: { userId: id, type: 'ADMIN_WHATSAPP' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, body: true, createdAt: true },
    })

    return NextResponse.json({ entries })
  } catch (error) {
    return handleApiError(error)
  }
}

const sendLogSchema = z.object({
  message: z.string({ error: 'نص الرسالة مطلوب' }).min(1, 'نص الرسالة مطلوب').max(2000, 'الرسالة طويلة جداً'),
  title: z.string().max(120).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const parsed = sendLogSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة', 422)
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, name: true },
    })
    if (!target || target.role === 'ADMIN') return jsonError('الحساب غير موجود', 404)

    await notify(id, {
      title: parsed.data.title?.trim() || 'طلب متابعة من الإدارة — عبر واتساب',
      body: parsed.data.message,
      type: 'ADMIN_WHATSAPP',
      link: DOCS_LINK_BY_ROLE[target.role],
    })

    return NextResponse.json({ ok: true, message: 'تم تسجيل الرسالة في سجل التواصل' })
  } catch (error) {
    return handleApiError(error)
  }
}
