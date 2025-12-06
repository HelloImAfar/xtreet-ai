import type { ModelResponse } from '../types';

export async function assemble(results: Array<{ status: 'fulfilled' | 'rejected'; value?: ModelResponse; reason?: any }>) {
  // Merge fulfilled responses in order; simple concatenation with provenance
  const parts = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value!.text.trim());

  const text = parts.join('\n\n');
  const containsTechnical = /```|function |class |\d+\s*=\s*/i.test(text);
  return { text, parts, containsTechnical };
}

export default { assemble };
