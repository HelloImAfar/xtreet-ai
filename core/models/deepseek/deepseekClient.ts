import type { CallModelPayload, ModelResponse } from '@/types';

export async function callDeepSeek(
  payload: CallModelPayload
): Promise<ModelResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: payload.model || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are an intent classification engine. Always respond with pure JSON.'
        },
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
    const err = await res.text();
    throw new Error(`DeepSeek API error: ${err}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? '';

  return {
    text,
    tokensUsed: json.usage?.total_tokens ?? 0,
    meta: { provider: 'deepseek', model: payload.model }
  };
}

export default { callDeepSeek };
