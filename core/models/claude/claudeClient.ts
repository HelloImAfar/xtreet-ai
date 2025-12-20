import type { CallModelPayload, ModelResponse } from '@/types';
import * as impl from './claude';

export async function callClaude(payload: CallModelPayload): Promise<ModelResponse> {
  // Thin client wrapper around the existing implementation. Keeps surface area
  // small and allows future extension (auth, retries, metrics) in one place.
  return impl.callModel(payload);
}

export default { callClaude };