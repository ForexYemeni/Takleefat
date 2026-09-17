import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { db } from '@/lib/db'
import { loginSchema } from '@/lib/validations/auth'

/**
 * يضمن جاهزية حساب المدير المحدد في متغيرات البيئة.
 * - إن لم يوجد الحساب → يُنشأ
 * - إن وُجد بدور أو حالة مختلفة → يُرقّى لمدير معتمد
 * - كلمة المرور تُزامَن دائماً مع ADMIN_PASSWORD (حساب إنقاذ دائم)
 */
export async function ensureAdmin() {
  const adminPhone = process.env.ADMIN_PHONE
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPhone || !adminPassword) return

  const bcrypt = await import('bcryptjs')
  const hashed = await bcrypt.hash(adminPassword, 12)

  await db.user.upsert({
    where: { phone: adminPhone },
    update: { role: 'ADMIN', status: 'APPROVED', password: hashed },
    create: {
      name: 'مدير النظام',
      phone: adminPhone,
      password: hashed,
      role: 'ADMIN',
      status: 'APPROVED',
    },
  })
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24, // 24 ساعة
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      name: 'تسجيل الدخول',
      credentials: {
        phone: { label: 'رقم الهاتف', type: 'tel' },
        password: { label: 'كلمة المرور', type: 'password' },
      },
      async authorize(credentials) {
        await ensureAdmin()

        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { phone, password } = parsed.data

        const user = await db.user.findUnique({ where: { phone } })
        if (!user) return null

        const valid = await compare(password, user.password)
        if (!valid) return null

        // سياسة الدخول:
        // - الكادر والمستلم الإداري يدخلان فور التسجيل حتى لو كان الحساب PENDING
        //   (الكادر يرفع مستنداته والمستلم يتابع حالة اعتماده — دون صلاحيات كاملة)
        // - REJECTED (مرفوض) و SUSPENDED (موقوف) لا يمكنهما الدخول إطلاقاً
        if (user.status === 'REJECTED' || user.status === 'SUSPENDED') return null

        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          status: user.status,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR' }).role
        token.status = (
          user as { status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' }
        ).status
        token.phone = (user as { phone: string }).phone
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        // جلب أحدث حالة للمستخدم من قاعدة البيانات (اعتماد الحساب / تغيير الدور /
        // منح أو سحب الصلاحيات المركّبة — الجولة 60) — كل شيء يسري فوراً دون إعادة دخول
        // خطأ اتصال عابر → null آمن، أما الحساب المحذوف → fresh=null فعلاً
        const fresh = await db.user
          .findUnique({
            where: { id: token.id as string },
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
              status: true,
              extraRoles: true,
              activeRole: true,
            },
          })
          .catch(() => null)

        if (fresh) {
          session.user.id = fresh.id
          session.user.name = fresh.name
          session.user.phone = fresh.phone
          session.user.role = fresh.role
          session.user.status = fresh.status

          // ---------- الجولة 60: الصلاحيات المركّبة ----------
          // extraRoles منقّاة (أدوار لوحات معروفة فقط — الإدارة مستثناة) وتُستثنى
          // القيمة المطابقة للدور الأساسي. activeRole موثوق: إن خرج عن الصلاحيات
          // الفعالة (مثال: سُحبت صلاحيته وهو داخلها) يرجع للدور الأساسي فوراً.
          const { effectiveRoles, operatingRole } = await import('@/lib/roles')
          const profile = {
            role: fresh.role as string,
            extraRoles: Array.isArray(fresh.extraRoles) ? fresh.extraRoles : [],
            activeRole: fresh.activeRole,
          }
          const effective = effectiveRoles(profile)
          session.user.extraRoles = effective.filter((r) => r !== profile.role)
          session.user.activeRole = operatingRole(profile)
        } else {
          // الحساب حُذف من القاعدة — جلسة غير صالحة (تُرفض 401 في كل المسارات)
          session.user.id = ''
          session.user.name = (token.name as string) ?? ''
          session.user.role = undefined as unknown as 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR'
        }
      }
      return session
    },
  },
}
