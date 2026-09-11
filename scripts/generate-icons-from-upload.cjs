/**
 * توليد أيقونات PWA لهوية تكليفات | Takleefat — الجولة 21
 * المصدر البصري: صورة الشعار الجديدة (كحلي/أزرق ملكي/سماوي/بنفسجي — ممرضة + حافظة)
 * من مجلد upload — تُستخرج منها كل أيقونات المنصة بدقة عالية.
 *
 * المخرجات في public/icons:
 *  - icon-192.png / icon-512.png          → purpose: any (الصورة كاملة كما هي)
 *  - maskable-192.png / maskable-512.png  → purpose: maskable (الرسمة داخل المنطقة الآمنة 80% على خلفية كحلية)
 *  - apple-touch-icon.png                 → 180×180 خلفية كاملة (iOS يقص الحواف بنفسه)
 */
const path = require('path')
const sharp = require('sharp')

const SRC = process.argv[2]
const OUT = path.join(__dirname, '..', 'public', 'icons')
const NAVY = { r: 10, g: 19, b: 56, alpha: 1 } // #0A1338 — كحلي مطابق لأطراف الشعار

async function main() {
  if (!SRC) throw new Error('_usage: node generate-icons-from-upload.cjs <source.png>')
  const src = sharp(SRC)

  // أيقونات any — الصورة كاملة (مربعة أصلاً)
  await src.clone().resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'))
  await src.clone().resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'))
  // iOS — خلفية كاملة 180
  await src.clone().resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'))

  // maskable — الرسمة داخل المنطقة الآمنة (80%) فوق خلفية كحلية موحدة
  for (const size of [512, 192]) {
    const art = Math.round(size * 0.8)
    const pad = Math.round((size - art) / 2)
    await sharp({
      create: { width: size, height: size, channels: 4, background: NAVY },
    })
      .composite([{ input: await src.clone().resize(art, art).png().toBuffer(), left: pad, top: pad }])
      .png()
      .toFile(path.join(OUT, `maskable-${size}.png`))
  }

  console.log('icons generated from', path.basename(SRC))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
