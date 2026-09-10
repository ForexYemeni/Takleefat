/**
 * توليد أيقونات PWA لهوية تكليفات | Takleefat
 * المصدر البصري: public/logo.svg — حافظة طبية بعلامة (+) وعلامة صح
 * على تدرج فيروزي (#0F9BA8 → #1FA97A) — نفس الهندسة تماماً بمقياس 512.
 *
 * المخرجات في public/icons:
 *  - icon-192.png / icon-512.png          → purpose: any (حواف دائرية 25% كما في الشعار)
 *  - maskable-192.png / maskable-512.png  → purpose: maskable (خلفية كاملة، الرسمة داخل المنطقة الآمنة)
 *  - apple-touch-icon.png                 → 180×180 خلفية كاملة (iOS يقص الحواف بنفسه)
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const OUT = path.join(__dirname, '..', 'public', 'icons')

// الرسمة الأساسية — منسوخة هندسياً من public/logo.svg (viewBox 48)
const ART = `
  <rect x="13.5" y="11.5" width="21" height="25" rx="4" stroke="#FFFFFF" stroke-width="2.4" fill="none"/>
  <rect x="19" y="8.2" width="10" height="6.4" rx="2.2" fill="#FFFFFF" stroke="#0F9BA8" stroke-width="1.2"/>
  <path d="M24 18.6v7.2M20.4 22.2h7.2" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M19.6 30.4l2.9 2.9 5.9-5.9" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
`

const GRADIENT_DEFS = `
  <defs>
    <linearGradient id="tkf-g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0F9BA8"/>
      <stop offset="1" stop-color="#1FA97A"/>
    </linearGradient>
  </defs>
`

// أيقونة عادية (any): خلفية بحواف دائرية + الرسمة بعرض 80% من المساحة
const ANY_SVG = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${GRADIENT_DEFS}
  <rect width="512" height="512" rx="128" fill="url(#tkf-g)"/>
  <g transform="translate(51.2,51.2) scale(8.5)">${ART}</g>
</svg>`

// أيقونة maskable: خلفية كاملة بلا شفافية (نظام التشغيل يطبق القناع)
// الرسمة مقياسها 7/48 ≈ 66% لتبقى داخل دائرة الأمان (80% من الحجم)
const BLEED_SVG = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${GRADIENT_DEFS}
  <rect width="512" height="512" fill="url(#tkf-g)"/>
  <g transform="translate(87,87) scale(7)">${ART}</g>
</svg>`

const JOBS = [
  ['icon-192.png', ANY_SVG, 192],
  ['icon-512.png', ANY_SVG, 512],
  ['maskable-192.png', BLEED_SVG, 192],
  ['maskable-512.png', BLEED_SVG, 512],
  ['apple-touch-icon.png', BLEED_SVG, 180],
]

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const [name, svg, size] of JOBS) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, name))
    console.log('OK', name, size + 'x' + size)
  }
}

main().catch((e) => {
  console.error('ICON GENERATION FAILED:', e)
  process.exit(1)
})
