import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './mistral';

export async function callMistral(payload: CallModelPayload): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callMistral };