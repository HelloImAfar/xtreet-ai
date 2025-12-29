import type { CallModelPayload, ModelResponse } from '../../../types';

export async function callModel(
  payload: CallModelPayload
): Promise<ModelResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${payload.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: payload.prompt }]
          }
        ],
        generationConfig: {
          temperature: payload.temperature ?? 0,
          maxOutputTokens: payload.maxTokens ?? 256
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const json = await res.json();

  const text =
    json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return {
    text,
    tokensUsed: Math.ceil(text.length / 4),
    meta: {
      provider: 'gemini',
      model: payload.model
    }
  };
}

export default { callModel };
