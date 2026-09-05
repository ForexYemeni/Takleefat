import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell, type NavItem } from '@/components/shared/dashboard-shell'
import { ClipboardList, FileUp, LayoutDashboard, UserRound } from 'lucide-react'

const NAV_ITEMS: NavItem[] = [
  { href: '/nurse', label: 'نظرة عامة', icon: LayoutDashboard },
  { href: '/nurse/assignments', label: 'تكليفاتي', icon: ClipboardList },
  { href: '/nurse/documents', label: 'مستنداتي', icon: FileUp },
  { href: '/nurse/profile', label: 'الملف الشخصي', icon: UserRound },
]

export default async function NurseLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'NURSE') {
    redirect('/login?callbackUrl=/nurse')
  }

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="الكادر التمريضي" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
