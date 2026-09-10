import { db } from '@/lib/db'

/**
 * قنوات التواصل مع إدارة المنصة — تكليفات | Takleefat
 *
 * تُخزَّن في جدول settings (مفتاح/قيمة) — نفس مخزن إعدادات المنصة:
 *   - contactWhatsapp / contactPhone / contactSms / contactEmail  → قيم القنوات
 *   - contactWhatsappEnabled / contactPhoneEnabled / ...          → تشغيل/إيقاف كل قناة
 *
 * الأيقونة العائمة أسفل يسار الشاشة تعرض فقط القنوات المُفعّلة التي تحتوي بيانات،
 * وإذا لم تُضبط أي قناة لا تظهر الأيقونة إطلاقاً.
 */

export const CONTACT_CHANNEL_KEYS = ['whatsapp', 'phone', 'sms', 'email'] as const
export type ContactChannelKey = (typeof CONTACT_CHANNEL_KEYS)[number]

/** القنوات النشطة فقط — قيمة كل قناة موجودة يعني «مُفعّلة ولها بيانات» */
export type ActiveContactChannels = Partial<Record<ContactChannelKey, string>>

const VALUE_KEYS: Record<ContactChannelKey, string> = {
  whatsapp: 'contactWhatsapp',
  phone: 'contactPhone',
  sms: 'contactSms',
  email: 'contactEmail',
}

const ENABLED_KEYS: Record<ContactChannelKey, string> = {
  whatsapp: 'contactWhatsappEnabled',
  phone: 'contactPhoneEnabled',
  sms: 'contactSmsEnabled',
  email: 'contactEmailEnabled',
}

export interface ContactSettings {
  whatsapp: string
  whatsappEnabled: boolean
  phone: string
  phoneEnabled: boolean
  sms: string
  smsEnabled: boolean
  email: string
  emailEnabled: boolean
}

const CONTACT_SETTINGS_KEYS = [
  ...Object.values(VALUE_KEYS),
  ...Object.values(ENABLED_KEYS),
]

/** قراءة إعدادات التواصل الكاملة (للإدارة) — تشمل القنوات غير المُفعّلة والفارغة */
export async function getContactSettings(): Promise<ContactSettings> {
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: CONTACT_SETTINGS_KEYS } },
    })
    const map = new Map(rows.map((r) => [r.key, r.value]))

    const value = (key: ContactChannelKey) => map.get(VALUE_KEYS[key])?.trim() ?? ''
    const enabled = (key: ContactChannelKey) => map.get(ENABLED_KEYS[key]) === 'true'

    return {
      whatsapp: value('whatsapp'),
      whatsappEnabled: enabled('whatsapp'),
      phone: value('phone'),
      phoneEnabled: enabled('phone'),
      sms: value('sms'),
      smsEnabled: enabled('sms'),
      email: value('email'),
      emailEnabled: enabled('email'),
    }
  } catch {
    // في حال عدم توفر الجداول بعد — قنوات فارغة (الأيقونة العائمة تختفي)
    return {
      whatsapp: '',
      whatsappEnabled: false,
      phone: '',
      phoneEnabled: false,
      sms: '',
      smsEnabled: false,
      email: '',
      emailEnabled: false,
    }
  }
}

/** القنوات النشطة فقط (مُفعّلة + لها بيانات) — تُنشر للأيقونة العائمة */
export async function getActiveContactChannels(): Promise<ActiveContactChannels> {
  const settings = await getContactSettings()
  const channels: ActiveContactChannels = {}
  if (settings.whatsappEnabled && settings.whatsapp) channels.whatsapp = settings.whatsapp
  if (settings.phoneEnabled && settings.phone) channels.phone = settings.phone
  if (settings.smsEnabled && settings.sms) channels.sms = settings.sms
  if (settings.emailEnabled && settings.email) channels.email = settings.email
  return channels
}

/** حفظ قناة واحدة (قيمة + حالة التشغيل) */
export async function setContactChannel(
  key: ContactChannelKey,
  value: string,
  enabled: boolean
): Promise<void> {
  const { setSetting } = await import('@/lib/settings')
  await Promise.all([
    setSetting(VALUE_KEYS[key], value.trim()),
    setSetting(ENABLED_KEYS[key], enabled ? 'true' : 'false'),
  ])
}
