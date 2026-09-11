import Link from 'next/link'

/**
 * صفحة 404 — تكليفات | Takleefat
 * تُولَّد ساكنةً وقت البناء ضمن التخطيط الجذري.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-black text-[#2563EB]">404</p>
      <h1 className="text-2xl font-bold text-foreground">الصفحة غير موجودة</h1>
      <p className="max-w-md text-muted-foreground">
        عذراً، الصفحة التي تبحث عنها غير متوفرة أو تم نقلها. يمكنك العودة إلى الصفحة
        الرئيسية لمنصة تكليفات أو تسجيل الدخول للمتابعة.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
        >
          الصفحة الرئيسية
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          تسجيل الدخول
        </Link>
      </div>
    </div>
  )
}
