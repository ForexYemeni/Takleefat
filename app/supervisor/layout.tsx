import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell } from '@/components/shared/dashboard-shell'

export default async function ReceiverLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'DOCTOR_SUPERVISOR') {
    redirect('/login?callbackUrl=/supervisor')
  }

  return (
    <DashboardShell role="DOCTOR_SUPERVISOR" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
