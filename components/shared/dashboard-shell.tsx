'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  Building2,
  ClipboardList,
  Coins,
  FileCheck2,
  Headset,
  IdCard,
  Inbox,
  LayoutDashboard,
  LogOut,
  MailPlus,
  Menu,
  Moon,
  Settings2,
  Star,
  Sun,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'
import { NotificationBell } from '@/components/shared/notification-bell'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { PushNotificationsToggle } from '@/components/pwa/push-notifications-toggle'
import { PushBanner } from '@/components/pwa/push-banner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export type DashboardRole = 'ADMIN' | 'NURSE' | 'RECEIVER'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * قوائم التنقل — تُعرَّف داخل مكوّن العميل لتوافق RSC
 */
const NAV_CONFIG: Record<DashboardRole, { roleLabel: string; profilePath: string; items: NavItem[] }> = {
  ADMIN: {
    roleLabel: 'مدير النظام',
    profilePath: '/admin/profile',
    items: [
      { href: '/admin', label: 'نظرة عامة', icon: LayoutDashboard },
      { href: '/admin/nurses', label: 'الكادر التمريضي', icon: Users },
      { href: '/admin/receivers', label: 'المستلمون الإداريون', icon: UserCog },
      { href: '/admin/organizations', label: 'الجهات الصحية', icon: Building2 },
      { href: '/admin/assignments', label: 'التكليفات', icon: ClipboardList },
      { href: '/admin/documents', label: 'مراجعة المستندات', icon: FileCheck2 },
      { href: '/admin/settings', label: 'الرسوم وطرق الدفع', icon: Settings2 },
      { href: '/admin/contact', label: 'التواصل', icon: Headset },
      { href: '/admin/profile', label: 'الملف الشخصي', icon: UserRound },
    ],
  },
  NURSE: {
    roleLabel: 'الكادر التمريضي',
    profilePath: '/nurse/profile',
    items: [
      { href: '/nurse', label: 'نظرة عامة', icon: LayoutDashboard },
      { href: '/nurse/assignments', label: 'التكليفات والتقديم', icon: ClipboardList },
      { href: '/nurse/invitations', label: 'الاستدعاءات المباشرة', icon: MailPlus },
      { href: '/nurse/documents', label: 'مستنداتي', icon: FileCheck2 },
      { href: '/nurse/card', label: 'بطاقتي المهنية', icon: IdCard },
      { href: '/nurse/profile', label: 'الملف الشخصي', icon: UserRound },
    ],
  },
  RECEIVER: {
    roleLabel: 'المستلم الإداري',
    profilePath: '/receiver/profile',
    items: [
      { href: '/receiver', label: 'نظرة عامة', icon: LayoutDashboard },
      { href: '/receiver/assignments', label: 'التكليفات والتقديمات', icon: Inbox },
      { href: '/receiver/staff', label: 'كوادر جهتي', icon: Users },
      { href: '/receiver/favorites', label: 'الكوادر المفضلة', icon: Star },
      { href: '/receiver/earnings', label: 'أرباحي', icon: Coins },
      { href: '/receiver/profile', label: 'الملف الشخصي', icon: UserRound },
    ],
  },
}

interface DashboardShellProps {
  role: DashboardRole
  userName: string
  children: React.ReactNode
}

/**
 * هيكل لوحة التحكم — تكليفات | Takleefat
 * شريط جانبي ثابت على الشاشات الكبيرة + قائمة منزلقة على الجوال
 */
export function DashboardShell({ role, userName, children }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()
  const profilePath = NAV_CONFIG[role].profilePath
  const displayName = (session?.user?.name as string | undefined) || userName
  const [mobileOpen, setMobileOpen] = useState(false)
  const navItems = NAV_CONFIG[role].items
  const roleLabel = NAV_CONFIG[role].roleLabel

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push('/login')
    router.refresh()
  }

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="size-4.5 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const renderSidebarContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <Link href="/" aria-label="تكليفات | Takleefat">
          <Logo size="sm" />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <p className="mb-2 px-6 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
          {roleLabel}
        </p>
        {renderNavLinks(onNavigate)}
        {/* زر تثبيت التطبيق — PWA: يظهر فقط في المتصفحات الداعمة ويختفي بعد التثبيت */}
        <div className="mt-3 space-y-2 px-3">
          <InstallAppButton className="w-full" />
          <PushNotificationsToggle />
        </div>
      </div>
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-teal-100 text-sm font-bold text-teal-800">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{displayName}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            aria-label="تسجيل الخروج"
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      {/* الشريط الجانبي — شاشات كبيرة */}
      <aside className="fixed inset-y-0 end-0 z-40 hidden w-64 border-e bg-sidebar lg:block">
        {renderSidebarContent()}
      </aside>

      {/* المحتوى */}
      <div className="flex min-h-screen w-full flex-col lg:pe-64">
        {/* الشريط العلوي */}
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-2">
              {/* قائمة الجوال */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="فتح القائمة">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72 p-0">
                  <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                  {renderSidebarContent(() => setMobileOpen(false))}
                </SheetContent>
              </Sheet>
              <p className="text-sm font-bold lg:hidden">تكليفات</p>
            </div>

            <div className="flex items-center gap-1.5">
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="تبديل المظهر"
              >
                <Sun className="size-5 dark:hidden" />
                <Moon className="hidden size-5 dark:block" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2" aria-label="قائمة المستخدم">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-teal-100 text-xs font-bold text-teal-800">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-32 truncate text-sm font-semibold md:inline-block">
                      {displayName}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>
                    <p className="truncate text-sm font-bold">{displayName}</p>
                    <p className="text-xs font-normal text-muted-foreground">{roleLabel}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push(profilePath)} className="gap-2">
                    <UserRound className="size-4" />
                    الملف الشخصي
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="size-4" />
                    تسجيل الخروج
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-6xl">
            <PushBanner />
            {children}
          </div>
        </main>

        <footer className="mt-auto border-t py-3">
          <p className="px-4 text-center text-xs text-muted-foreground">
            تكليفات | Takleefat — منصة احترافية لإدارة التكليفات الطبية والتمريضية
          </p>
        </footer>
      </div>
    </div>
  )
}
