import { PrismaClient } from '@prisma/client'

/**
 * توافق مع قواعد بيانات Vercel (Marketplace / Neon):
 * بعض التكاملات تضبط POSTGRES_PRISMA_URL أو POSTGRES_URL بدل DATABASE_URL —
 * نستخدمها كخيار احتياطي قبل تهيئة عميل Prisma حتى لا يتعطل الاتصال.
 */
if (!process.env.DATABASE_URL?.trim()) {
  const fallback =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL
  if (fallback) process.env.DATABASE_URL = fallback
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
