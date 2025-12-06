import type { CallModelPayload, ModelResponse } from '../../types';

// Stub adapter for Grok (X/Twitter). Replace with real API calls when ready.
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const GROK_API_KEY = process.env.GROK_API_KEY;
  if (!GROK_API_KEY) {
    return {
      text: '[Grok stub] API key not configured',
      tokensUsed: 10,
      meta: { provider: 'grok-stub' }
    };
  }

  // TODO: Implement real Grok API call (via xAI)
  // const res = await fetch('https://api.x.ai/v1/chat/completions', { ... })
  const text = `[GROK RESPONSE (placeholder)]\n${payload.prompt.slice(0, 200)}`;
  return { text, tokensUsed: Math.ceil(text.length / 4), meta: { provider: 'grok' } };
}

export default { callModel };
