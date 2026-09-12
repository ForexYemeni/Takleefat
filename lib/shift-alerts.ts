import { db } from '@/lib/db'
import { notify } from '@/lib/notifications'

/**
 * إشعار بداية التكليف — الجولة 44
 * =====================================================
 * يُستدعى بشكل كسول من قراءات التكليفات (نفس نمط escalateDueProgressivePosts
 * — بلا مؤقتات خلفية ولا كرون): كل تكليف مؤكد بلغ وقت بدئه (خلال آخر 12 ساعة)
 * ولم يُشعَر أصحابه بعد — يصل الكادر التمريضي/الطبيب والمستلم الإداري/مشرف
 * الأطباء إشعار «بدأ وقت التكليف» داخلياً وفورياً (Web Push) — مرة واحدة
 * لكل تكليف عبر علم startNotifiedAt (تعليم ذرّي آمن للتكرار).
 *
 * الأوقات كلها بتوقيت مكة المكرمة (UTC+3) كما في كل المنصة.
 */
export async function notifyAssignmentStarts(): Promise<number> {
  try {
    const now = new Date()
    const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000)

    const due = await db.assignment.findMany({
      where: {
        startNotifiedAt: null,
        startDate: { lte: now, gte: windowStart },
        status: { in: ['RECEIVED', 'ACTIVE'] },
      },
      select: {
        id: true,
        title: true,
        facility: true,
        startDate: true,
        nurseId: true,
        receiverId: true,
        nurse: { select: { role: true } },
        receiver: { select: { role: true } },
      },
      take: 20,
      orderBy: { startDate: 'asc' },
    })
    if (due.length === 0) return 0

    for (const a of due) {
      const staffLink = a.nurse.role === 'DOCTOR' ? '/doctor/assignments' : '/nurse/assignments'
      const supportLink = a.receiver.role === 'DOCTOR_SUPERVISOR' ? '/supervisor/assignments' : '/receiver/assignments'
      await Promise.all([
        notify(a.nurseId, {
          title: 'بدأ وقت تكليفك الآن',
          body: `التكليف (${a.title}) في ${a.facility} — بدأ وقته الآن (${new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Riyadh' }).format(a.startDate)} بتوقيت مكة المكرمة). بالتوفيق في مناوبتك!`,
          type: 'ASSIGNMENT_STARTED',
          link: staffLink,
        }),
        notify(a.receiverId, {
          title: 'بدأ وقت التكليف الآن',
          body: `بدأ وقت التكليف (${a.title}) الآن — تابع حضور الكادر وتقدّم المناوبة.`,
          type: 'ASSIGNMENT_STARTED',
          link: supportLink,
        }),
      ])
      // تعليم آمن للتكرار: فقط ما زال بلا علم (idempotent حتى مع تزامن الطلبات)
      await db.assignment.updateMany({
        where: { id: a.id, startNotifiedAt: null },
        data: { startNotifiedAt: new Date() },
      })
    }
    return due.length
  } catch {
    // الإشعارات لا توقف قراءة التكليفات أبداً
    return 0
  }
}
