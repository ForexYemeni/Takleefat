import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
  textClassName?: string
}

const SIZES = {
  sm: { box: 28, text: 'text-lg' },
  md: { box: 40, text: 'text-2xl' },
  lg: { box: 56, text: 'text-3xl' },
}

/**
 * شعار المنصة الرسمي — تكليفات | Takleefat
 */
export function Logo({ size = 'md', showText = true, className, textClassName }: LogoProps) {
  const s = SIZES[size]

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={s.box}
        height={s.box}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="tkf-logo-g" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#tkf-logo-g)" />
        <rect x="13.5" y="11.5" width="21" height="25" rx="4" stroke="white" strokeWidth="2.4" fill="none" />
        <rect x="19" y="8.2" width="10" height="6.4" rx="2.2" fill="white" stroke="#2563EB" strokeWidth="1.2" />
        <path d="M24 18.6v7.2M20.4 22.2h7.2" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M19.6 30.4l2.9 2.9 5.9-5.9" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={cn('font-extrabold text-foreground', s.text, textClassName)}>
            تكليفات
          </span>
          <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            Takleefat
          </span>
        </div>
      )}
    </div>
  )
}
