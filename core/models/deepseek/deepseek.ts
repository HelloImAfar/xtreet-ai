import type { CallModelPayload, ModelResponse } from '../../../types';

// Minimal DeepSeek adapter — treat as a standard text-capable provider.
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_API_KEY) {
    return {
      text: '[DeepSeek stub] API key not configured',
      tokensUsed: 10,
      meta: { provider: 'deepseek-stub' }
    };
  }

  // Placeholder behavior until a real API client is implemented
  const text = `[DEEPSEEK RESPONSE (placeholder)]\n${payload.prompt.slice(0, 200)}`;
  return { text, tokensUsed: Math.ceil(text.length / 4), meta: { provider: 'deepseek' } };
}

export default { callModel };