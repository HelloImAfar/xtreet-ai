import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './gemini';

export async function callGemini(
  payload: CallModelPayload
): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callGemini };
