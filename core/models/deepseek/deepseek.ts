import type { CallModelPayload, ModelResponse } from '../../../types';

export async function callModel(
  payload: CallModelPayload
): Promise<ModelResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: payload.model,
      messages: [
        {
          role: 'user',
          content: payload.prompt
        }
      ],
      temperature: payload.temperature ?? 0,
      max_tokens: payload.maxTokens ?? 256
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error: ${err}`);
  }

  const json = await res.json();

  const text =
    json?.choices?.[0]?.message?.content ?? '';

  return {
    text,
    tokensUsed: json?.usage?.total_tokens ?? Math.ceil(text.length / 4),
    meta: { provider: 'deepseek' }
  };
}

export default { callModel };
