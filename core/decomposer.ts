import type { DecomposedTask } from '@/types/rex';
import logger from './logger';

/**
 * Decompose a user text into atomic tasks.
 * taskId is prefixed with requestId to guarantee global uniqueness.
 */
export function decompose(text: string, requestId = 'r0'): DecomposedTask[] {
  const t = (text || '').trim();
  if (!t) return [{ id: `${requestId}_t0`, text: '' }];

  const lines = t.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const listItemPattern = /^([\-\*•]|\d+[\)\.]|[a-zA-Z]\))/;
  const isList = lines.length > 1 && lines.every(l => listItemPattern.test(l) || l.length < 120);

  const tasks: DecomposedTask[] = [];

  if (isList) {
    lines.forEach((line, i) => {
      const cleaned = line.replace(/^([\-\*•]|\d+[\)\.]|[a-zA-Z]\))\s*/, '');
      tasks.push({ id: `${requestId}_t${i}`, text: cleaned, priority: lines.length - i });
    });
    logger.info({ event: 'decompose_list', requestId, count: tasks.length });
    return tasks;
  }

  // Sentence + conjunction splitting
  const sentences = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const clauses: string[] = [];
  for (const s of sentences) {
    const parts = s.split(/;|:\s+/).map(p => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (/\band\b/i.test(p) && p.length < 300) {
        const andParts = p.split(/\band\b/i).map(x => x.trim()).filter(Boolean);
        if (andParts.length > 1) {
          andParts.forEach(ap => clauses.push(ap));
          continue;
        }
      }
      clauses.push(p);
    }
  }

  if (clauses.length <= 1) return [{ id: `${requestId}_t0`, text: t }];

  const seqMarkers = /\b(first|then|next|after that|afterwards|finally|lastly|subsequently)\b/i;
  clauses.forEach((c, i) => {
    const task: DecomposedTask = { id: `${requestId}_t${i}`, text: c };
    if (seqMarkers.test(t) || seqMarkers.test(c)) task.dependencies = i > 0 ? [`${requestId}_t${i - 1}`] : undefined;
    task.priority = clauses.length - i;
    tasks.push(task);
  });

  logger.info({ event: 'decompose_clauses', requestId, count: tasks.length });
  return tasks;
}

export function decomposeIfNeeded(text: string, requestId?: string) {
  return decompose(text, requestId);
}

export default { decompose, decomposeIfNeeded };
