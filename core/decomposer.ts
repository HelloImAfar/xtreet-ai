export async function decomposeIfNeeded(text: string, category: string) {
  // Simple heuristic: if text contains 'and' or multiple sentences, split into subtasks
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1 && !/\band\b/i.test(text)) return [{ id: 't0', text }];

  const tasks = sentences.map((s, i) => ({ id: `t${i}`, text: s }));
  // if still contains 'and' split further
  const extra: Array<{ id: string; text: string }> = [];
  for (const t of tasks) {
    if (/\band\b/i.test(t.text) && t.text.length < 300) {
      const parts = t.text.split(/\band\b/i).map((p) => p.trim()).filter(Boolean);
      parts.forEach((p, idx) => extra.push({ id: `${t.id}.${idx}`, text: p }));
    } else extra.push(t);
  }
  return extra;
}

export default { decomposeIfNeeded };
