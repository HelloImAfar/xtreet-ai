import type { CallModelPayload, ModelResponse } from '../../../types';

// Stub adapter for Claude (Anthropic). Replace with real API calls when ready.
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    return {
      text: '[Claude stub] API key not configured',
      tokensUsed: 10,
      meta: { provider: 'claude-stub' }
    };
  }

  // TODO: Implement real Anthropic API call
  // const res = await fetch('https://api.anthropic.com/v1/messages', { ... })
  const text = `[CLAUDE RESPONSE (placeholder)]\n${payload.prompt.slice(0, 200)}`;
  return { text, tokensUsed: Math.ceil(text.length / 4), meta: { provider: 'claude' } };
}

export default { callModel };
