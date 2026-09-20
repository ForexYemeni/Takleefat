import { DashboardShell } from '@/components/shared/dashboard-shell'
import { requirePanelAccess } from '@/lib/panel-access'

/**
 * لوحة الموارد البشرية — الجولة 66 | ميزة «فرصة»
 * الحارس: requirePanelAccess('HR') — يمنع أي دور آخر من الدخول حتى بتغيير
 * الرابط يدوياً، ويثبّت الوضع النشط (نفس نمط بقية اللوحات حرفياً).
 */
export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanelAccess('HR')

  return (
    <DashboardShell role="HR" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
