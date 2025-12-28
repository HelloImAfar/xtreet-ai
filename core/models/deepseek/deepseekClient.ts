import type { CallModelPayload, ModelResponse } from '@/types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

export async function callDeepSeek(
  payload: CallModelPayload
): Promise<ModelResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: payload.model || 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: payload.prompt
        }
      ],
      temperature: payload.temperature ?? 0,
      max_tokens: payload.maxTokens ?? 256,
      stream: false
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API error: ${errText}`);
  }

  const json = await res.json();

  const text =
    json?.choices?.[0]?.message?.content ?? '';

  return {
    text,
    tokensUsed: json?.usage?.total_tokens ?? 0,
    meta: {
      provider: 'deepseek',
      model: payload.model || 'deepseek-chat'
    }
  };
}

export default { callDeepSeek };
