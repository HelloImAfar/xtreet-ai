import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './groq';

export async function callGroq(
  payload: CallModelPayload
): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callGroq };
