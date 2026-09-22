'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  Gauge,
  Gift,
  House,
  Inbox,
  Plus,
  Send,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  XCircle,
} from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { cn, formatCurrency, timeAgo } from '@/lib/utils'
import { computeMatchScore, ROLE_THEME, type RoleKey } from '@/lib/role-theme'
import { useNotifications } from '@/hooks/use-notifications'
import { CreatePostDialog } from '@/components/shared/create-post-dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

/**
 * شريط التنقل الذكي العائم — الجولة 58 · تصميم مطوَّر — الجولة 73
 * =====================================================
 * زجاج سائل عائم فوق المحتوى مع مسافة عن الحافة السفلية:
 * - يتغير حسب الدور (عناصر لا يحتاجها المستخدم لا تُعرض إطلاقاً)
 * - زر مركزي مرتفع (Squircle) يتغير وظيفته حسب الدور:
 *     كادر/طبيب → «تكلي AI» (لوحة ذكية بالمطابقات الحقيقية)
 *     مستلم إداري → «إنشاء تكليف» / مشرف → «الأطباء»
 *     مدير → «العمليات» / موارد بشرية → «نشر فرصة»
 * - الجولة 73 (مراجعة احترافية):
 *   · أسماء دائمة واضحة 11px تحت كل أيقونة (النشط أثقل وزناً بلون الدور)
 *   · أيقونات دلالية احترافية: House للرئيسية + UsersRound لإدارة الكادر
 *     + Gauge للعمليات + ClipboardList الموحدة لتبويبات التكليفات
 *   · كبسولة نشاط هادئة (بلا نقطة متوهجة منزلقة)
 *   · زر مركزي بلا هالة ضوئية ولا نبض — طابع مؤسسي هادئ
 * - شارات حقيقية من البيانات (إشعارات غير مقروءة + تكليفات جديدة/بانتظارك)
 * - على الشاشات الكبيرة يبقى الشريط الجانبي وحده (hidden lg:مخفي)
 */

type NavRole = RoleKey

interface NavTab {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  href?: string
  kind: 'link' | 'notifications'
  badge?: 'notifications' | 'assignments'
}

interface CenterAction {
  kind: 'ai' | 'create' | 'link'
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  href?: string
  /** جمهور الإنشاء — للمستلم NURSE وللمشرف DOCTOR */
  audience?: 'NURSE' | 'DOCTOR'
}

function roleConfig(role: NavRole): { tabs: NavTab[]; center: CenterAction } {
  switch (role) {
    case 'NURSE':
      return {
        tabs: [
          { key: 'home', label: 'الرئيسية', icon: House, href: '/nurse', kind: 'link' },
          { key: 'assignments', label: 'التكليفات', icon: ClipboardList, href: '/nurse/assignments', kind: 'link', badge: 'assignments' },
          { key: 'notifications', label: 'الإشعارات', icon: Bell, kind: 'notifications', badge: 'notifications' },
          { key: 'profile', label: 'الملف', icon: UserRound, href: '/nurse/profile', kind: 'link' },
        ],
        center: { kind: 'ai', label: 'تكلي AI', icon: Sparkles },
      }
    case 'DOCTOR':
      return {
        tabs: [
          { key: 'home', label: 'الرئيسية', icon: House, href: '/doctor', kind: 'link' },
          { key: 'assignments', label: 'التكليفات', icon: ClipboardList, href: '/doctor/assignments', kind: 'link', badge: 'assignments' },
          { key: 'notifications', label: 'الإشعارات', icon: Bell, kind: 'notifications', badge: 'notifications' },
          { key: 'profile', label: 'الملف', icon: UserRound, href: '/doctor/profile', kind: 'link' },
        ],
        center: { kind: 'ai', label: 'تكلي AI', icon: Sparkles },
      }
    case 'RECEIVER':
      return {
        tabs: [
          { key: 'home', label: 'الرئيسية', icon: House, href: '/receiver', kind: 'link' },
          { key: 'assignments', label: 'التكليفات', icon: ClipboardList, href: '/receiver/assignments', kind: 'link', badge: 'assignments' },
          { key: 'notifications', label: 'الإشعارات', icon: Bell, kind: 'notifications', badge: 'notifications' },
          { key: 'profile', label: 'الملف', icon: UserRound, href: '/receiver/profile', kind: 'link' },
        ],
        center: { kind: 'create', label: 'إنشاء تكليف', icon: Plus, audience: 'NURSE' },
      }
    case 'DOCTOR_SUPERVISOR':
      return {
        tabs: [
          { key: 'home', label: 'الرئيسية', icon: House, href: '/supervisor', kind: 'link' },
          { key: 'assignments', label: 'التكليفات', icon: ClipboardList, href: '/supervisor/assignments', kind: 'link', badge: 'assignments' },
          { key: 'notifications', label: 'الإشعارات', icon: Bell, kind: 'notifications', badge: 'notifications' },
          { key: 'profile', label: 'الملف', icon: UserRound, href: '/supervisor/profile', kind: 'link' },
        ],
        center: { kind: 'link', label: 'الأطباء', icon: Stethoscope, href: '/supervisor/staff' },
      }
    case 'ADMIN':
    default:
      return {
        tabs: [
          { key: 'assignments', label: 'التكليفات', icon: ClipboardList, href: '/admin/assignments', kind: 'link', badge: 'assignments' },
          { key: 'manage', label: 'الكادر', icon: UsersRound, href: '/admin/nurses', kind: 'link' },
          { key: 'notifications', label: 'الإشعارات', icon: Bell, kind: 'notifications', badge: 'notifications' },
          { key: 'profile', label: 'الملف', icon: UserRound, href: '/admin/profile', kind: 'link' },
        ],
        center: { kind: 'link', label: 'العمليات', icon: Gauge, href: '/admin' },
      }
    case 'HR':
      // الجولة 66 — لوحة الموارد البشرية (ميزة «فرصة»): إضافي بحت كلياً —
      // لا مساس بحالات الأدوار القائمة، والشارة على الفرص = متقدمون بانتظار المراجعة
      return {
        tabs: [
          { key: 'home', label: 'الرئيسية', icon: House, href: '/hr', kind: 'link' },
          { key: 'opportunities', label: 'الفرص', icon: Briefcase, href: '/hr/opportunities', kind: 'link', badge: 'assignments' },
          { key: 'notifications', label: 'الإشعارات', icon: Bell, kind: 'notifications', badge: 'notifications' },
          { key: 'profile', label: 'الملف', icon: UserRound, href: '/hr/profile', kind: 'link' },
        ],
        center: { kind: 'link', label: 'نشر فرصة', icon: Plus, href: '/hr/opportunities?new=1' },
      }
  }
}

/* ---------- أنواع خفيفة لبيانات الشارات ولوحة الذكاء ---------- */

interface NavPost {
  id: string
  title: string
  facility: string
  department: string | null
  value: number
  startDate: string
  endTime?: string | null
  hours?: number | null
  status: string
  createdAt: string
  _count?: { applications: number }
  applications?: Array<{ id: string; status: string }>
}

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

export function SmartBottomNav({ role }: { role: NavRole }) {
  const pathname = usePathname()
  const [notifOpen, setNotifOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const baseConfig = useMemo(() => roleConfig(role), [role])

  // ---------- الجولة 67: الإغلاق الكلي لنظام «فرصة» — الشارات ولوحات HR تتبع حالة النظام ----------
  const { data: forsahStatus } = useQuery({
    queryKey: ['forsah-status'],
    queryFn: () => apiFetcher<{ enabled: boolean }>('/api/forsah/status'),
    staleTime: 60_000,
    retry: 1,
  })
  const forsahEnabled = forsahStatus?.enabled ?? true

  const { tabs, center } = useMemo(() => {
    if (role === 'HR' && !forsahEnabled) {
      // النظام مغلق: يُخفى تبويب الفرص ويتحول الزر المركزي للرئيسية —
      // وتبقى الشارة على الرئيسية إن وُجد متقدمون (البيانات محفوظة)
      return {
        tabs: baseConfig.tabs.filter((t) => t.key !== 'opportunities'),
        center: { kind: 'link' as const, label: 'الرئيسية', icon: House, href: '/hr' },
      }
    }
    return baseConfig
  }, [baseConfig, role, forsahEnabled])

  // ---------- شارات حقيقية ----------
  const { unreadCount } = useNotifications()

  const { data: postsData } = useQuery({
    queryKey: ['open-posts'],
    queryFn: () => apiFetcher<{ posts: NavPost[] }>('/api/posts'),
    enabled: role !== 'ADMIN' && role !== 'HR',
    staleTime: 30_000,
  })
  // الجولة 66: شارة HR — متقدمون بانتظار المراجعة عبر إحصاءات «فرصة» (إضافي بحت)
  const { data: forsahStats } = useQuery({
    queryKey: ['forsah-nav-stats'],
    queryFn: () => apiFetcher<{ stats: { pendingApplications: number } }>('/api/forsah/dashboard'),
    enabled: role === 'HR',
    staleTime: 30_000,
  })
  const { data: statsData } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetcher<{ pendingApplications: number }>('/api/stats'),
    enabled: role === 'ADMIN',
    staleTime: 30_000,
  })

  const assignmentsBadge = useMemo(() => {
    const posts = postsData?.posts ?? []
    if (role === 'NURSE' || role === 'DOCTOR') {
      // تكليفات جديدة (آخر 3 أيام) لم يقدّم عليها الكادر بعد
      const now = Date.now()
      return posts.filter(
        (p) =>
          !(p.applications?.length) &&
          now - new Date(p.createdAt).getTime() < THREE_DAYS
      ).length
    }
    if (role === 'RECEIVER' || role === 'DOCTOR_SUPERVISOR') {
      // تقديمات بانتظار مراجعته
      return posts.reduce((sum, p) => sum + (p._count?.applications ?? 0), 0)
    }
    if (role === 'ADMIN') return statsData?.pendingApplications ?? 0
    // الجولة 66: HR — المتقدمون الجدد على فرصه (إضافي بحت)
    if (role === 'HR') return forsahStats?.stats?.pendingApplications ?? 0
    return 0
  }, [postsData, statsData, forsahStats, role])

  const badgeFor = (tab: NavTab): number => {
    if (tab.badge === 'notifications') return unreadCount
    if (tab.badge === 'assignments') return assignmentsBadge
    return 0
  }

  const isActive = (tab: NavTab): boolean => {
    if (tab.kind !== 'link' || !tab.href) return false
    if (tab.href === '/admin') return pathname === '/admin'
    return pathname === tab.href || pathname.startsWith(tab.href + '/')
  }

  // الجولة 73 — التبويب: أيقونة دلالية + اسم واضح دائم + كبسولة نشاط هادئة
  const tabButton = (tab: NavTab, index = 0) => {
    const active = isActive(tab)
    const count = badgeFor(tab)
    const Icon = tab.icon
    const inner = (
      <motion.span
        whileTap={{ scale: 0.92 }}
        className={cn(
          'relative flex min-w-14 flex-col items-center gap-1 rounded-2xl px-2 pb-1 transition-colors',
          active
            ? 'text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]'
            : 'text-muted-foreground'
        )}
        aria-current={active ? 'page' : undefined}
      >
        {active && (
          <motion.span
            layoutId="smart-nav-active"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="absolute inset-x-1 top-0 h-8 rounded-xl"
            style={{ background: 'var(--role-accent-soft)' }}
            aria-hidden
          />
        )}
        <span className="relative flex h-8 items-center justify-center">
          <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 2} />
          {count > 0 && (
            <span
              key={count}
              className={cn(
                'nav-badge absolute -top-1.5 -end-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black leading-none text-white shadow-md ring-2 ring-white/75 dark:ring-white/15',
                tab.badge === 'notifications' ? 'bg-red-500' : 'bg-[var(--role-accent)]'
              )}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
        <span
          className={cn(
            'relative text-[11px] leading-none',
            active ? 'font-extrabold' : 'font-semibold'
          )}
        >
          {tab.label}
        </span>
      </motion.span>
    )
    if (tab.kind === 'notifications') {
      return (
        <button
          key={tab.key}
          type="button"
          onClick={() => setNotifOpen(true)}
          aria-label={`${tab.label}${unreadCount ? ` — ${unreadCount} غير مقروءة` : ''}`}
          className="nav-stagger flex-1 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-accent)]"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {inner}
        </button>
      )
    }
    return (
      <Link
        key={tab.key}
        href={tab.href ?? '#'}
        aria-label={tab.label}
        className="nav-stagger flex-1 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-accent)]"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {inner}
      </Link>
    )
  }

  // الجولة 73 — الزر المركزي: Squircle هادئ احترافي — بلا هالة ولا نبض، مع حلقة نشاط
  const centerButton = () => {
    const Icon = center.icon
    const centerActive =
      center.kind === 'link' &&
      !!center.href &&
      (center.href === '/admin'
        ? pathname === '/admin'
        : pathname === center.href || pathname.startsWith(center.href + '/'))
    const shared = cn(
      'relative flex size-14 items-center justify-center rounded-[18px] text-white transition-transform',
      '-mt-7',
      centerActive && 'nav-center-active'
    )
    const style = {
      background: 'linear-gradient(150deg, var(--role-accent-glow), var(--role-accent))',
      boxShadow:
        '0 10px 22px -10px var(--role-accent-glow), 0 3px 10px -4px rgba(14, 27, 78, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(0, 0, 0, 0.12)',
    }
    const labelEl = (
      <span className="mt-1 block max-w-[68px] truncate text-center text-[10px] font-bold leading-none text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]">
        {center.label}
      </span>
    )
    const iconEl = <Icon className="size-[22px]" strokeWidth={2.1} />

    if (center.kind === 'ai') {
      return (
        <>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setAiOpen(true)}
            aria-label={center.label}
            className={shared}
            style={style}
          >
            {iconEl}
          </motion.button>
          {labelEl}
        </>
      )
    }
    if (center.kind === 'create') {
      return (
        <>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setCreateOpen(true)}
            aria-label={center.label}
            className={shared}
            style={style}
          >
            {iconEl}
          </motion.button>
          {labelEl}
        </>
      )
    }
    return (
      <motion.div whileTap={{ scale: 0.92 }} className="flex w-full flex-col items-center">
        <Link href={center.href ?? '#'} aria-label={center.label} className={cn(shared, 'block')} style={style}>
          {iconEl}
        </Link>
        {labelEl}
      </motion.div>
    )
  }

  // [تًاب1][تاب2] (الزر المركزي) [الإشعارات][الملف] — ترتيب RTL طبيعي
  const sideStart = tabs.slice(0, 2)
  const sideEnd = tabs.slice(2)

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <nav className="nav-rise mx-auto w-full max-w-md select-none px-4" aria-label="التنقل الرئيسي">
          <div className="liquid-glass nav-bar-glass flex touch-manipulation items-end justify-around gap-0.5 rounded-[26px] px-3 pb-2 pt-2.5">
            {sideStart.map((tab, i) => tabButton(tab, i))}
            {/* الجولة 73 — عمود الزر المركزي: دخول متدرج (أُزيلت الهالة الضوئية) */}
            <div
              className="nav-stagger relative flex w-16 shrink-0 flex-col items-center"
              style={{ animationDelay: '100ms' }}
            >
              {centerButton()}
            </div>
            {sideEnd.map((tab, i) => tabButton(tab, i + 3))}
          </div>
        </nav>
      </div>

      {/* لوحة الإشعارات — زجاجية لكل الأدوار */}
      <NotificationsDrawer role={role} open={notifOpen} onOpenChange={setNotifOpen} />

      {/* لوحة تكلي AI — للكادر والأطباء حصراً */}
      {(role === 'NURSE' || role === 'DOCTOR') && (
        <AiDrawer
          role={role}
          open={aiOpen}
          onOpenChange={setAiOpen}
        />
      )}

      {/* إنشاء تكليف — المستلم الإداري ومشرف الأطباء */}
      {(role === 'RECEIVER' || role === 'DOCTOR_SUPERVISOR') && center.kind === 'create' && (
        <CreatePostDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          audience={center.audience}
        />
      )}
    </>
  )
}

/* =====================================================
   لوحة الإشعارات الزجاجية — نفس بيانات الجرس الحقيقي
   ===================================================== */

const NOTIF_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  POST_CREATED: ClipboardList,
  APPLICATION_RECEIVED: Inbox,
  APPLICATION_APPROVED: CheckCircle2,
  ASSIGNMENT_CREATED: Send,
  DOCUMENT_REVIEWED: FileCheck2,
  GENERIC: Bell,
  // الجولة 66 — أحداث «فرصة» (إضافي بحت)
  OPPORTUNITY_PUBLISHED: Briefcase,
  OPPORTUNITY_APPLICATION_RECEIVED: Inbox,
  OPPORTUNITY_APPLICATION_REVIEWED: FileCheck2,
  OPPORTUNITY_INTERVIEW_INVITED: CalendarClock,
  OPPORTUNITY_INTERVIEW_CONFIRMED: CheckCircle2,
  OPPORTUNITY_INTERVIEW_DECLINED: XCircle,
  OPPORTUNITY_CANDIDATE_SELECTED: Users,
  OPPORTUNITY_PAYMENT_PENDING: Wallet,
  OPPORTUNITY_PAYMENT_COMPLETED: Wallet,
  OPPORTUNITY_CLOSED: XCircle,
}

function NotificationsDrawer({
  role,
  open,
  onOpenChange,
}: {
  role: NavRole
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { notifications, markRead, isLoading } = useNotifications()

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-transparent border-0">
        <div data-role={role} className="liquid-glass mx-auto max-h-[78vh] w-full max-w-md overflow-hidden rounded-t-3xl">
          <DrawerHeader className="pb-2 pt-4">
            <DrawerTitle className="flex items-center justify-between text-base font-black">
              <span className="flex items-center gap-2">
                <Bell className="size-4.5 text-[var(--role-accent)]" />
                الإشعارات
              </span>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => markRead({ all: true })}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--role-accent-strong)] transition-colors hover:bg-[var(--role-accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--role-accent)] dark:text-[var(--role-accent-glow)]"
                >
                  تعليم الكل كمقروء
                </button>
              )}
            </DrawerTitle>
            <DrawerDescription className="sr-only">قائمة إشعارات المنصة</DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[58vh] overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {isLoading ? (
              <div className="space-y-2 py-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary/60" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--role-accent-soft)]">
                  <Bell className="size-6 text-[var(--role-accent)]" />
                </span>
                <p className="text-sm font-bold">لا توجد إشعارات بعد</p>
                <p className="text-xs text-muted-foreground">ستصلك التنبيهات هنا فور حدوث أي مستجد يخصك</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {notifications.map((n) => {
                  const Icon = NOTIF_ICON[n.type] ?? Bell
                  return (
                    <li key={n.id}>
                      <Link
                        href={n.link ?? '#'}
                        onClick={() => {
                          if (!n.isRead) markRead({ id: n.id })
                          onOpenChange(false)
                        }}
                        className={cn(
                          'flex items-start gap-3 rounded-2xl p-3 transition-colors hover:bg-[var(--role-accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--role-accent)]',
                          !n.isRead && 'bg-[var(--role-accent-soft)]/60'
                        )}
                      >
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--role-accent-soft)]">
                          <Icon className="size-4.5 text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            {!n.isRead && (
                              <span className="status-dot-pulse size-1.5 shrink-0 rounded-full bg-[var(--role-accent)]" />
                            )}
                            <span className={cn('truncate text-sm', n.isRead ? 'font-semibold text-muted-foreground' : 'font-extrabold')}>
                              {n.title}
                            </span>
                          </span>
                          {n.body && (
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                              {n.body}
                            </span>
                          )}
                          <span className="mt-1 block text-[10px] font-bold text-muted-foreground/70">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/* =====================================================
   لوحة «تكلي AI» — اختيارات ذكية من بيانات حقيقية
   أفضل توافق + أقرب بداية + أعلى قيمة — تكليفات لم يقدّم عليها الكادر
   ===================================================== */

interface AiProfile {
  status?: string
  yearsOfExperience?: number | null
}

function AiDrawer({
  role,
  open,
  onOpenChange,
}: {
  role: NavRole
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const audience = role === 'DOCTOR' ? 'DOCTOR' : 'NURSE'
  const basePath = audience === 'DOCTOR' ? '/doctor/assignments' : '/nurse/assignments'

  const { data: postsData } = useQuery({
    queryKey: ['open-posts'],
    queryFn: () => apiFetcher<{ posts: NavPost[] }>('/api/posts'),
    enabled: open,
    staleTime: 30_000,
  })
  const { data: wdData } = useQuery({
    queryKey: ['my-work-departments'],
    queryFn: () => apiFetcher<{ departments: Array<{ id: string; name: string }> }>('/api/me/work-departments'),
    enabled: open && audience === 'NURSE',
    staleTime: 60_000,
  })
  const { data: wsData } = useQuery({
    queryKey: ['my-work-specialties'],
    queryFn: () => apiFetcher<{ specialties: Array<{ id: string; name: string }> }>('/api/me/work-specialties'),
    enabled: open && audience === 'DOCTOR',
    staleTime: 60_000,
  })
  const { data: profileData } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<{ user: AiProfile }>('/api/me/profile'),
    enabled: open,
    staleTime: 60_000,
  })

  const myTags = useMemo(() => {
    if (audience === 'NURSE') return (wdData?.departments ?? []).map((d) => d.name)
    return (wsData?.specialties ?? []).map((s) => s.name)
  }, [wdData, wsData, audience])

  const picks = useMemo(() => {
    const posts = (postsData?.posts ?? []).filter((p) => p.status === 'OPEN' && !(p.applications?.length))
    if (posts.length === 0) return { best: null, soonest: null, highest: null }

    const withMatch = posts.map((p) => ({
      post: p,
      match: computeMatchScore({
        audience,
        post: p,
        me: profileData?.user ?? null,
        myTags,
        documentsState: 'pending',
        timeConflict: false,
      }).score ?? 0,
    }))

    const best = [...withMatch].sort((a, b) => b.match - a.match)[0]?.post ?? null
    const soonest = [...posts].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    )[0]
    const highest = [...posts].sort((a, b) => b.value - a.value)[0]
    return { best, soonest: soonest ?? null, highest: highest ?? null }
  }, [postsData, profileData, myTags, audience])

  const cards: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; post: NavPost | null; hint?: (p: NavPost) => string }[] = [
    { key: 'best', label: 'أفضل توافق مع ملفك', icon: Sparkles, post: picks.best },
    { key: 'soonest', label: 'أقرب تكليفة تبدأ', icon: Clock, post: picks.soonest },
    { key: 'highest', label: 'أعلى قيمة متاحة', icon: Wallet, post: picks.highest },
  ]

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-transparent border-0">
        <div data-role={role} className="liquid-glass mx-auto w-full max-w-md rounded-t-3xl">
          <DrawerHeader className="pb-2 pt-4">
            <DrawerTitle className="flex items-center gap-2 text-base font-black">
              <span
                className="flex size-8 items-center justify-center rounded-xl text-white"
                style={{ background: 'linear-gradient(140deg, var(--role-accent-glow), var(--role-accent))' }}
              >
                <Sparkles className="size-4" />
              </span>
              تكلي AI — الذكي يختار لك
            </DrawerTitle>
            <DrawerDescription className="text-xs leading-relaxed text-muted-foreground">
              تحليل فوري لتكليفاتك المتاحة بناءً على ملفك وأقسام عملك الحقيقية
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-2 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
            {cards.every((c) => !c.post) ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--role-accent-soft)]">
                  <Sparkles className="size-6 text-[var(--role-accent)]" />
                </span>
                <p className="text-sm font-bold">لا توجد تكليفات متاحة حالياً</p>
                <p className="text-xs text-muted-foreground">أول ما يُنشر تكليف مناسب لملفك سيعرضه تكلي AI هنا فوراً</p>
              </div>
            ) : (
              cards.map(({ key, label, icon: Icon, post }) =>
                post ? (
                  <Link
                    key={key}
                    href={`${basePath}/${post.id}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 rounded-2xl border border-white/40 bg-white/55 p-3 transition-transform hover:scale-[1.015] focus-visible:outline-2 focus-visible:outline-[var(--role-accent)] dark:border-white/10 dark:bg-white/5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--role-accent-soft)]">
                      <Icon className="size-5 text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]">
                        {label}
                      </span>
                      <span className="block truncate text-sm font-extrabold">{post.title}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Building2 className="size-3 shrink-0" />
                        <span className="truncate">{post.facility}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block text-sm font-black text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]" dir="ltr">
                        {formatCurrency(post.value)}
                      </span>
                    </span>
                  </Link>
                ) : null
              )
            )}

            <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[10px] font-semibold text-muted-foreground/80">
              <Gift className="size-3" />
              ذكاء تكلي AI يتعلم ملفك باستمرار — نسخة أعمق قادمة قريباً
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
