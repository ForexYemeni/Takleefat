import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { hasRole, ROLE_DASHBOARD, type SessionRole } from '@/lib/roles'

/**
 * حارس لوحات العمل — الجولة 60 (الصلاحيات المركّبة)
 * ============================================================
 * البوابة الموحدة لكل لوحة (بدل فحص الدور الأساسي حصراً):
 * 1) بلا جلسة → صفحة الدخول مع رابط العودة.
 * 2) الحكم النهائي على الصلاحية من الجلسة الحية (الدور الأساسي أو صلاحية
 *    مركّبة ممنوحة — الجلسة تجلبها من القاعدة لحظياً)، ورفض غير المالك
 *    بتوجيهه إلى لوحته الأساسية — لا حلقات توجيه مع middleware.
 * 3) تثبيت «الوضع النشط» على لوحة الدخول: كل مسارات الـAPI تتحقق منه فيعمل
 *    الحساب بكل قدرات الدور الذي فتح لوحته. الكتابة تحدث فقط عند تغيّر
 *    الوضع فعلاً — الحسابات العادية (دور واحد) لا يُكتب عليها أبداً
 *    (activeRole المحسوب = الدور الأساسي = اللوحة) → صفر مساس ببياناتها.
 */
export async function requirePanelAccess(panel: Exclude<SessionRole, 'ADMIN'>) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${ROLE_DASHBOARD[panel]}`)
  }

  if (!hasRole(session.user, panel)) {
    // ليس مالك هذه الصلاحية → لوحته الأساسية الحالية (من الجلسة الحية) —
    // هذا يكسر أي حلقة توجيه محتملة بعد نقل الدور أو سحب صلاحية
    redirect(ROLE_DASHBOARD[session.user.role] ?? '/login')
  }

  // تثبيت الوضع النشط عند الدخول للوحة (فقط إن كان يعمل بلوحة أخرى الآن)
  if (session.user.activeRole !== panel) {
    await db.user.update({
      where: { id: session.user.id },
      data: { activeRole: panel },
    })
  }

  return session
}
