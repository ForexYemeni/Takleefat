import { DashboardShell } from '@/components/shared/dashboard-shell'
import { requirePanelAccess } from '@/lib/panel-access'

export default async function NurseLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanelAccess('NURSE')

  return (
    <DashboardShell role="NURSE" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
