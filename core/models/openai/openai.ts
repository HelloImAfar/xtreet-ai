import { retry } from '../../../lib/utils';
import type { CallModelPayload, ModelResponse } from '../../../types';
import logger from '../../logger';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const body = {
    model: payload.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: payload.prompt }],
    max_tokens: payload.maxTokens || 512,
    temperature: payload.temperature ?? 0.7
  } as any;

  const fn = async () => {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const t = await res.text();
      logger.warn('OpenAI non-ok response', { status: res.status, body: t });
      throw new Error(`OpenAI error: ${res.status} ${t}`);
    }

    const json = await res.json();
    // Normalize
    const text = json.choices?.map((c: any) => c.message?.content || c.text).join('\n') || '';
    const usage = json.usage || {};
    return { text, tokensUsed: usage.total_tokens || 0, meta: { raw: json } } as ModelResponse;
  };

  return retry(fn, 3, 300);
}

export default { callModel };
