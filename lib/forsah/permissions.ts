import type { ForsahPermission } from '@/lib/forsah/constants'
import { DEFAULT_HR_PERMISSIONS } from '@/lib/forsah/constants'

/**
 * محرك صلاحيات «فرصة» — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * طبقة RBAC مستقلة فوق نظام الأدوار القائم:
 *  - الإدارة (ADMIN): تملك كل صلاحيات «فرصة» دائماً — السلطة العليا بلا استثناء.
 *  - HR: يملك الصلاحيات الممنوحة له صراحة في User.forsahPermissions من الإدارة.
 *  - بقية الأدوار: لا شيء (لا يرون لوحة الفرص إطلاقاً — إن دخلوها بالرابط يُردّهم الحارس).
 *
 * التحقق يحدث دائماً على الخادم (API) حصراً — القوائم في الواجهة للتنظيم فقط.
 */

export interface ForsahActor {
  role?: string | null
  forsahPermissions?: string[] | null
}

/** هل يملك هذا الفاعل صلاحية «فرصة» محددة؟ (الإدارة تملك الكل دائماً) */
export function hasForsahPermission(
  actor: ForsahActor | null | undefined,
  permission: ForsahPermission
): boolean {
  if (!actor?.role) return false
  if (actor.role === 'ADMIN') return true
  if (actor.role !== 'HR') return false
  return Array.isArray(actor.forsahPermissions) && actor.forsahPermissions.includes(permission)
}

/** الصلاحيات الفعالة لعرضها في واجهة الإدارة (الإدارة = الكل) */
export function effectiveForsahPermissions(actor: ForsahActor | null | undefined): string[] {
  if (!actor?.role) return []
  if (actor.role === 'ADMIN') return Object.values(FORSAH_PERMISSIONS_LIST)
  if (actor.role !== 'HR') return []
  return (Array.isArray(actor.forsahPermissions) ? actor.forsahPermissions : []).filter((p) =>
    (FORSAH_PERMISSIONS_LIST as readonly string[]).includes(p)
  )
}

// استيراد مؤجل داخلي لتجنب دورة استيراد — نفس قائمة المفاتيح
const FORSAH_PERMISSIONS_LIST = [
  'opportunity.view',
  'opportunity.create',
  'opportunity.edit',
  'opportunity.publish',
  'opportunity.pause',
  'opportunity.close',
  'opportunity.viewApplicants',
  'opportunity.inviteInterview',
  'opportunity.selectCandidate',
  'opportunity.viewFinancials',
  'opportunity.viewCommission',
  'opportunity.manage',
] as const

/** الصلاحيات الافتراضية لعرضها في نموذج إنشاء HR */
export { DEFAULT_HR_PERMISSIONS }
