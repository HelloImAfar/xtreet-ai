import type { Category } from '../types';

const rules: Array<{ keywords: string[]; category: Category }> = [
  { keywords: ['poem', 'story', 'creative', 'write a song'], category: 'creative' },
  { keywords: ['feel', 'sad', 'anxious', 'help me'], category: 'emotional' },
  { keywords: ['error', 'function', 'class', 'compile', 'stack trace', 'bug'], category: 'code' },
  { keywords: ['image', 'vision', 'photo', 'describe image'], category: 'vision' },
  { keywords: ['today', 'news', 'latest', 'current'], category: 'current' },
  { keywords: ['integral', 'solve', 'equation', 'math', 'calculate'], category: 'math' },
  { keywords: ['brand', 'logo', 'identity'], category: 'branding' },
  { keywords: ['faster', 'optimize', 'efficiency', 'speed'], category: 'efficiency' },
  { keywords: ['what is', 'who is', 'explain', 'information'], category: 'informative' }
];

export async function classify(text: string) {
  const t = text.toLowerCase();
  for (const r of rules) {
    for (const k of r.keywords) {
      if (t.includes(k)) return { category: r.category, confidence: 0.9 };
    }
  }
  return { category: 'other' as Category, confidence: 0.5 };
}

export default { classify };
