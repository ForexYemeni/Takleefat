import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      phone: string
      role: 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR'
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
      /** الجولة 60: الصلاحيات المركّبة الممنوحة فوق الدور الأساسي (فارغة غالباً) */
      extraRoles: string[]
      /** الوضع النشط الموثوق للعمل — دائماً ضمن الصلاحيات الفعالة (أساسي + مركّبة) */
      activeRole: 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR'
    } & DefaultSession['user']
  }

  interface User {
    id: string
    name: string
    phone: string
    role: 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR'
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    phone?: string
    role?: 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR'
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  }
}
