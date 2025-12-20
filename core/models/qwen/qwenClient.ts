import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './qwen';

export async function callQwen(payload: CallModelPayload): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callQwen };