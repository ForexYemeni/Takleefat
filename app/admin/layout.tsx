import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardShell, type NavItem } from '@/components/shared/dashboard-shell'
import { ClipboardList, FileCheck2, LayoutDashboard, UserCog, Users } from 'lucide-react'

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'نظرة عامة', icon: LayoutDashboard },
  { href: '/admin/nurses', label: 'الكادر التمريضي', icon: Users },
  { href: '/admin/receivers', label: 'المستلمون الإداريون', icon: UserCog },
  { href: '/admin/assignments', label: 'التكليفات', icon: ClipboardList },
  { href: '/admin/documents', label: 'مراجعة المستندات', icon: FileCheck2 },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/login?callbackUrl=/admin')
  }

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="مدير النظام" userName={session.user.name}>
      {children}
    </DashboardShell>
  )
}
