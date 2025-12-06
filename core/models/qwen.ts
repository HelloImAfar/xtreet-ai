import type { CallModelPayload, ModelResponse } from '../../types';

// Stub adapter for Qwen (Alibaba). Replace with real API calls when ready.
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const QWEN_API_KEY = process.env.QWEN_API_KEY;
  if (!QWEN_API_KEY) {
    return {
      text: '[Qwen stub] API key not configured',
      tokensUsed: 10,
      meta: { provider: 'qwen-stub' }
    };
  }

  // TODO: Implement real Qwen API call (via Alibaba Cloud)
  // const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', { ... })
  const text = `[QWEN RESPONSE (placeholder)]\n${payload.prompt.slice(0, 200)}`;
  return { text, tokensUsed: Math.ceil(text.length / 4), meta: { provider: 'qwen' } };
}

export default { callModel };
