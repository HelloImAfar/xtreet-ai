import type { DecomposedTask } from '@/types/rex';

/**
 * Decompose a user text into an array of atomic tasks.
 * Heuristics:
 * - If input contains explicit list markers (numbers, bullets) split by lines
 * - Else split by sentences and conjunctions
 * - Detect sequence markers (first/then/next) and create ordered dependencies
 * - For plain "A and B" style coordination, create parallelizable tasks (no deps)
 * Returns tasks with ids, preserved order and dependency hints.
 */
export function decompose(text: string): DecomposedTask[] {
  const t = (text || '').trim();
  if (!t) return [{ id: 't0', text: '' }];

  // 1) Detect explicit lists (lines that look like list items)
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const listItemPattern = /^([\-\*•]|\d+[\)\.]|[a-zA-Z]\))/;
  const isList = lines.length > 1 && lines.every((l) => listItemPattern.test(l) || l.length < 120);
  if (isList) {
    const tasks: DecomposedTask[] = [];
    lines.forEach((line, i) => {
      // strip leading bullets/numbers
      const cleaned = line.replace(/^([\-\*•]|\d+[\)\.]|[a-zA-Z]\))\s*/, '');
      tasks.push({ id: `t${i}`, text: cleaned, priority: lines.length - i });
    });
    return tasks;
  }

  // 2) Sentence + conjunction based splitting
  // First split on sentences
  const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  // If single sentence but contains commas/ands, split into clauses
  const clauses: string[] = [];
  for (const s of sentences) {
    // split by semicolons first
    const parts = s.split(/;|:\s+/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      // split by ' and ' only when it separates clauses (heuristic)
      if (/\band\b/i.test(p) && p.length < 300) {
        const andParts = p.split(/\band\b/i).map((x) => x.trim()).filter(Boolean);
        if (andParts.length > 1) {
          andParts.forEach((ap) => clauses.push(ap));
          continue;
        }
      }
      clauses.push(p);
    }
  }

  // If after splitting we still have one clause, return as single task
  if (clauses.length <= 1) return [{ id: 't0', text: t }];

  // 3) Detect sequencing words and assign dependencies
  const seqMarkers = /\b(first|then|next|after that|afterwards|finally|lastly|subsequently)\b/i;
  const tasks: DecomposedTask[] = clauses.map((c, i) => ({ id: `t${i}`, text: c }));

  // Set dependencies if sequence markers present in clauses or overarching text
  if (seqMarkers.test(t) || clauses.some((c) => seqMarkers.test(c))) {
    for (let i = 0; i < tasks.length; i++) {
      if (i > 0) tasks[i].dependencies = [tasks[i - 1].id];
      tasks[i].priority = tasks.length - i; // earlier tasks have higher priority
    }
  } else {
    // Default: no dependencies (parallelizable), but preserve order in ids
    for (let i = 0; i < tasks.length; i++) tasks[i].priority = tasks.length - i;
  }

  return tasks;
}

export function decomposeIfNeeded(text: string, category?: string) {
  // Lightweight compatibility wrapper — actual decomposition is pure and deterministic
  const tasks = decompose(text);
  return tasks;
}

export default { decompose, decomposeIfNeeded };
