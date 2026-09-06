import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import path from 'path'

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

/**
 * GET /api/files/[...key]
 * تقديم الملفات المخزنة:
 * 1) /api/files/blob/{id} — صور المستندات المخزنة في قاعدة البيانات
 *    الصلاحيات: الإدارة، أو صاحب المستند، أو المستلم الإداري الذي اعتمد
 *    تقديماً لهذا الكادر (لمراجعة السيرة الذاتية).
 * 2) ملفات محلية (بيئة التطوير فقط).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('غير مصرح', { status: 401 })
  }

  const { key: keyParts } = await params
  const key = keyParts.join('/')

  // ---------- ملفات قاعدة البيانات ----------
  if (keyParts[0] === 'blob' && keyParts[1]) {
    const blobId = keyParts[1]
    const blob = await db.fileBlob.findUnique({ where: { id: blobId } })
    if (!blob) return new NextResponse('الملف غير موجود', { status: 404 })

    const document = await db.document.findFirst({
      where: { fileUrl: { contains: blobId } },
      select: { userId: true },
    })
    const ownerId = document?.userId

    if (session.user.role !== 'ADMIN' && ownerId !== session.user.id) {
      // المستلم الإداري يمكنه عرض مستندات كادر قدّم على تكليفاته (أو اعتُبد تقديمه)
      let allowed = false
      if (session.user.role === 'RECEIVER' && ownerId) {
        const related = await db.application.findFirst({
          where: {
            nurseId: ownerId,
            post: { receiverId: session.user.id },
            status: { in: ['PENDING', 'APPROVED'] },
          },
          select: { id: true },
        })
        allowed = Boolean(related)
      }
      if (!allowed) {
        return new NextResponse('ليست لديك صلاحية للوصول إلى هذا الملف', { status: 403 })
      }
    }

    const bytes = new Uint8Array(blob.data)
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': blob.mimeType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=86400',
      },
    })
  }

  // ---------- ملفات محلية (تطوير فقط) ----------
  if (key.includes('..') || key.startsWith('/')) {
    return new NextResponse('مسار غير صحيح', { status: 400 })
  }

  if (session.user.role !== 'ADMIN') {
    const owns = await db.document.findFirst({
      where: { fileUrl: { contains: key }, OR: [{ userId: session.user.id }, { userId: keyParts[1] }] },
      select: { id: true },
    })
    if (!owns && !key.startsWith(`documents/${session.user.id}`)) {
      return new NextResponse('ليست لديك صلاحية للوصول إلى هذا الملف', { status: 403 })
    }
  }

  const filePath = path.join(process.cwd(), 'db', 'uploads', key)
  try {
    const buffer = await readFile(filePath)
    const ext = key.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME_MAP[ext] ?? 'application/octet-stream'

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('الملف غير موجود', { status: 404 })
  }
}
