import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell } from '@/components/shared/dashboard-shell'

export default async function ReceiverLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'RECEIVER') {
    redirect('/login?callbackUrl=/receiver')
  }

  return (
    <DashboardShell role="RECEIVER" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
