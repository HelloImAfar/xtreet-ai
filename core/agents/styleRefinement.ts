import type { Agent } from './agent';

/**
 * StyleRefinementAgent
 * - Stateless stylistic improvements: shorten long sentences, prefer active voice heuristics,
 *   normalize spacing and punctuation. Should be safe and reversible.
 */
export const StyleRefinementAgent: Agent = {
  id: 'StyleRefinementAgent',
  async run({ taskId, text }) {
    const notes: string[] = [];
    let out = (text || '').trim();

    // Heuristic: shorten long sentences > 200 chars by splitting on commas/semicolons
    const sentences = out.split(/(?<=[.!?])\s+/);
    const transformed = sentences
      .map((s) => {
        if (s.length > 200) {
          notes.push('Se sugirió dividir una oración larga para mejorar legibilidad.');
          return s.replace(/,\s*/g, '. ');
        }
        return s;
      })
      .join(' ')
      .replace(/\s+\./g, '.');

    out = transformed;

    // Heuristic: avoid passive voice simple detection "was .* by" -> suggest active voice
    if (/\bwas\b[\s\S]{0,30}\bby\b/i.test(out)) {
      notes.push('Se detectó voz pasiva; considera voz activa para mayor claridad.');
    }

    // Normalize whitespace
    out = out.replace(/\s{2,}/g, ' ').trim();

    return { agentId: 'StyleRefinementAgent', taskId, text: out, notes, issues: [], metadata: {} };
  },
};

export default StyleRefinementAgent;
