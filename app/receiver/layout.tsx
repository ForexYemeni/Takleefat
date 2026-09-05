import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell, type NavItem } from '@/components/shared/dashboard-shell'
import { Inbox, LayoutDashboard } from 'lucide-react'

const NAV_ITEMS: NavItem[] = [
  { href: '/receiver', label: 'نظرة عامة', icon: LayoutDashboard },
  { href: '/receiver/assignments', label: 'التكليفات الواردة', icon: Inbox },
]

export default async function ReceiverLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'RECEIVER') {
    redirect('/login?callbackUrl=/receiver')
  }

  return (
    <DashboardShell
      navItems={NAV_ITEMS}
      roleLabel="المستلم الإداري"
      userName={session.user.name}
    >
      {children}
    </DashboardShell>
  )
}
