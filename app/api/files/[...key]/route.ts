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
 * 1) /api/files/blob/{id} — صور المستندات وصور البروفايل المخزنة في قاعدة البيانات
 *
 *    الجولة 61 — سياسة الخصوصية الجديدة (بطلب صريح من صاحب المنصة):
 *    - صور البروفايل (الأيقونة): عامة — اختار صاحبها ظهورها للجميع
 *      (البطاقة المهنية العامة والتقديمات) وتُقدَّم بكاش عام؛ رابطها فريد
 *      لكل نسخة من الصورة (الاستبدال يُنشئ BLOB جديداً) فلا خطر قدم الكاش.
 *    - مستندات الكادر: صاحبها والإدارة دائماً، وأي جهة أخرى حصراً بمنح
 *      إداري صريح قائم (DocumentAccessRequest بحالة APPROVED بعد طلب
 *      رسمي بسبب معلن) — أُلغي المنح التلقائي «صاحب تكليف قَدَّم المتقدم
 *      عليه» الذي كان سائداً في الجولات 45-46-60. السحب الإداري فوري.
 *
 * 2) ملفات محلية (بيئة التطوير فقط) — بنفس صلاحياتها السابقة دون تغيير.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: keyParts } = await params
  const key = keyParts.join('/')

  // ---------- ملفات قاعدة البيانات ----------
  if (keyParts[0] === 'blob' && keyParts[1]) {
    const blobId = keyParts[1]
    const blob = await db.fileBlob.findUnique({ where: { id: blobId } })
    if (!blob) return new NextResponse('الملف غير موجود', { status: 404 })

    const bytes = new Uint8Array(blob.data)

    // ---------- صور البروفايل: عامة (الجولة 61) — قبل أي فحص جلسة ----------
    // البطاقة المهنية العامة /n/[id] تُعرض لزوار غير مسجلين، وصاحب الصورة
    // هو من اختار ظهورها للجميع أصلاً — لذا تُقدَّم بلا جلسة وبكاش عام.
    const avatarOwner = await db.user.findFirst({
      where: { profilePhotoBlobId: blobId },
      select: { id: true },
    })
    if (avatarOwner) {
      return new NextResponse(bytes, {
        headers: {
          'Content-Type': blob.mimeType,
          'Content-Length': String(bytes.length),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // ---------- بقية الملفات تتطلب جلسة صالحة (كما كان) ----------
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('غير مصرح', { status: 401 })
    }

    const document = await db.document.findFirst({
      where: { fileUrl: { contains: blobId } },
      select: { userId: true },
    })
    const ownerId = document?.userId

    if (session.user.role !== 'ADMIN' && ownerId !== session.user.id) {
      // الجولة 61 — بدل المنح التلقائي لصاحب التكليف المُعلن (الجولات 45-46-60):
      // محتوى مستندات الكادر يُفتح لغير صاحبها حصراً بمنح إداري صريح قائم
      // (طلب رؤية بسبب معلن أقرّته الإدارة — والسحب الإداري يسري فوراً
      // لأن المنح يُقرأ من قاعدة البيانات في كل طلب بلا أي تخزين مؤقت).
      const granted = ownerId
        ? await db.documentAccessRequest.findFirst({
            where: {
              requesterId: session.user.id,
              targetId: ownerId,
              status: 'APPROVED',
            },
            select: { id: true },
          })
        : null
      if (!granted) {
        return new NextResponse('ليست لديك صلاحية للوصول إلى هذا الملف', { status: 403 })
      }
    }

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': blob.mimeType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=86400',
      },
    })
  }

  // ---------- ملفات محلية (تطوير فقط) — كما كان تماماً ----------
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('غير مصرح', { status: 401 })
  }

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
