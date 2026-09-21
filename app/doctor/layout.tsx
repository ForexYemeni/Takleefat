import { DashboardShell } from '@/components/shared/dashboard-shell'
import { requirePanelAccess } from '@/lib/panel-access'
import { PaymentGate } from '@/components/forsah/payment-gate'

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanelAccess('DOCTOR')

  return (
    <DashboardShell role="DOCTOR" userName={session.user.name}>
      {children}
      {/* الجولة 71 — بوابة سداد رسوم «فرصة» الإلزامية: لا تظهر إلا عند تفعيلها
          (توقيت مختار + رسوم غير مسددة) وتُغلق حصراً برفع الإثبات وتأكيد الإدارة */}
      <PaymentGate />
    </DashboardShell>
  )
}
