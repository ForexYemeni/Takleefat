import { DashboardShell } from '@/components/shared/dashboard-shell'
import { requirePanelAccess } from '@/lib/panel-access'

export default async function ReceiverLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanelAccess('RECEIVER')

  return (
    <DashboardShell role="RECEIVER" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
