import type { CallModelPayload, ModelResponse } from '../../../types';

// Stub adapter for Mistral. Replace with real API calls when ready.
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  if (!MISTRAL_API_KEY) {
    return {
      text: '[Mistral stub] API key not configured',
      tokensUsed: 10,
      meta: { provider: 'mistral-stub' }
    };
  }

  // TODO: Implement real Mistral API call
  // const res = await fetch('https://api.mistral.ai/v1/chat/completions', { ... })
  const text = `[MISTRAL RESPONSE (placeholder)]\n${payload.prompt.slice(0, 200)}`;
  return { text, tokensUsed: Math.ceil(text.length / 4), meta: { provider: 'mistral' } };
}

export default { callModel };
