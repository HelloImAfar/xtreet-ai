import type { ModelResponse } from '../types';
import logger from './logger';

export async function assemble(
  results: Array<{ status: 'fulfilled' | 'rejected'; value?: ModelResponse; reason?: any }>
) {
  // Deduplicación basada en el contenido del texto
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;

    const text = r.value.text?.trim() ?? '';
    if (!text) continue;

    if (seen.has(text)) continue; // dedup por contenido exacto
    seen.add(text);

    parts.push(text);
  }

  const fullText = parts.join('\n\n');
  const containsTechnical = /```|function |class |\d+\s*=\s*/i.test(fullText);

  logger.info({ event: 'assemble', count: parts.length, containsTechnical });
  return { text: fullText, parts, containsTechnical };
}

export default { assemble };
