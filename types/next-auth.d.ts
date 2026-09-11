import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      phone: string
      role: 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR'
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
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
