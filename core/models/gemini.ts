import type { CallModelPayload, ModelResponse } from '../../types';

// Stub adapter for Google Gemini. Replace with real API calls when ready.
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return {
      text: '[Gemini stub] API key not configured',
      tokensUsed: 10,
      meta: { provider: 'gemini-stub' }
    };
  }

  // TODO: Implement real Google Gemini API call
  // const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent`, { ... })
  const text = `[GEMINI RESPONSE (placeholder)]\n${payload.prompt.slice(0, 200)}`;
  return { text, tokensUsed: Math.ceil(text.length / 4), meta: { provider: 'gemini' } };
}

export default { callModel };
