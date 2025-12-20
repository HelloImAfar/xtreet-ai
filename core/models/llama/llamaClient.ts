import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './llama';

export async function callLlama(payload: CallModelPayload): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callLlama };