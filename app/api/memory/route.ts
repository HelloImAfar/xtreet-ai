import { NextRequest, NextResponse } from 'next/server';
import { getMemory, upsertMemory } from '@/core/memory';
import { logger } from '@/core/logger';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'userId is required' }, { status: 400 });
    }

    const memory = await getMemory(userId);
    return NextResponse.json({ ok: true, memory });
  } catch (e) {
    logger.error('GET /api/memory error', { error: String(e) });
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, key, value } = body as { userId?: string; key?: string; value?: any };

    if (!userId || !key) {
      return NextResponse.json({ ok: false, error: 'userId and key are required' }, { status: 400 });
    }

    const result = await upsertMemory(userId, key, value);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    logger.error('POST /api/memory error', { error: String(e) });
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
