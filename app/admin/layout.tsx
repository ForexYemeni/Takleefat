import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell } from '@/components/shared/dashboard-shell'
import { ROLE_DASHBOARD } from '@/lib/roles'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'ADMIN') {
    // الجولة 60: غير المدير يوجَّه إلى لوحته الأساسية الحالية من الجلسة الحية
    // (بدل صفحة الدخول — يكسر أي حلقة توجيه بعد نقل الدور أثناء الجلسة)
    if (session?.user?.id) {
      redirect(ROLE_DASHBOARD[session.user.activeRole] ?? '/')
    }
    redirect('/login?callbackUrl=/admin')
  }

  return (
    <DashboardShell role="ADMIN" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
