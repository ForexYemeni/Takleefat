import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { z } from 'zod'

/**
 * GET /api/admin/receiver-orgs — طلبات ربط الجهات الصحية بمسؤوليها — الجولة 44
 * قائمة الروابط (المعلقة أولاً) مع بيانات المسؤول والجهة — لاعتمادها أو رفضها
 * من صفحة الجهات الصحية في حساب الإدارة.
 * الإدارة ترى كل البيانات (اسم المسؤول ورقمه واسم الجهة) كما في بقية صفحاتها.
 */
const querySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED']).optional(),
})

export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const status = req.nextUrl.searchParams.get('status') ?? ''

    const links = await db.receiverOrgLink.findMany({
      where:
        status && ['PENDING', 'ACTIVE', 'REJECTED'].includes(status)
          ? { status: status as 'PENDING' | 'ACTIVE' | 'REJECTED' }
          : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        receiver: { select: { id: true, name: true, phone: true, role: true, hospitalName: true } },
        hospital: { select: { id: true, name: true, type: true, city: true, status: true } },
      },
    })

    return NextResponse.json({
      links,
      /** طلبات ربط معلقة + جهات مقترحة معلقة من المسؤولين — لعدادات صفحة الإدارة */
      pendingCount: links.filter((l) => l.status === 'PENDING').length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
