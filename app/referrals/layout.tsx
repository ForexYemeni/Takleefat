import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell, type DashboardRole } from '@/components/shared/dashboard-shell'
import { ROLE_DASHBOARD } from '@/lib/roles'
import { REFERRAL_ELIGIBLE_ROLES } from '@/lib/referrals'

/**
 * تخطيط صفحة «إحالاتي» — الجولة 75 (برنامج إحالة تكليفات — إضافي بحت)
 * صفحة مستقلة مشتركة للأدوار الخمسة المؤهلة — لا تثبّت أي وضع نشط ولا تمس
 * لوحات العمل القائمة: الحساب بلا جلسة → تسجيل الدخول، والإدارة → لوحتها
 * الخاصة بالإحالات، وغير المؤهل → لوحته الأساسية.
 */
export default async function ReferralsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/referrals')
  }

  const primaryRole = session.user.role as string

  // الإدارة لها لوحتها الخاصة بإدارة الإحالات
  if (primaryRole === 'ADMIN') {
    redirect('/admin/referrals')
  }

  // غير المؤهل → لوحته الأساسية الحالية
  if (!(REFERRAL_ELIGIBLE_ROLES as readonly string[]).includes(primaryRole)) {
    redirect(ROLE_DASHBOARD[primaryRole as DashboardRole] ?? '/')
  }

  return (
    <DashboardShell role={primaryRole as DashboardRole} userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
