import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './openai';

export async function callOpenai(payload: CallModelPayload): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callOpenai };