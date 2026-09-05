import { NextResponse } from 'next/server'

/**
 * GET /api — نقطة فحص صحة المنصة
 */
export async function GET() {
  return NextResponse.json({
    name: 'تكليفات | Takleefat',
    description: 'منصة احترافية لإدارة التكليفات الطبية والتمريضية',
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
