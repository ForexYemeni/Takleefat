import type { NextConfig } from "next";

// ============================================================
// تكليفات | Takleefat — Next.js Configuration
// ============================================================

/**
 * ضمانة رابط المصادقة أثناء البناء:
 * مكتبة next-auth تقرأ NEXTAUTH_URL وقت تقييم الوحدات (module scope)
 * أثناء التوليد الساكن لصفحة /_not-found. إذا كان المتغير معرّفاً بقيمة
 * فارغة "" على Vercel فإن new URL("") يرمي TypeError: Invalid URL
 * ويُفشل البناء. لذلك نضمن دائماً وجود قيمة صالحة:
 *   1) NEXTAUTH_URL إن وُجد ولم يكن فارغاً
 *   2) وإلا VERCEL_URL (يضبطه Vercel تلقائياً أثناء البناء)
 *   3) وإلا localhost للتطوير المحلي
 */
const AUTH_URL_FALLBACK =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  env: {
    // تُثبَّت القيمة الصالحة وقت البناء لكل من الحزمة العميلة والخادمية
    NEXTAUTH_URL: AUTH_URL_FALLBACK,
    NEXTAUTH_URL_INTERNAL: AUTH_URL_FALLBACK,
  },
  async headers() {
    return [
      {
        // ملف Service Worker يجب ألا يُخزَّن مؤقتاً حتى تصل التحديثات فوراً،
        // والسماح له بالتحكم في كامل نطاق الموقع
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
