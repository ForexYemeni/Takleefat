import { DashboardShell } from '@/components/shared/dashboard-shell'
import { requirePanelAccess } from '@/lib/panel-access'

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanelAccess('DOCTOR')

  return (
    <DashboardShell role="DOCTOR" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
