import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'
import { resolveReceiverOrgs } from '@/lib/network'
import { z } from 'zod'

/**
 * جهات المسؤول الصحية — الجولة 44
 * =====================================================
 * «في حساب المستلم الإداري الملف الشخصي يجب ان تظهر الجهه الصحية التي يعمل
 * فيها ويمكنه اضافه جهه صحية اخرى بشرط الموافقة عليها من حساب الادارة»
 *
 * GET /api/receiver/orgs — جهاتي: الأساسية (التاريخية) + الروابط بحالاتها
 * POST /api/receiver/orgs — طلب إضافة جهة:
 *   - { hospitalId } جهة من كتالوج الإدارة → رابط PENDING بانتظار اعتماد الإدارة
 *   - { newOrg } جهة جديدة غير موجودة → تُنشأ PENDING + رابط PENDING (نفس قواعد
 *     اقتراح الجهات في السجل المهني) — ولا تُنشّط إلا باعتماد الإدارة منها ومن ربطها
 */

const createOrgLinkSchema = z
  .object({
    hospitalId: z.string().min(1).optional(),
    note: z.string().max(300, 'الملاحظة طويلة جداً').optional().or(z.literal('')),
    newOrg: z
      .object({
        name: z
          .string({ error: 'اسم الجهة الصحية مطلوب' })
          .min(2, 'اسم الجهة مطلوب')
          .max(150, 'الاسم طويل جداً'),
        type: z
          .enum(['HOSPITAL', 'MEDICAL_CENTER', 'SPECIALIZED_CENTER', 'CLINIC', 'MEDICAL_COMPLEX', 'OTHER'])
          .optional(),
        city: z.string().max(80, 'المدينة طويلة جداً').optional().or(z.literal('')),
        address: z.string().max(200, 'العنوان طويل جداً').optional().or(z.literal('')),
        phone: z.string().max(20, 'رقم التواصل طويل جداً').optional().or(z.literal('')),
      })
      .optional(),
  })
  .refine((d) => d.hospitalId || d.newOrg, {
    message: 'اختر جهة من القائمة أو أضف جهة جديدة',
    path: ['hospitalId'],
  })

export async function GET() {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')

    const [orgs, links, me] = await Promise.all([
      resolveReceiverOrgs(session.user.id),
      db.receiverOrgLink.findMany({
        where: { receiverId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          hospital: {
            select: { id: true, name: true, type: true, city: true, status: true },
          },
        },
      }),
      db.user.findUnique({
        where: { id: session.user.id },
        select: { hospitalName: true },
      }),
    ])

    return NextResponse.json({
      /** الجهات الفعّالة (التاريخية + المعتمدة) — تُستخدم في إدارة الكوادر والتكليفات */
      orgs,
      /** الجهة الأساسية — من بيانات التسجيل (hospitalName) */
      primaryName: me?.hospitalName ?? null,
      /** كل الروابط بحالاتها — لتعرض طلبات «بانتظار موافقة الإدارة» في الملف */
      links: links.map((l) => ({
        id: l.id,
        status: l.status,
        note: l.note,
        createdAt: l.createdAt,
        hospital: l.hospital,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')

    const parsed = createOrgLinkSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { note, newOrg } = parsed.data

    // ---------- جهة جديدة؟ تُنشأ PENDING وتُرفع للإدارة (نفس قواعد اقتراح الجهات) ----------
    let hospitalId = parsed.data.hospitalId
    if (!hospitalId && newOrg) {
      const orgName = newOrg.name.trim()
      const dup = await db.hospital.findUnique({ where: { name: orgName } })
      if (dup) {
        // موجودة مسبقاً؟ نطلب الربط بها مباشرة بدل الرفض — إن لم يكن رابطاً قائماً
        const existingLink = await db.receiverOrgLink.findUnique({
          where: { receiverId_hospitalId: { receiverId: session.user.id, hospitalId: dup.id } },
        })
        if (existingLink) {
          return jsonError('طلب ربطك بهذه الجهة موجود مسبقاً — بانتظار مراجعة الإدارة', 409)
        }
        hospitalId = dup.id
      } else {
        const createdOrg = await db.hospital.create({
          data: {
            name: orgName,
            type: newOrg.type ?? 'HOSPITAL',
            city: newOrg.city?.trim() || null,
            address: newOrg.address?.trim() || null,
            phone: newOrg.phone?.trim() || null,
            status: 'PENDING',
            isActive: false,
          },
        })
        hospitalId = createdOrg.id
      }
    }
    if (!hospitalId) return jsonError('الجهة الصحية مطلوبة', 422)

    const hospital = await db.hospital.findUnique({
      where: { id: hospitalId },
      select: { id: true, name: true, status: true },
    })
    if (!hospital) return jsonError('الجهة الصحية غير موجودة', 404)
    if (hospital.status === 'INACTIVE') {
      return jsonError('هذه الجهة معطلة حالياً — راجع الإدارة', 422)
    }

    // الجهة التاريخية نفسها لا تحتاج طلب ربط — هي أصلية في الحساب
    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { hospitalName: true },
    })
    if (me?.hospitalName && me.hospitalName === hospital.name) {
      return jsonError('هذه جهتك الأساسية المسجلة في حسابك أصلاً', 409)
    }

    const existing = await db.receiverOrgLink.findUnique({
      where: { receiverId_hospitalId: { receiverId: session.user.id, hospitalId } },
    })
    if (existing) {
      return jsonError(
        existing.status === 'PENDING'
          ? 'طلب ربطك بهذه الجهة موجود مسبقاً — بانتظار مراجعة الإدارة'
          : existing.status === 'ACTIVE'
            ? 'هذه الجهة مرتبطة بحسابك وفعّالة بالفعل'
            : 'رُفض طلب ربطك بهذه الجهة سابقاً — راجع الإدارة',
        409
      )
    }

    const link = await db.receiverOrgLink.create({
      data: {
        receiverId: session.user.id,
        hospitalId,
        status: 'PENDING',
        note: note?.trim() || null,
      },
      include: { hospital: { select: { name: true } } },
    })

    // إشعار الإدارة — بلا أي بيانات اتصال
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((a) =>
        notify(a.id, {
          title: 'طلب ربط جهة صحية بمسؤول',
          body: `${session.user.name} يطلب ربط جهة (${hospital.name}) بحسابه كجهة إضافية — راجع الطلب واعتمده من صفحة الجهات الصحية`,
          type: 'GENERIC',
          link: '/admin/organizations',
        })
      )
    )

    return NextResponse.json(
      {
        message: `تم إرسال طلب إضافة جهة (${hospital.name}) — ستصلك الموافقة من الإدارة وترتبط بحسابك فوراً بعدها`,
        link,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
