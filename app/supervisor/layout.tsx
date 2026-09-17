import { DashboardShell } from '@/components/shared/dashboard-shell'
import { requirePanelAccess } from '@/lib/panel-access'

export default async function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanelAccess('DOCTOR_SUPERVISOR')

  return (
    <DashboardShell role="DOCTOR_SUPERVISOR" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
