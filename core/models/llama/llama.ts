import type { CallModelPayload, ModelResponse } from '../../../types';
// Stub adapter for Llama/Phi or local models. Returns an echo and marks provenance.
export async function callModel(payload: CallModelPayload): Promise<ModelResponse> {
  const text = `LLAMA-STUB RESPONSE:\n${payload.prompt.slice(0, 200)}`;
  return { text, tokensUsed: Math.ceil(text.length / 4), meta: { provider: 'llama-stub' } };
}

export default { callModel };
