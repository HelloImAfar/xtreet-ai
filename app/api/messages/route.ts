import { NextRequest, NextResponse } from 'next/server';
import { handleMessage } from '@/core/engine';
import { logger } from '@/core/logger';
import type { MessageRequest } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MessageRequest;
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    // Validate input
    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'text is required and must be non-empty' }, { status: 400 });
    }

    // Sanitize input
    const text = body.text.trim().slice(0, 5000);

    const result = await handleMessage({ ...body, text }, clientIp);

    return NextResponse.json(result);
  } catch (e) {
    logger.error('POST /api/messages error', { error: String(e) });
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;