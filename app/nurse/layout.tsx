import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell } from '@/components/shared/dashboard-shell'

export default async function NurseLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'NURSE') {
    redirect('/login?callbackUrl=/nurse')
  }

  return (
    <DashboardShell role="NURSE" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
