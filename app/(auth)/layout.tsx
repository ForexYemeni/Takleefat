import Link from 'next/link'
import { ShieldCheck, Stethoscope, Hospital } from 'lucide-react'
import { Logo } from '@/components/shared/logo'

/**
 * تخطيط صفحات المصادقة — تكليفات | Takleefat
 * لوحة تعريفية على الشاشات الكبيرة + النموذج
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* لوحة الهوية */}
      <div className="brand-gradient relative hidden flex-col justify-between p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <Logo size="md" textClassName="text-white" />
        </Link>

        <div className="space-y-6">
          <h2 className="text-3xl font-extrabold leading-snug">
            منصة تكليفات لإدارة
            <br />
            التكليفات الطبية والتمريضية
          </h2>
          <div className="space-y-4">
            {[
              { icon: ShieldCheck, text: 'اعتماد إداري لجميع الحسابات والمستندات' },
              { icon: Stethoscope, text: 'إسناد التكليفات للكوادر المؤهلة' },
              { icon: Hospital, text: 'توثيق الاستلام إلكترونياً من الجهة المستقبِلة' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 text-teal-50">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <item.icon className="size-5" />
                </span>
                <p className="text-sm font-medium">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-teal-100/80">
          © {new Date().getFullYear()} تكليفات | Takleefat — جميع الحقوق محفوظة
        </p>
      </div>

      {/* منطقة النموذج */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b p-4 lg:hidden">
          <Link href="/" aria-label="تكليفات | Takleefat">
            <Logo size="sm" />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-lg">{children}</div>
        </div>
      </div>
    </div>
  )
}
