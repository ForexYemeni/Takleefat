import type { DefaultSession } from 'next-auth'

/**
 * أنواع جلسة NextAuth — تكليفات | Takleefat
 * الجولة 66: إضافة دور الموارد البشرية HR (ميزة «فرصة») — إضافي بحت:
 * القيم الخمسة القائمة تعمل كما هي، وHR يدخل من نفس تسجيل الدخول.
 */
type TakleefatRole = 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR' | 'HR'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      phone: string
      role: TakleefatRole
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
      /** الجولة 60: الصلاحيات المركّبة الممنوحة فوق الدور الأساسي (فارغة غالباً) */
      extraRoles: string[]
      /** الوضع النشط الموثوق للعمل — دائماً ضمن الصلاحيات الفعالة (أساسي + مركّبة) */
      activeRole: TakleefatRole
    } & DefaultSession['user']
  }

  interface User {
    id: string
    name: string
    phone: string
    role: TakleefatRole
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    phone?: string
    role?: TakleefatRole
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  }
}
