import { NextRequest, NextResponse } from 'next/server';
import { classify } from '@/core/classifier';
import { decomposeIfNeeded } from '@/core/decomposer';
import { logger } from '@/core/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text } = body as { text?: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
    }

    const { category, confidence } = await classify(text);
    const decomposition = await decomposeIfNeeded(text, category);

    return NextResponse.json({
      ok: true,
      category,
      confidence,
      decomposition: decomposition.map((t) => ({ id: t.id, text: t.text }))
    });
  } catch (e) {
    logger.error('POST /api/classify error', { error: String(e) });
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
