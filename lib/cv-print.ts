import type { CvData } from '@/components/shared/professional-cv'

/** بنية بيانات السيرة الموحدة — تُصدَّر من هنا أيضاً ليستوردها كل المستهلكين */
export type { CvData } from '@/components/shared/professional-cv'

/**
 * مولّد طباعة السيرة الذاتية — الجولة 74
 * ========================================
 * يبني نسخة HTML نظيفة RTL من بيانات السيرة الموحدة ويطبعها عبر iframe
 * مخفي (احترافي: «حفظ كـ PDF» من حوار الطباعة في أي متصفح/جهاز).
 * كل قيمة نصية تمر عبر escapeHtml — لا حقن أبداً، والصورة تُحلّ إلى رابط مطلق.
 */

const AXES: Array<{ key: 'punctuality' | 'quality' | 'communication' | 'discipline'; label: string }> = [
  { key: 'punctuality', label: 'الالتزام بالمواعيد' },
  { key: 'quality', label: 'جودة الأداء' },
  { key: 'communication', label: 'التعامل والتواصل' },
  { key: 'discipline', label: 'الانضباط المهني' },
]

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function absoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).href
  } catch {
    return url
  }
}

function starRow(value: number): string {
  const full = Math.round(value)
  return Array.from({ length: 5 }, (_, i) => `<span class="${i < full ? 'on' : 'off'}">★</span>`).join('')
}

export function buildCvPrintHtml(cv: CvData): string {
  const isDoctor = cv.role === 'DOCTOR'
  const roleLabel = isDoctor ? 'طبيب' : 'كادر صحي'
  const accent = isDoctor ? '#4338CA' : '#0F766E'
  const accent2 = '#2563EB'

  const photo = cv.photoUrl
    ? `<img src="${escapeHtml(absoluteUrl(cv.photoUrl))}" alt="" class="photo" />`
    : ''

  const summary = [
    `${roleLabel} ${cv.specialty ? `بتخصص ${cv.specialty}` : ''}`.trim(),
    cv.yearsOfExperience != null && cv.yearsOfExperience > 0 ? `بخبرة ${cv.yearsOfExperience} سنة` : '',
    cv.qualification ? `حاصلة على ${cv.qualification}` : '',
  ].filter(Boolean).join('، ')

  const departments = [...(cv.workDepartments ?? []), ...(cv.workSpecialties ?? [])]
  const deptChips = departments.length
    ? departments.map((d) => `<span class="chip">${escapeHtml(d)}</span>`).join('')
    : '<span class="muted">—</span>'

  const affRows = cv.affiliations.length
    ? cv.affiliations
        .map(
          (a) => `<tr>
            <td class="strong">${escapeHtml(a.hospital.name)}</td>
            <td>${escapeHtml(a.hospital.type)}${a.hospital.city ? ` — ${escapeHtml(a.hospital.city)}` : ''}</td>
            <td>${a.workYears != null ? `${escapeHtml(a.workYears)} سنة` : '—'}</td>
            <td>${escapeHtml(a.statusLabel)}</td>
          </tr>`
        )
        .join('')
    : `<tr><td colspan="4" class="muted">لا يوجد سجل مهني مسجل بعد</td></tr>`

  const axisRows = AXES.filter(({ key }) => cv.ratings.axes[key] != null)
    .map(
      ({ key, label }) => `<div class="axis">
        <span>${escapeHtml(label)}</span>
        <span class="bar"><span class="fill" style="width:${((cv.ratings.axes[key] ?? 0) / 5) * 100}%"></span></span>
        <b>${cv.ratings.axes[key]?.toFixed(1) ?? '—'}</b>
      </div>`
    )
    .join('')

  const latest = cv.ratings.latest
    .slice(0, 3)
    .map(
      (r) => `<div class="quote">
        <div class="quote-head"><b>${escapeHtml(r.assignmentTitle)}</b><span>${starRow(r.overall)}</span></div>
        ${r.comment ? `<p>«${escapeHtml(r.comment)}»</p>` : ''}
        <small>${escapeHtml(r.receiverName)} — ${new Date(r.createdAt).toLocaleDateString('ar')}</small>
      </div>`
    )
    .join('')

  const s = cv.stats
  const statCells = [
    { v: cv.yearsOfExperience != null ? String(cv.yearsOfExperience) : '—', l: 'سنة خبرة' },
    { v: String(s.completedAssignments), l: 'تكليف مكتمل' },
    { v: s.completionRate != null ? `${s.completionRate}%` : '—', l: 'معدل الإنجاز' },
    {
      v: cv.ratings.average != null ? `${cv.ratings.average.toFixed(1)}/5` : '—',
      l: `متوسط التقييم${cv.ratings.count ? ` (${cv.ratings.count})` : ''}`,
    },
  ]
    .map((c) => `<div class="stat"><b>${escapeHtml(c.v)}</b><span>${escapeHtml(c.l)}</span></div>`)
    .join('')

  const generated = new Date(cv.generatedAt).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' })
  const member = new Date(cv.memberSince).toLocaleDateString('ar', { year: 'numeric', month: 'long' })

  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8" />
<title>السيرة الذاتية — ${escapeHtml(cv.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; padding: 24px; max-width: 860px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 16px; background: linear-gradient(225deg, ${accent2}, #8B5CF6); color: #fff; padding: 22px; border-radius: 16px; }
  .photo { width: 84px; height: 84px; border-radius: 18px; object-fit: cover; border: 2px solid rgba(255,255,255,.5); }
  .head h1 { font-size: 24px; margin-bottom: 4px; }
  .head .sub { font-size: 13px; opacity: .92; }
  .verified { font-size: 11px; font-weight: 700; opacity: .9; margin-bottom: 6px; }
  .summary { margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; font-size: 13.5px; line-height: 1.9; background: #f8fafc; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: center; }
  .stat b { display: block; font-size: 18px; color: ${accent}; }
  .stat span { font-size: 11px; color: #64748b; }
  .section { margin-top: 16px; }
  .section h2 { font-size: 14px; color: ${accent}; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 1px solid ${accent}33; background: ${accent}0d; color: ${accent}; border-radius: 999px; padding: 3px 12px; font-size: 12px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 10px; text-align: right; }
  th { background: #f1f5f9; font-size: 11.5px; color: #475569; }
  .strong { font-weight: 800; }
  .muted { color: #94a3b8; }
  .axis { display: flex; align-items: center; gap: 10px; font-size: 12.5px; margin-bottom: 7px; }
  .axis span:first-child { width: 130px; }
  .bar { flex: 1; height: 7px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
  .fill { display: block; height: 100%; background: linear-gradient(90deg, ${accent2}, #8B5CF6); border-radius: 999px; }
  .quote { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; font-size: 12.5px; }
  .quote-head { display: flex; justify-content: space-between; gap: 8px; }
  .quote p { margin: 6px 0; line-height: 1.8; }
  .quote small { color: #64748b; }
  .on { color: #f59e0b; } .off { color: #cbd5e1; }
  .foot { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
  @page { size: A4; margin: 12mm; }
</style></head>
<body>
  <div class="head">
    ${photo}
    <div>
      <div class="verified">✦ سيرة ذاتية — موثقة من منصة تكليفات | Takleefat</div>
      <h1>${escapeHtml(cv.name)}</h1>
      <div class="sub">${escapeHtml(roleLabel)}${cv.gender === 'MALE' ? ' — ذكر' : cv.gender === 'FEMALE' ? ' — أنثى' : ''}${cv.specialty ? ` · ${escapeHtml(cv.specialty)}` : ''}</div>
      <div class="sub">${cv.yearsOfExperience != null ? `${escapeHtml(cv.yearsOfExperience)} سنة خبرة · ` : ''}${escapeHtml(cv.qualification ?? 'بدون مؤهل مسجل')}</div>
    </div>
  </div>
  <div class="summary"><b>الملخص المهني:</b> ${escapeHtml(summary)} — ${s.isAvailable ? 'متاح للتكليفات الجديدة حالياً.' : `حالياً في تكليف: ${escapeHtml(s.busyWith ?? '')}.`}</div>
  <div class="stats">${statCells}</div>
  <div class="section"><h2>أقسام وتخصصات العمل</h2><div class="chips">${deptChips}</div></div>
  <div class="section"><h2>السجل المهني — جهات العمل</h2>
    <table><thead><tr><th>الجهة</th><th>النوع / المدينة</th><th>سنوات العمل</th><th>حالة الارتباط</th></tr></thead><tbody>${affRows}</tbody></table>
  </div>
  ${axisRows || latest ? `<div class="section"><h2>التقييمات المهنية${cv.ratings.average != null ? ` — المتوسط ${cv.ratings.average.toFixed(1)}/5` : ''}</h2>${axisRows}${latest}</div>` : ''}
  <div class="foot"><span>عضو في المنصة منذ ${escapeHtml(member)}</span><span>صدرت بتاريخ ${escapeHtml(generated)} — تكليفات | Takleefat</span></div>
</body></html>`
}

/** فتح حوار الطباعة عبر iframe مخفي — تحفظ كـ PDF من أي متصفح */
export function printCv(cv: CvData): void {
  const html = buildCvPrintHtml(cv)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.inset = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  const run = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => document.body.removeChild(iframe), 60_000)
    }
  }
  if (doc.readyState === 'complete') setTimeout(run, 150)
  else iframe.onload = () => setTimeout(run, 150)
}
