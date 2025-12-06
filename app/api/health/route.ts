import { NextResponse } from 'next/server';
import { logger } from '@/core/logger';

export async function GET() {
  try {
    // Basic health checks
    const supabaseUrl = process.env.SUPABASE_URL;
    const openaiKey = process.env.OPENAI_API_KEY;

    const checks = {
      supabase_configured: !!supabaseUrl,
      openai_configured: !!openaiKey,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    const allOk = checks.supabase_configured && checks.openai_configured;

    logger.info('Health check', checks);

    return NextResponse.json(
      {
        ok: allOk,
        checks,
        message: allOk ? 'All systems operational' : 'Some providers not configured'
      },
      { status: allOk ? 200 : 503 }
    );
  } catch (e) {
    logger.error('GET /api/health error', { error: String(e) });
    return NextResponse.json({ ok: false, error: 'Health check failed' }, { status: 500 });
  }
}
