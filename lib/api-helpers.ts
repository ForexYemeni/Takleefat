import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import type { Session } from 'next-auth'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/**
 * يُرجع جلسة المستخدم الحالية أو يرمي خطأ 401
 */
export async function requireSession(): Promise<Session> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new ApiError('يجب تسجيل الدخول للمتابعة', 401)
  }
  return session
}

/**
 * يتطلب صلاحية دور محدد (أو أكثر)
 */
export async function requireRole(...roles: Array<'ADMIN' | 'NURSE' | 'RECEIVER'>) {
  const session = await requireSession()
  if (!roles.includes(session.user.role)) {
    throw new ApiError('ليست لديك صلاحية للوصول إلى هذا المورد', 403)
  }
  return session
}

/**
 * معالجة موحدة لأخطاء API Routes
 */
export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع في النظام'
  return NextResponse.json({ error: message }, { status: 500 })
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
