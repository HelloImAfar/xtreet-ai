import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './deepseek';

export async function callDeepSeek(payload: CallModelPayload): Promise<ModelResponse> {
  return impl.callModel(payload);
}

export default { callDeepSeek };