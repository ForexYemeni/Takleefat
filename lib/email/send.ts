import { randomUUID, randomInt } from 'crypto'
import { db } from '@/lib/db'
import { after } from 'next/server'
import {
  emailCategoryOf,
  isCategoryEnabled,
  parseEmailPreferences,
  absoluteAppLink,
  resolveAppUrl,
  type EmailNotificationType,
  type EmailPreferences,
} from '@/lib/email/config'
import { sendViaGas, isEmailServiceConfigured } from '@/lib/email/gas-client'

/**
 * مُرسِل البريد المركزي — الجولة 51
 * =====================================================
 * نقطة واحدة لكل إرسال بريد في التطبيق (منع التشتت):
 * 1) queueEmail() — الطبقة السفلية: تسجيل المحاولة (email_logs) + الإرسال + تحديث النتيجة
 *    مع منع تكرار نهائي عبر مفتاح idempotencyKey الفريد في القاعدة.
 * 2) deliverEmailForNotification() — التكامل مع notify(): أي إشعار داخلي في التطبيق
 *    يولّد بريداً تلقائياً للمستلم المؤكد بلا أي منطق موزّع في مسارات الـ API.
 * 3) إشعارات الأمان المباشرة (رمز التحقق/تغيير كلمة المرور) — مقفلة لا تُعطَّل.
 *
 * القاعدة الذهبية: البريد قناة إضافية — فشله أو بطؤه لا يعطل أبداً العملية الأساسية،
 * وكل النتائج (نجاح/فشل) مسجلة للإدارة مع إمكانية إعادة الإرسال.
 */

/** بيانات بطاقة البريد المهيأة للعرض — تُترجم داخل قالب Google Apps Script الموحد */
export interface EmailCardData {
  /** عنوان الرسالة في سطر الموضوع — يُضاف إليه «| تكليفات» تلقائياً إن لم يوجد */
  subject: string
  /** عنوان البطاقة مع الأيقونة — مثال: «🩺 تكليف جديد» */
  title: string
  /** سطر الترحيب باسم المستلم — يُبنى تلقائياً إن تُرك فارغاً */
  greeting?: string
  /** فقرات نصية تحت العنوان */
  lines?: string[]
  /** بطاقات المعلومات — مثال: {label:'القسم', value:'الطوارئ'} */
  rows?: Array<{ label: string; value: string }>
  /** زر الإجراء الرئيس */
  cta?: { text: string; url: string }
  /** ملاحظة ختامية إضافية قبل التذييل */
  note?: string
}

interface QueueEmailParams extends EmailCardData {
  type: EmailNotificationType
  to: string
  recipientUserId?: string | null
  relatedEntityId?: string | null
  idempotencyKey: string
}

export interface QueueEmailResult {
  /** تم إنشاء سجل إرسال ومحاولة الإرسال (أو جدولتها) */
  queued: boolean
  /** سبب عدم الإرسال — للسجل الداخلي فقط */
  reason?: 'duplicate' | 'not-configured'
  logId?: string
}

/**
 * الطبقة السفلية: سجّل ثم أرسل ثم حدّث النتيجة — بلا أي استثناءات صاعدة.
 * التكرار يُمنع على مستوى القاعدة (idempotencyKey @unique).
 */
export async function queueEmail(params: QueueEmailParams): Promise<QueueEmailResult> {
  const subject = params.subject.includes('تكليفات')
    ? params.subject
    : `${params.subject} | تكليفات`

  const payload = {
    type: params.type,
    to: params.to,
    subject,
    title: params.title,
    greeting: params.greeting,
    lines: params.lines ?? [],
    rows: params.rows ?? [],
    cta: params.cta ?? null,
    note: params.note,
    // الجولة 69 (البند 6): أساس التطبيق لقالب الهوية الموحد — شعار المنصة في رأس كل رسالة
    appUrl: resolveAppUrl() ?? '',
  }
  const payloadJson = JSON.stringify(payload)

  let logId: string
  try {
    const created = await db.emailLog.create({
      data: {
        recipientUserId: params.recipientUserId ?? null,
        recipientEmail: params.to,
        notificationType: params.type,
        subject,
        status: 'pending',
        relatedEntityId: params.relatedEntityId ?? null,
        idempotencyKey: params.idempotencyKey,
        payloadJson,
      },
      select: { id: true },
    })
    logId = created.id
  } catch (e) {
    // P2002 = مفتاح تكرار — الإشعار أُرسل/جُدول سابقاً (إعادة تحميل/نقر مزدوج/webhook مكرر)
    if ((e as { code?: string }).code === 'P2002') {
      return { queued: false, reason: 'duplicate' }
    }
    console.error('email: failed to create log row:', e)
    return { queued: false }
  }

  // الإرسال الفعلي — فشله يُسجل في الصف ولا يصعد أبداً كمَيْن استثناء
  const result = await sendViaGas(payload)

  if (result.ok) {
    await db.emailLog
      .update({ where: { id: logId }, data: { status: 'sent', sentAt: new Date() } })
      .catch(() => undefined)
  } else {
    await db.emailLog
      .update({
        where: { id: logId },
        data: { status: 'failed', errorMessage: result.error ?? 'فشل غير معروف' },
      })
      .catch(() => undefined)
  }

  return { queued: true, logId }
}

/** بوابات الإرسال الموحدة لكل مستخدم — تُقرأ مرة واحدة */
async function userEmailGate(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      emailNotificationEnabled: true,
      emailPreferences: true,
    },
  })
  // التضييق النوعي: بريد موجود + مؤكد حصراً
  const email = user?.email
  if (!user || !email || !user.emailVerified) return null
  return {
    name: user.name,
    email,
    masterEnabled: user.emailNotificationEnabled,
    prefs: parseEmailPreferences(user.emailPreferences),
  }
}

/**
 * التكامل المركزي مع notify() — يُستدعى لكل إشعار داخلي تلقائياً.
 * القواعد: بريد مؤكد + المفتاح الرئيس مفعّل + قسم الإشعار مفعّل لدى المستخدم.
 * قسم الأمان من إشعارات التطبيق لا يمر من هنا (له مساره المباشر المقفول).
 */
export async function deliverEmailForNotification(
  userId: string,
  input: { title: string; body?: string; type?: string; link?: string },
  notificationId: string,
  card?: Partial<EmailCardData>
): Promise<void> {
  try {
    const gate = await userEmailGate(userId)
    if (!gate) return

    const type = (input.type ?? 'GENERIC') as EmailNotificationType
    const category = emailCategoryOf(type)
    const serviceEnabled = (await db.setting.findUnique({ where: { key: 'emailServiceEnabled' } }))?.value !== '0'
    if (!isCategoryEnabled(category, gate.prefs, gate.masterEnabled)) {
      return
    }
    if (!serviceEnabled) return

    if (!isEmailServiceConfigured()) {
      // الخدمة غير مهيأة: تسجيل صامت للسيرفر فقط — لا صفوف إرسال فاشل بحجم الإشعارات اليومي
      return
    }

    await queueEmail({
      type,
      to: gate.email,
      recipientUserId: userId,
      relatedEntityId: notificationId,
      idempotencyKey: `ntf:${notificationId}`,
      subject: card?.subject ?? input.title,
      title: card?.title ?? input.title,
      greeting: card?.greeting ?? `مرحباً ${gate.name}`,
      lines: card?.lines ?? (input.body ? [input.body] : []),
      rows: card?.rows,
      cta: card?.cta ?? (absoluteAppLink(input.link)
        ? { text: 'عرض التفاصيل', url: absoluteAppLink(input.link)! }
        : undefined),
    })
  } catch (e) {
    console.error('email: deliverEmailForNotification failed:', e)
  }
}

/**
 * إرسال رمز تحقق جديد إلى بريد المستخدم — قسم أمان مقفول:
 * لا يتأثر بالمفتاح الرئيس ولا بتaucultيمات الأقسام، ويُسجَّل فشله للإدارة.
 * يُرجع رمز الـ 6 أرقام للمُنتدِب الداخلي حصراً (يُحفظ ثم يُمسح من الحالة).
 */
export async function sendEmailVerificationCode(
  userId: string,
  email: string,
  name: string
): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  await db.user.update({
    where: { id: userId },
    data: {
      emailVerificationCode: code,
      emailVerificationExpires: expiresAt,
      emailVerificationSentAt: new Date(),
    },
  })

  await queueEmail({
    type: 'EMAIL_VERIFICATION',
    to: email,
    recipientUserId: userId,
    relatedEntityId: userId,
    idempotencyKey: `evf:${userId}:${code}`,
    subject: 'رمز تأكيد البريد الإلكتروني',
    title: '🔐 تأكيد البريد الإلكتروني',
    greeting: `مرحباً ${name}`,
    lines: [
      'استخدم رمز التحقق التالي لتأكيد بريدك الإلكتروني في منصة تكليفات:',
    ],
    rows: [
      { label: 'رمز التحقق', value: code },
      { label: 'صالح حتى', value: expiresAt.toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }) },
    ],
    note: 'إذا لم تطلب هذا الرمز يمكنك تجاهل الرسالة بأمان — لن يصل أي إشعار لبريدك دون تأكيدك.',
  })
  return { code, expiresAt }
}

/**
 * إشعار أمان مباشر (مقفول لا يُعطَّل) — مثال: تغيير كلمة المرور، تغيير البريد.
 */
export async function sendSecurityAlert(
  userId: string,
  card: { title: string; lines: string[]; subject?: string }
): Promise<void> {
  const gate = await userEmailGate(userId)
  if (!gate) return
  await queueEmail({
    type: 'ACCOUNT_SECURITY',
    to: gate.email,
    recipientUserId: userId,
    relatedEntityId: userId,
    idempotencyKey: `sec:${userId}:${randomUUID()}`,
    subject: card.subject ?? card.title,
    title: card.title,
    greeting: `مرحباً ${gate.name}`,
    lines: card.lines,
    note: 'أمان حسابك أولوية — هذه الرسالة تُرسل دائماً ولا يمكن تعطيلها من الإعدادات.',
  })
}

/**
 * جدولة تسليم بريد إشعار عبر after() — على مسار الطلب لا يؤخر الاستجابة إطلاقاً،
 * وخارجه (سكربتات/مهام) ينتظر مباشرة — بنفس نمط الإشعارات الفورية.
 */
export function scheduleEmailDelivery(
  userId: string,
  input: { title: string; body?: string; type?: string; link?: string },
  notificationId: string,
  card?: Partial<EmailCardData>
): void {
  const task = deliverEmailForNotification(userId, input, notificationId, card)
  try {
    after(task)
  } catch {
    task.catch(() => undefined)
  }
}

/** تفضيلات مرتّبة للإرجاع في الواجهة */
export function safePreferences(raw: string | null | undefined): EmailPreferences {
  return parseEmailPreferences(raw)
}
