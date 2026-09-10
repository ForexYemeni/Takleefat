import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * حماية المسارات حسب الدور — تكليفات | Takleefat
 * /admin → مدير النظام | /nurse → الكادر التمريضي | /receiver → المستلم الإداري
 */
const ROLE_HOME: Record<string, string> = {
  ADMIN: '/admin',
  NURSE: '/nurse',
  RECEIVER: '/receiver',
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  })

  const role = token?.role as string | undefined

  // منع المستخدم المسجل من الوصول لصفحات الدخول/التسجيل
  if ((pathname === '/login' || pathname === '/register') && token && role) {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/', req.url))
  }

  // صفحة البداية «/»: المستخدم المسجل يدخل لوحته مباشرة
  // (خاصة عند فتح تطبيق PWA المثبّت — بلا صفحات تسويقية أو بيانات وهمية)
  if (pathname === '/' && token && role && ROLE_HOME[role]) {
    return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
  }

  const rules: Array<{ prefix: string; allowedRole: string }> = [
    { prefix: '/admin', allowedRole: 'ADMIN' },
    { prefix: '/nurse', allowedRole: 'NURSE' },
    { prefix: '/receiver', allowedRole: 'RECEIVER' },
  ]

  for (const rule of rules) {
    if (pathname.startsWith(rule.prefix)) {
      if (!token) {
        const loginUrl = new URL('/login', req.url)
        loginUrl.searchParams.set('callbackUrl', pathname)
        return NextResponse.redirect(loginUrl)
      }
      if (role !== rule.allowedRole) {
        return NextResponse.redirect(new URL(ROLE_HOME[role ?? ''] ?? '/', req.url))
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/admin/:path*', '/nurse/:path*', '/receiver/:path*', '/login', '/register'],
}
