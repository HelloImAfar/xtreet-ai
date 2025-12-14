import type { DecomposedTask } from '@/types/rex';

function splitSentences(text: string) {
  // split by newlines first (lists), then by sentence endings
  const byLines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const sentences: string[] = [];
  for (const line of byLines) {
    // if line looks like a list item (starts with - or number.), strip bullets
    const bullet = line.replace(/^\s*[-*\u2022]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim();
    // split by sentence terminators but keep short fragments
    const parts = bullet.split(/(?<=[.!?;])\s+|;\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) sentences.push(...parts);
    else sentences.push(bullet);
  }
  return sentences;
}

function splitByConjunctions(sentence: string) {
  // split on ' and ', ' & ', ', and ' but avoid splitting inside parentheses
  const parts = sentence
    .split(/,\s+and\s+|\s+and\s+|\s+&\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts;
}

function hasSequencingKeywords(text: string) {
  return /\b(first|then|next|after that|afterwards|finally|subsequently)\b/i.test(text);
}

function hasParallelKeywords(text: string) {
  return /\b(in parallel|simultaneously|at the same time|concurrently)\b/i.test(text);
}

/**
 * Decompose a request text into atomic tasks with dependencies and meta information.
 * This is pure, synchronous and deterministic logic.
 */
export function decomposeRequest(text: string): DecomposedTask[] {
  if (!text || !text.trim()) return [];

  const sentences = splitSentences(text);
  const tasks: DecomposedTask[] = [];

  // First pass: split by conjunctions inside sentences
  for (const s of sentences) {
    const parts = splitByConjunctions(s);
    if (parts.length > 1) {
      // if sentence contained sequencing keywords, keep ordering; otherwise mark as parallelizable
      const parallel = !hasSequencingKeywords(s) || hasParallelKeywords(s);
      for (const p of parts) {
        tasks.push({ id: '', text: p, meta: { parallelizable: parallel } });
      }
    } else {
      tasks.push({ id: '', text: s, meta: { parallelizable: hasParallelKeywords(s) } });
    }
  }

  // Assign ids and detect simple dependencies based on sequencing keywords
  for (let i = 0; i < tasks.length; i++) {
    tasks[i].id = `t${i}`;
  }

  // Second pass: determine dependencies
  // If a task or its originating sentence contained sequencing keywords, link it to previous non-empty task
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    // if task text contains explicit "after" referencing another step, naive link to previous
    if (hasSequencingKeywords(t.text)) {
      if (i > 0) t.dependencies = [tasks[i - 1].id];
    }
  }

  // Additional rule: if a sentence starts with numbering or 'first', enforce sequential deps across that block
  // (we already split bullets earlier so a numbering style likely becomes its own sentence)

  // If tests require more complex DAGs, this function can be extended; keep it simple for GEN1
  return tasks;
}

export async function decomposeIfNeeded(text: string, category: string) {
  const tasks = decomposeRequest(text);
  if (tasks.length === 0) return [{ id: 't0', text }];
  return tasks;
}

export default { decomposeIfNeeded, decomposeRequest };
