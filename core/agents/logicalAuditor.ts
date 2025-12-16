import type { Agent } from './agent';

/**
 * LogicalAuditorAgent
 * - Stateless heuristics to detect simple logical inconsistencies and contradictions.
 * - Pure function: no external side effects, removable.
 */
export const LogicalAuditorAgent: Agent = {
  id: 'LogicalAuditorAgent',
  async run({ taskId, text }) {
    const notes: string[] = [];
    const issues: Array<{ type: string; message: string }> = [];

    const t = (text || '').trim();
    // Heuristic 1: Detect contradictory modal statements (e.g., "do X" and "don't do X")
    const contradictionPattern = /(don't|do not|avoid|never)\s+([\w\s]+)\b[\s\S]*\b(do|please)\s+\2/gi;
    if (contradictionPattern.test(t)) {
      issues.push({ type: 'contradiction', message: 'Se detectó posible contradicción en las instrucciones.' });
    }

    // Heuristic 2: If text contains absolute claims followed by uncertainty markers
    if (/\b(always|never|must)\b/i.test(t) && /\b(maybe|might|could|consider)\b/i.test(t)) {
      notes.push('Hay afirmaciones absolutas junto con marcadores de incertidumbre; considera aclarar.');
    }

    // Heuristic 3: Check for impossible sequential requirements like "first X then X"
    if (/first[^.]*\b([\w\s]{3,})\b[^.]*then[^.]*\b\1\b/i.test(t)) {
      issues.push({ type: 'sequence', message: 'Posible paso repetido en la secuencia (mismo paso aparece dos veces).' });
    }

    return { agentId: 'LogicalAuditorAgent', taskId, text, notes, issues, metadata: {} };
  },
};

export default LogicalAuditorAgent;
