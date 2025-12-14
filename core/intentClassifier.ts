import type { RExRequest, IntentProfile, PipelineContext } from '@/types/rex';
import type { Category } from '@/types';
import { classify as simpleCategoryClassifier } from './classifier';

export type IntentRule = (
  text: string,
  ctx?: PipelineContext
) => Partial<IntentProfile> | null;

/** Default rule set (heuristic-based). Replaceable via options. */
const defaultRules: IntentRule[] = [
  (text) => {
    const t = text.toLowerCase();
    if (/\b(error|exception|compile|stack trace|fix my|debug)\b/.test(t)) {
      return { intent: 'code_debug', category: 'code' as Category, confidence: 0.95 };
    }
    return null;
  },
  (text) => {
    const t = text.toLowerCase();
    if (/\b(poem|story|write a song|creative|compose|lyrics|slogan)\b/.test(t)) {
      return { intent: 'creative_writing', category: 'creative' as Category, confidence: 0.92 };
    }
    return null;
  },
  (text) => {
    const t = text.toLowerCase();
    if (/\b(feel|sad|anxious|depressed|i am|help me)\b/.test(t)) {
      return { intent: 'emotional_support', category: 'emotional' as Category, confidence: 0.9 };
    }
    return null;
  },
  (text) => {
    const t = text.toLowerCase();
    if (/\b(integral|derivative|solve|calculate|equation|prove|theorem)\b/.test(t)) {
      return { intent: 'math', category: 'math' as Category, confidence: 0.9 };
    }
    return null;
  },
  (text) => {
    const t = text.toLowerCase();
    if (/\b(image|photo|describe image|vision|analyze image)\b/.test(t)) {
      return { intent: 'vision', category: 'vision' as Category, confidence: 0.9 };
    }
    return null;
  },
  (text) => {
    const t = text.toLowerCase();
    if (/\b(what is|who is|explain|tell me about|information|define)\b/.test(t)) {
      return { intent: 'informative', category: 'informative' as Category, confidence: 0.8 };
    }
    return null;
  },
  (text) => {
    const t = text.toLowerCase();
    if (/\b(compare|contrast|pros and cons|analyze|synthesize|summarize)\b/.test(t)) {
      return { intent: 'synthesis', category: 'other' as Category, confidence: 0.85 };
    }
    return null;
  }
];

function detectDepth(text: string) {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 200 || sentences.length >= 4) return { depth: 'deep', complexity: 'high' };
  if (words > 60 || sentences.length >= 2) return { depth: 'medium', complexity: 'medium' };
  return { depth: 'shallow', complexity: 'low' };
}

function detectRisk(text: string) {
  const t = text.toLowerCase();
  const high = /\b(bomb|assassinate|kill|illegal|hack into|exploit|poison)\b/;
  const medium = /\b(hate|discriminate|fraud|steal|phish)\b/;
  if (high.test(t)) return { severity: 'high' as const, reasons: ['potentially violent or illegal'] };
  if (medium.test(t)) return { severity: 'medium' as const, reasons: ['potentially abusive or fraudulent'] };
  return { severity: 'low' as const };
}

/**
 * Analyze a RExRequest and produce an IntentProfile.
 * Logic is purely heuristic and replaceable via `rules` option.
 */
export function analyzeIntent(
  req: RExRequest,
  opts?: { rules?: IntentRule[]; ctx?: PipelineContext }
): IntentProfile {
  const text = req.text || '';
  const rules = opts?.rules ?? defaultRules;

  // Run rules
  for (const r of rules) {
    try {
      const res = r(text, opts?.ctx);
      if (res && (res.intent || res.category)) {
        const depth = detectDepth(text);
        const risk = detectRisk(text);
        const intentProfile: IntentProfile = {
          intent: res.intent ?? 'unknown',
          category: (res.category as Category) ?? ('other' as Category),
          confidence: res.confidence ?? 0.75,
          risk: risk,
          entities: { depth: depth.depth, complexity: depth.complexity }
        };
        return intentProfile;
      }
    } catch (e) {
      // ignore rule errors, continue
      // rules are replaceable; a broken rule should not break classifier
    }
  }

  // Fallback: use simple category classifier to get category and build profile
  const cat = simpleCategoryClassifier(text);
  const depth = detectDepth(text);
  const risk = detectRisk(text);

  const intentProfile: IntentProfile = {
    intent: 'unknown',
    category: cat.category,
    confidence: cat.confidence,
    risk,
    entities: { depth: depth.depth, complexity: depth.complexity }
  };
  return intentProfile;
}

export default { analyzeIntent };
