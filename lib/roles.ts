/**
 * محرك الصلاحيات المركّبة — الجولة 60 | تكليفات | Takleefat
 * ============================================================
 * فكرة النظام (الخيار ج):
 * - الدور الأساسي `role` يبقى كما هو حرفياً — لا يُمس ولا يُغيَّر بأي شكل.
 * - الإدارة قد تمنح الحساب «صلاحيات مركّبة» إضافية (extraRoles) فوق دوره الأساسي،
 *   مثال: مستلم إداري (RECEIVER) + صلاحية مشرف أطباء (DOCTOR_SUPERVISOR)
 *   → يدخل اللوحتين ويعمل بكل قدرات كل دور.
 * - «الوضع النشط» (activeRole) هو الدور الذي يعمل به الحساب الآن:
 *   يُثبَّت تلقائياً عند دخول أي لوحة يملك صلاحيتها، وهو ما تتحقق منه
 *   كل مسارات الـAPI — فالسلوك متسق دائماً مع اللوحة المفتوحة.
 * - التراجع الآمن: أي activeRole خارج الصلاحيات الفعالة يُتجاهل تلقائياً
 *   ويعود الحساب لدوره الأساسي (سحب صلاحية يسري فوراً بلا خطوات إضافية).
 *
 * إضافي بحت: الحسابات بلا صلاحيات مركّبة تتصرف تماماً كما كانت —
 * effectiveRoles = [الدور الأساسي] وactiveRole = الدور الأساسي.
 */

import type { RoleKey } from '@/lib/role-theme'

export type SessionRole = RoleKey

/** الأدوار التي تملك لوحة عمل — الإدارة (ADMIN) مستثناة من الصلاحيات المركّبة نهائياً
 *  الجولة 66: HR (الموارد البشرية — ميزة «فرصة») لوحة إدارية جديدة — لا يُنشئ حسابه بنفسه */
export const PANEL_ROLES = ['NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR', 'HR'] as const

/** لوحة كل دور — تُستخدم في الإشعارات وروابط التوجيه والمبدّل */
export const ROLE_DASHBOARD: Record<RoleKey, string> = {
  ADMIN: '/admin',
  NURSE: '/nurse',
  RECEIVER: '/receiver',
  DOCTOR: '/doctor',
  DOCTOR_SUPERVISOR: '/supervisor',
  HR: '/hr',
}

/** هل يملك هذا الحساب صلاحية الدور المطلوب؟ (الدور الأساسي أو صلاحية مركّبة ممنوحة) */
export function hasRole(
  user: { role?: string | null; extraRoles?: string[] | null } | null | undefined,
  needed: SessionRole
): boolean {
  if (!user?.role) return false
  if (user.role === needed) return true
  // ADMIN لا يُمنح كمركّب ولا يحتاجه — والفحص يبقى آمناً لأي قائمة
  return Array.isArray(user.extraRoles) && user.extraRoles.includes(needed)
}

/**
 * الصلاحيات الفعالة للحساب: الدور الأساسي أولاً ثم المركّبة (دون تكرار،
 * ومنقّاة إلى الأدوار المعروفة حصراً — دفاع عمق ضد أي قيمة غريبة في القاعدة).
 */
export function effectiveRoles(
  user: { role?: string | null; extraRoles?: string[] | null } | null | undefined
): SessionRole[] {
  const known: SessionRole[] = ['ADMIN', 'NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR', 'HR']
  const primary = user?.role && known.includes(user.role as SessionRole)
    ? (user.role as SessionRole)
    : null
  const extras = (Array.isArray(user?.extraRoles) ? user!.extraRoles : []).filter(
    (r): r is SessionRole =>
      known.includes(r as SessionRole) &&
      r !== 'ADMIN' && // الإدارة لا تُمنح كمركّب إطلاقاً
      r !== primary // الدور الأساسي يغطي نفسه — لا تكرار
  )
  return primary ? [primary, ...extras] : extras
}

/**
 * الوضع النشط الموثوق: activeRole المحفوظ إن كان ضمن الصلاحيات الفعالة،
 * وإلا الدور الأساسي (تراجع آمن بعد سحب أي صلاحية — يسري فوراً).
 */
export function operatingRole(
  user: { role?: string | null; extraRoles?: string[] | null; activeRole?: string | null } | null
  | undefined
): SessionRole {
  const effective = effectiveRoles(user)
  const active = user?.activeRole
  if (active && (effective as string[]).includes(active)) return active as SessionRole
  return (effective[0] ?? 'NURSE') as SessionRole
}

/** أقسام العمل (الكادر) أو التخصصات (الطبيب) حسب دور التنفيذ النشط */
export function workerAudienceRole(role: string): 'NURSE' | 'DOCTOR' {
  return role === 'DOCTOR' ? 'DOCTOR' : 'NURSE'
}
