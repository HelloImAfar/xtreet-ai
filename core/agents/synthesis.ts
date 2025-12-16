import type { Agent } from './agent';

/**
 * SynthesisAgent
 * - Stateless summarizer/synthesizer: given a piece of text (or accumulated results)
 *   returns a concise synthesis. Pure function — no side effects.
 */
export const SynthesisAgent: Agent = {
  id: 'SynthesisAgent',
  async run({ taskId, text }) {
    const notes: string[] = [];
    const t = (text || '').trim();
    if (!t) return { agentId: 'SynthesisAgent', taskId, text: '', notes: ['No input'], issues: [], metadata: {} };

    // Very lightweight summary heuristic: take first sentence and a short conclusion of last sentence
    const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    let summary = sentences[0] || t;
    if (sentences.length > 1) {
      const last = sentences[sentences.length - 1];
      summary = `${summary} ${last.length < 100 ? last : last.slice(0, 100) + '...'}`;
    }
    if (summary.length > 300) summary = summary.slice(0, 300) + '...';

    notes.push('Síntesis simple generada.');

    return { agentId: 'SynthesisAgent', taskId, text: summary, notes, issues: [], metadata: {} };
  },
};

export default SynthesisAgent;
