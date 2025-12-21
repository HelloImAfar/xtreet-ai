import type { CallModelPayload, ModelResponse } from '../../../types';

export async function callModel(
  payload: CallModelPayload
): Promise<ModelResponse> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return {
      text: '[Groq stub] API key not configured',
      tokensUsed: 10,
      meta: { provider: 'groq-stub' }
    };
  }

  // IMPLEMENTACIÓN REAL (mínima y limpia)
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: payload.model,
      messages: [{ role: 'user', content: payload.prompt }],
      temperature: payload.temperature ?? 0.7,
      max_tokens: payload.maxTokens ?? 512
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';

  return {
    text,
    tokensUsed: data.usage?.total_tokens,
    meta: { provider: 'groq' }
  };
}

export default { callModel };