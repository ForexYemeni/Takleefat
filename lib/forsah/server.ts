import { db } from '@/lib/db'
import type { Session } from 'next-auth'
import type { Prisma } from '@prisma/client'
import {
  LICENSE_DOCUMENT_TYPES,
  type EligibilityCandidate,
} from '@/lib/forsah/eligibility'
import { hasForsahPermission } from '@/lib/forsah/permissions'
import type { ForsahPermission } from '@/lib/forsah/constants'
import { ApiError } from '@/lib/api-helpers'

/**
 * مساعدات خادم «فرصة» — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * بناء سياق المتقدم للاهلية، فحص الملكية والصلاحيات على مستوى الخادم حصراً.
 * كل دالة هنا تُستخدم من مسارات API الجديدة فقط — لا يمس أي مسار قائم.
 */

/** اختيار قياسي لبيانات الفرصة مع الكتالوجات (لا نسخ — مراجع حية) */
export const OPPORTUNITY_INCLUDE = {
  hospital: { select: { id: true, name: true, location: true, city: true } },
  specialty: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  qualification: { select: { id: true, name: true, audience: true } },
  createdBy: {
    select: { id: true, name: true, jobTitle: true, hospitalName: true },
  },
  _count: { select: { applications: true, selections: true, interviews: true } },
} satisfies Prisma.OpportunityInclude

export type OpportunityWithCatalog = Prisma.OpportunityGetPayload<{ include: typeof OPPORTUNITY_INCLUDE }>

/**
 * بناء سياق المتقدم الحقيقي من الملف القائم (لا نسخ — قراءة حية):
 * الدور، الحالة، الجنس، المؤهل، الخبرة، أقسام/تخصصات العمل، المستندات، الترخيص.
 */
export async function buildCandidate(userId: string): Promise<EligibilityCandidate | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      gender: true,
      qualification: true,
      yearsOfExperience: true,
    },
  })
  if (!user) return null

  const isDoctor = user.role === 'DOCTOR'
  const tags = isDoctor
    ? await db.doctorSpecialty.findMany({
        where: { doctorId: userId },
        include: { specialty: { select: { name: true } } },
      })
    : await db.workDepartment.findMany({
        where: { nurseId: userId },
        include: { department: { select: { name: true } } },
      })

  const [approvedDocs, approvedLicense] = await Promise.all([
    db.document.count({ where: { userId, status: 'APPROVED' } }),
    db.document.count({
      where: {
        userId,
        status: 'APPROVED',
        type: { in: LICENSE_DOCUMENT_TYPES },
      },
    }),
  ])

  return {
    id: user.id,
    role: user.role,
    status: user.status,
    gender: user.gender,
    qualification: user.qualification,
    yearsOfExperience: user.yearsOfExperience,
    workTags: tags.map((t) =>
      isDoctor ? t.specialty.name : (t as { department: { name: string } }).department.name
    ),
    approvedDocuments: approvedDocs,
    hasApprovedLicense: approvedLicense > 0,
  }
}

/**
 * الفاعل في نظام «فرصة» من الجلسة الحية — يقرأ الصلاحيات من القاعدة مباشرة
 * (سحب صلاحية يسري فوراً) ويُلقي خطأ 403 عند غياب الصلاحية.
 */
export async function requireForsahPermission(
  session: Session,
  permission: ForsahPermission
): Promise<{ id: string; role: string; name: string; forsahPermissions: string[] }> {
  const operating = session.user.activeRole ?? session.user.role
  if (operating !== 'HR' && operating !== 'ADMIN') {
    throw new ApiError('ليست لديك صلاحية للوصول إلى نظام «فرصة»', 403)
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, name: true, status: true, forsahPermissions: true },
  })
  if (!user) throw new ApiError('الحساب غير موجود', 401)
  if (user.status !== 'APPROVED') {
    throw new ApiError('حسابك غير معتمد — لا يمكنك استخدام نظام «فرصة» حتى اعتماده', 403)
  }
  if (!hasForsahPermission(user, permission)) {
    throw new ApiError('ليست لديك صلاحية لتنفيذ هذا الإجراء', 403)
  }
  return user
}

/** التأكد من أن HR يملك هذه الفرصة (الإدارة تستثنى دائماً) */
export async function assertOpportunityOwnership(
  opportunity: { createdById: string },
  actor: { id: string; role: string }
): Promise<void> {
  if (actor.role === 'ADMIN') return
  if (opportunity.createdById !== actor.id) {
    throw new ApiError('هذه الفرصة ليست من فرصك — لا يمكنك إدارتها', 403)
  }
}
