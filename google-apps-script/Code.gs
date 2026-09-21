/**
 * ============================================================
 * تكليفات | Takleefat — خدمة البريد الإلكتروني المركزية
 * Google Apps Script + Gmail — Web App واحد لكل إشعارات المنصة
 * الجولة 51
 * ============================================================
 *
 * المنطق:
 *   تطبيق تكليفات (Next.js)
 *      ↓  POST { secret, type, to, subject, title, ... }
 *   هذا السكربت (Web App واحد)
 *      ↓  تحقق السر → اختيار الحزمة اللونية → بناء بطاقة HTML RTL
 *   Gmail (MailApp)
 *      ↓
 *   المستخدم
 *
 * التركيب (ملخص — التفاصيل في README):
 *   1) أنشئ مشروعاً جديداً على script.google.com والصق هذا الملف كاملاً
 *   2) ضع رمز سرّ قوي في APP_SECRET أدناه — نفس قيمة GOOGLE_APPS_SCRIPT_SECRET في التطبيق
 *   3) انشر المشروع: Deploy → New deployment → Web app
 *      - Execute as: Me (حسابك)
 *      - Who has access: Anyone  ← ضروري ليعمل الاستدعاء من الخادم
 *   4) انسخ رابط النشر /exec وضعه في متغير البيئة GOOGLE_APPS_SCRIPT_URL
 *
 * الأمان:
 *   - كل طلب بلا السر الصحيح يُرفض فوراً (مقارنة ثابتة الزمن)
 *   - الرسائل من اسم المنصة حصراً — لا يمكن للخارج إرسال محتوى عشوائي بلا السر
 *   - الحقول النصية تُنظَّف قبل إدراجها في HTML (منع حقن الأكواد)
 *
 * الحدود المجانية:
 *   حساب Gmail العادي: ~100 رسالة/يوم عبر MailApp — حساب Google Workspace أعلى.
 *   عند بلوغ الحد يُرجع السكربت ok:false مع رسالة واضحة، والتطبيق يسجلها
 *   في سجل الإرسال للإدارة دون تعطيل أي عملية أساسية.
 */

// ---------- الإعدادات ----------

/** سر التحقق — يجب أن يطابق GOOGLE_APPS_SCRIPT_SECRET في متغيرات بيئة التطبيق حرفياً */
var APP_SECRET = 'ضع-السر-القوي-هنا';

/** اسم المنصة والشعار النصي في رأس كل رسالة */
var BRAND_NAME = 'تكليفات';
var BRAND_LATIN = 'TAKLEEFAT';
var BRAND_TAGLINE = 'منصة تنظيم وإدارة التكليفات الطبية والتمريضية';
var SUPPORT_FOOTER = 'هذه رسالة آلية من منصة ' + BRAND_NAME + ' — لا تردّ عليها مباشرة.';

/** الحد الأقصى المقبول لحجم الحمولة (حماية من الطلبات الضخمة) */
var MAX_PAYLOAD_LENGTH = 20000;

// ---------- الحزم اللونية حسب نوع الإشعار ----------
// إضافة نوع جديد مستقبلاً = إضافة سطر واحد هنا فقط (القالب موحد للجميع)

var TYPE_STYLES = {
  // أقسام الأمان — أزرق داكن
  EMAIL_VERIFICATION:   { color: '#0E7490', tint: '#E0F2F7', icon: '🔐' },
  ACCOUNT_SECURITY:     { color: '#0E7490', tint: '#E0F2F7', icon: '🛡️' },
  // الحساب
  ACCOUNT_APPROVED:     { color: '#059669', tint: '#E7F6EF', icon: '✅' },
  ACCOUNT_REJECTED:     { color: '#DC2626', tint: '#FDECEC', icon: '⚠️' },
  // التكليفات والطلبات
  POST_CREATED:         { color: '#0D9488', tint: '#E6F5F3', icon: '🩺' },
  ASSIGNMENT_CREATED:   { color: '#0D9488', tint: '#E6F5F3', icon: '📋' },
  ASSIGNMENT_RECEIVED:  { color: '#0D9488', tint: '#E6F5F3', icon: '📥' },
  ASSIGNMENT_STARTED:   { color: '#0D9488', tint: '#E6F5F3', icon: '▶️' },
  ASSIGNMENT_COMPLETED: { color: '#059669', tint: '#E7F6EF', icon: '🏁' },
  ASSIGNMENT_CANCELLED: { color: '#DC2626', tint: '#FDECEC', icon: '🚫' },
  APPLICATION_SUBMITTED:{ color: '#7C3AED', tint: '#F1EAFD', icon: '📨' },
  APPLICATION_APPROVED: { color: '#059669', tint: '#E7F6EF', icon: '✅' },
  APPLICATION_REJECTED: { color: '#DC2626', tint: '#FDECEC', icon: '❌' },
  INVITATION_RECEIVED:  { color: '#7C3AED', tint: '#F1EAFD', icon: '📩' },
  INVITATION_ACCEPTED:  { color: '#059669', tint: '#E7F6EF', icon: '🤝' },
  INVITATION_DECLINED:  { color: '#DC2626', tint: '#FDECEC', icon: '↩️' },
  INVITATION_EXPIRED:   { color: '#B45309', tint: '#FCF3E3', icon: '⌛' },
  // المستندات
  DOCUMENT_UPLOADED:    { color: '#B45309', tint: '#FCF3E3', icon: '📎' },
  DOCUMENT_REVIEWED:    { color: '#0E7490', tint: '#E0F2F7', icon: '🗂️' },
  // الإدارية والعامة
  AFFILIATION_UPDATED:  { color: '#7C3AED', tint: '#F1EAFD', icon: '🏥' },
  FAVORITE_ADDED:       { color: '#B45309', tint: '#FCF3E3', icon: '⭐' },
  ADMIN_ALERT:          { color: '#334155', tint: '#EEF2F7', icon: '🔔' },
  IMPORTANT_ALERT:      { color: '#DC2626', tint: '#FDECEC', icon: '🚨' },
  SYSTEM_NOTIFICATION:  { color: '#334155', tint: '#EEF2F7', icon: '⚙️' },
  GENERIC:              { color: '#0E7490', tint: '#E0F2F7', icon: '🔔' },
  TEST:                 { color: '#059669', tint: '#E7F6EF', icon: '✅' },
  // الجولة 69 (البند 6): أنواع نظام «فرصة | Forsah» — كانت تسقط للحزمة الافتراضية
  OPPORTUNITY_PUBLISHED:            { color: '#0D9488', tint: '#E6F5F3', icon: '📣' },
  OPPORTUNITY_APPLICATION_RECEIVED: { color: '#7C3AED', tint: '#F1EAFD', icon: '📨' },
  OPPORTUNITY_APPLICATION_REVIEWED: { color: '#0E7490', tint: '#E0F2F7', icon: '🔍' },
  OPPORTUNITY_INTERVIEW_INVITED:    { color: '#B45309', tint: '#FCF3E3', icon: '📅' },
  OPPORTUNITY_INTERVIEW_CONFIRMED:  { color: '#059669', tint: '#E7F6EF', icon: '✅' },
  OPPORTUNITY_INTERVIEW_DECLINED:   { color: '#DC2626', tint: '#FDECEC', icon: '↩️' },
  OPPORTUNITY_CANDIDATE_SELECTED:   { color: '#059669', tint: '#E7F6EF', icon: '🎯' },
  OPPORTUNITY_PAYMENT_PENDING:      { color: '#B45309', tint: '#FCF3E3', icon: '💳' },
  OPPORTUNITY_PAYMENT_COMPLETED:    { color: '#059669', tint: '#E7F6EF', icon: '💰' },
  OPPORTUNITY_PAYMENT_TIMING_SELECTED: { color: '#B45309', tint: '#FCF3E3', icon: '🕐' },
  OPPORTUNITY_PAYMENT_PROOF_SUBMITTED: { color: '#B45309', tint: '#FCF3E3', icon: '🧾' },
  OPPORTUNITY_PAYMENT_CONFIRMED:    { color: '#059669', tint: '#E7F6EF', icon: '✅' },
  OPPORTUNITY_PAYMENT_PROOF_REJECTED: { color: '#DC2626', tint: '#FDECEC', icon: '↩️' },
  OPPORTUNITY_CLOSED:               { color: '#334155', tint: '#EEF2F7', icon: '🔒' }
};

/** الحزمة الافتراضية لأي نوع غير معروف — التوسع مستقبلاً بلا تعديل القالب */
var DEFAULT_STYLE = { color: '#0E7490', tint: '#E0F2F7', icon: '🔔' };

// ---------- نقاط الدخول ----------

/**
 * فحص الجاهزية — GET بلا معاملات يرجع حالة الخدمة
 * (يمكن استخدامه يدوياً من المتصفح للتأكد أن النشر يعمل)
 */
function doGet() {
  return respond_({ ok: true, service: 'takleefat-mailer', brand: BRAND_NAME });
}

/**
 * نقطة الإرسال الوحيدة — POST بجسم JSON:
 * {
 *   secret: '...',            مطلوب — يجب أن يطابق APP_SECRET
 *   type: 'POST_CREATED',     مطلوب — مفتاح الحزمة اللونية
 *   to: 'user@gmail.com',     مطلوب — بريد المستلم
 *   subject: '...',           مطلوب — موضوع الرسالة
 *   title: '🩺 تكليف جديد',   عنوان البطاقة
 *   greeting: 'مرحباً فلان',  سطر الترحيب
 *   lines: ['...'],           فقرات
 *   rows: [{label, value}],   بطاقات المعلومات
 *   cta: {text, url},         زر الإجراء (اختياري)
 *   note: '...'               ملاحظة ختامية (اختياري)
 * }
 */
function doPost(e) {
  try {
    // 1) قراءة الحمولة بأمان
    var body = parseBody_(e);
    if (!body.ok) return respond_({ ok: false, error: body.error });

    var data = body.data;

    // 2) التحقق من السر — رفض فوري بلا تفاصيل
    if (!verifySecret_(data.secret)) {
      return respond_({ ok: false, error: 'طلب غير مصرح به' });
    }

    // 3) التحقق من الحقول الإلزامية
    var check = validate_(data);
    if (!check.ok) return respond_({ ok: false, error: check.error });

    // 4) بناء البطاقة والقالب الموحد
    var html = baseEmailTemplate_(data);

    // 5) الإرسال عبر Gmail مع معالجة حدود الاستخدام
    try {
      MailApp.sendEmail({
        to: data.to,
        subject: String(data.subject),
        htmlBody: html,
        name: BRAND_NAME
      });
    } catch (mailErr) {
      return respond_({ ok: false, error: quotaMessage_(mailErr) });
    }

    return respond_({ ok: true, sentTo: data.to });
  } catch (err) {
    return respond_({ ok: false, error: 'خطأ غير متوقع في خدمة البريد' });
  }
}

// ---------- التحقق والتنظيف ----------

/** قراءة جسم الطلب JSON بأمان وبحد حجم */
function parseBody_(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    if (!raw) return { ok: false, error: 'لا توجد حمولة' };
    if (raw.length > MAX_PAYLOAD_LENGTH) return { ok: false, error: 'الحمولة كبيرة جداً' };
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: 'حمولة غير صالحة' };
  }
}

/** مقارنة ثابتة الزمن للسر — لا كشف بالتوقيت */
function verifySecret_(provided) {
  if (!provided || typeof provided !== 'string') return false;
  var a = provided;
  var b = APP_SECRET;
  if (a.length !== b.length) {
    // مقارنة رمزية للحفاظ على الزمن الثابت تقريباً
    a = b;
  }
  var diff = 0;
  for (var i = 0; i < b.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return provided.length === APP_SECRET.length && diff === 0;
}

/** فحص الحقول الإلزامية قبل البناء */
function validate_(data) {
  if (!data.to || !isEmail_(String(data.to))) return { ok: false, error: 'بريد المستلم غير صالح' };
  if (!data.subject || !String(data.subject).trim()) return { ok: false, error: 'موضوع الرسالة مفقود' };
  return { ok: true };
}

function isEmail_(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s);
}

/** تنظيف أي نص قبل إدراجه في HTML — منع حقن الأكواد من المصدر */
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** روابط آمنة حصراً — https فقط لأزرار الإجراء */
function safeUrl_(u) {
  var s = String(u == null ? '' : u);
  return /^https:\/\//i.test(s) ? s : '';
}

/** رأس الهوية — الجولة 69 (البند 6): شعار المنصة + الاسم — يتحلل لرأس نصي أنيق إن لم يوجد أساس */
function brandHeader_(appUrl) {
  var base = safeUrl_(appUrl);
  var logoHtml = '';
  if (base) {
    logoHtml =
      '<img src="' + esc_(base) + '/icons/icon-192.png" width="64" height="64" alt="' + esc_(BRAND_NAME) + '"' +
      ' style="display:block;margin:0 auto 10px;width:64px;height:64px;border-radius:16px;border:2px solid rgba(255,255,255,0.35);">';
  }
  return logoHtml +
    '<div style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">' + BRAND_NAME + '</div>' +
    '<div style="font-size:10px;color:rgba(255,255,255,0.75);letter-spacing:3px;margin-top:2px;">' + BRAND_LATIN + '</div>' +
    '<div style="font-size:10.5px;color:rgba(255,255,255,0.85);margin-top:6px;">' + BRAND_TAGLINE + '</div>';
}

/** رسالة حدود الاستخدام المجانية — بلا تفاصيل تقنية مبالغة */
function quotaMessage_(err) {
  var m = String(err && err.message ? err.message : '');
  if (m.indexOf('quota') !== -1 || m.indexOf('Limit') !== -1 || m.indexOf('limit') !== -1) {
    return 'تم بلوغ حد الإرسال اليومي المجاني لـ Gmail — حاول مجدداً بعد 24 ساعة';
  }
  return 'تعذر إرسال الرسالة عبر Gmail';
}


// ---------- القالب الموحد (Email Template Engine) ----------

/**
 * baseEmailTemplate — كل رسائل المنصة تخرج من هنا:
 * رأس بالهوية + بطاقة محتوى (عنوان/ترحيب/فقرات/بطاقات معلومات/زر) + تذييل.
 * HTML بجداول متداخلة وأنماط سطرية — متوافق مع Gmail وOutlook والهاتف.
 */
function baseEmailTemplate_(data) {
  var style = TYPE_STYLES[data.type] || DEFAULT_STYLE;
  var title = esc_(data.title || data.subject);
  var greeting = data.greeting ? esc_(data.greeting) : '';
  var lines = (data.lines && data.lines.length) ? data.lines : [];
  var rows = (data.rows && data.rows.length) ? data.rows : [];
  var cta = (data.cta && safeUrl_(data.cta.url)) ? data.cta : null;
  var note = data.note ? esc_(data.note) : '';

  // الفقرات
  var linesHtml = '';
  for (var i = 0; i < lines.length; i++) {
    linesHtml +=
      '<p style="margin:0 0 12px;font-size:14px;line-height:1.9;color:#334155;">' +
      esc_(lines[i]) + '</p>';
  }

  // بطاقات المعلومات — جدولان عموديان متجاوبان
  var rowsHtml = '';
  if (rows.length) {
    rowsHtml += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px;">';
    for (var r = 0; r < rows.length; r++) {
      rowsHtml +=
        '<tr><td style="padding:3px 0;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">' +
        '<tr>' +
        '<td style="padding:10px 14px;font-size:12px;color:#64748B;width:38%;white-space:nowrap;">' + esc_(rows[r].label) + '</td>' +
        '<td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#0F172A;text-align:left;">' + esc_(rows[r].value) + '</td>' +
        '</tr></table></td></tr>';
    }
    rowsHtml += '</table>';
  }

  // زر الإجراء
  var ctaHtml = '';
  if (cta) {
    ctaHtml =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 6px;">' +
      '<tr><td align="center">' +
      '<a href="' + esc_(safeUrl_(cta.url)) + '" style="display:inline-block;background:' + style.color +
      ';color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:13px 34px;border-radius:12px;">' +
      esc_(cta.text || 'عرض التفاصيل') + '</a>' +
      '</td></tr></table>';
  }

  // الملاحظة الختامية
  var noteHtml = note
    ? '<p style="margin:14px 0 0;font-size:11px;line-height:1.8;color:#94A3B8;border-top:1px dashed #E2E8F0;padding-top:12px;">' + note + '</p>'
    : '';

  // الهيكل الكامل
  return '' +
    '<!DOCTYPE html>' +
    '<html dir="rtl" lang="ar"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '</head>' +
    '<body style="margin:0;padding:0;background:#F1F5F9;direction:rtl;text-align:right;">' +

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 8px;">' +
    '<tr><td align="center">' +

    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">' +

    // الرأس — الهوية الموحدة (شعار + اسم + وصف) — الجولة 69
    '<tr><td style="background:linear-gradient(135deg,#0E7490,#0D9488);border-radius:18px 18px 0 0;padding:22px 24px;text-align:center;">' +
    brandHeader_(data.appUrl) +
    '</td></tr>' +

    // شريط عنوان الإشعار بلون النوع
    '<tr><td style="background:' + style.tint + ';padding:12px 24px;text-align:center;font-size:12.5px;font-weight:bold;color:' + style.color + ';">' +
    style.icon + ' ' + title +
    '</td></tr>' +

    // جسم البطاقة
    '<tr><td style="background:#ffffff;padding:24px;border-right:1px solid #E2E8F0;border-left:1px solid #E2E8F0;">' +
    (greeting ? '<p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#0F172A;">' + greeting + '</p>' : '') +
    linesHtml +
    rowsHtml +
    ctaHtml +
    noteHtml +
    '</td></tr>' +

    // التذييل — هوية موحدة
    '<tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 18px 18px;padding:16px 24px;text-align:center;">' +
    '<div style="font-size:13px;font-weight:bold;color:#0E7490;">تطبيق ' + BRAND_NAME + ' — ' + BRAND_LATIN + '</div>' +
    '<div style="font-size:10px;color:#94A3B8;margin-top:8px;border-top:1px dashed #E2E8F0;padding-top:10px;">' + SUPPORT_FOOTER + '</div>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr></table>' +
    '</body></html>';
}

// ---------- الاستجابة ----------

/** استجابة JSON موحدة وواضحة للتطبيق */
function respond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- أدوات تطوير اختيارية (تُستخدم يدوياً من محرر السكربت) ----------

/** اختبار سريع من محرر Apps Script: تشغيل sendTestMail_ ثم فحص سجل التنفيذ */
function sendTestMail_() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        secret: APP_SECRET,
        type: 'TEST',
        to: Session.getActiveUser().getEmail(),
        subject: 'رسالة تجريبية من خدمة تكليفات',
        title: '✅ خدمة البريد تعمل',
        greeting: 'مرحباً',
        lines: ['هذه رسالة تجريبية من منصة تكليفات — الربط مع Gmail يعمل بنجاح.'],
        rows: [{ label: 'الوقت', value: new Date().toLocaleString('ar') }]
      })
    }
  });
  Logger.log(res.getContent());
}
