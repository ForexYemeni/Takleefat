import { DashboardShell } from '@/components/shared/dashboard-shell'
import { requirePanelAccess } from '@/lib/panel-access'
import { db } from '@/lib/db'

/**
 * لوحة الموارد البشرية — الجولة 66 | ميزة «فرصة»
 * الحارس: requirePanelAccess('HR') — يمنع أي دور آخر من الدخول حتى بتغيير
 * الرابط يدوياً، ويثبّت الوضع النشط (نفس نمط بقية اللوحات حرفياً).
 *
 * الجولة 81 — إذن مراجعة طلبات تعديل الملفات المهنية (إضافي بحت): يُقرأ من
 * القاعدة في كل تحميل للوحة ويُمرَّر لقائمة التنقل — عند السحب تختفي
 * «طلبات تعديل الملفات» من قائمة الحساب فوراً.
 */
export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanelAccess('HR')

  const hr = await db.user.findUnique({
    where: { id: session.user.id },
    select: { profileEditReviewAccess: true },
  })

  return (
    <DashboardShell
      role="HR"
      userName={session.user.name}
      profileEditAccess={hr?.profileEditReviewAccess ?? false}
    >
      {children}
    </DashboardShell>
  )
}
