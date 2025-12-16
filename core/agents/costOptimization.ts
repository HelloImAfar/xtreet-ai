import type { Agent } from './agent';

/**
 * CostOptimizationAgent
 * - Stateless analyzer that returns suggestions to reduce cost (e.g., shorten text,
 *   recommend lower max_tokens or model tier hints). This is advisory only.
 */
export const CostOptimizationAgent: Agent = {
  id: 'CostOptimizationAgent',
  async run({ taskId, text }) {
    const notes: string[] = [];
    const issues: Array<{ type: string; message: string }> = [];
    const metadata: Record<string, any> = {};

    const len = (text || '').split(/\s+/).filter(Boolean).length;
    // Simple heuristic cost estimate: assume 1 token ~= 0.75 words
    const approxTokens = Math.ceil(len / 0.75);
    metadata.approxTokens = approxTokens;
    if (approxTokens > 500) {
      notes.push('Texto largo; considere acortar para reducir uso de tokens.');
      metadata.suggestedMaxTokens = Math.max(64, Math.floor(approxTokens * 0.5));
    } else if (approxTokens > 200) {
      notes.push('Considerar resumir partes no esenciales para ahorrar costes.');
      metadata.suggestedMaxTokens = Math.max(32, Math.floor(approxTokens * 0.7));
    } else {
      notes.push('Longitud razonable.');
      metadata.suggestedMaxTokens = Math.max(16, Math.floor(approxTokens * 0.5));
    }

    // Provide a simple model tier hint
    if (approxTokens > 2000) {
      issues.push({ type: 'cost', message: 'Requiere muchos tokens — revisar estrategia de chunking o procesado por lotes.' });
    }

    return {
      agentId: 'CostOptimizationAgent',
      taskId,
      text,
      notes,
      issues,
      metadata,
    };
  },
};

export default CostOptimizationAgent;
