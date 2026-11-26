import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      status: 'healthy',
      uptimeSeconds: Math.round(process.uptime()),
      dbLatencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'unhealthy',
        uptimeSeconds: Math.round(process.uptime()),
        dbLatencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Database check failed',
      },
      { status: 503 }
    );
  }
}

