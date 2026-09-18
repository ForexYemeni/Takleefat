import { cn } from '@/lib/utils'

/**
 * الصورة الرمزية للكادر — الجولة 61 | تكليفات | Takleefat
 * --------------------------------------------------------
 * تعرض صورة البروفايل إن وُجدت (اختيار صاحبها — تُقدَّم عامة من مسار
 * الملفات)، وإلا فالصورة الرمزية بالحرف الأول كما كان تماماً.
 * مكوّن عرض صافٍ بلا حالة — يعمل في مكوّنات الخادم والعميل معاً.
 */
export function StaffAvatar({
  name,
  photoUrl,
  className,
  fallbackClassName,
}: {
  name: string
  photoUrl?: string | null
  className?: string
  fallbackClassName?: string
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={`صورة ${name}`}
        loading="lazy"
        className={cn('shrink-0 object-cover shadow-sm', className)}
      />
    )
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center font-extrabold', className, fallbackClassName)}>
      {name.slice(0, 1)}
    </span>
  )
}
