import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './grok';

export async function callGrok(payload: CallModelPayload): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callGrok };