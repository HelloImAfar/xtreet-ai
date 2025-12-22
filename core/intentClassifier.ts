import type { RExRequest, IntentProfile, PipelineContext } from '@/types/rex';
import type { Category } from '@/types';
import { classify as simpleCategoryClassifier } from './classifier';

export type IntentRule = (
  text: string,
  ctx?: PipelineContext
) => Partial<IntentProfile> | null;

/** Default rule set (heuristic-based). Replaceable via options. */
const defaultRules: IntentRule[] = [
  /* ------------------------------------------------------------------ */
  /* FAST — ultra simple conversational glue                             */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase().trim();
    const words = t.split(/\s+/).filter(Boolean).length;

    // Hard exclusions — fast must NEVER steal knowledge tasks
    if (
      /\b(write|create|story|poem|code|debug|fix|why|explain|analyze|design|brand|feel|sad|anxious|math|solve|calculate|what|who|where|when|how)\b/.test(
        t
      )
    ) {
      return null;
    }

    // Positive fast signals (pure glue)
    if (
      words <= 2 &&
      /^(hi|hello|hey|yo|ok|okay|yes|no|sure|thanks|thank you|next|continue|go on)$/i.test(
        t
      )
    ) {
      return {
        intent: 'fast_response',
        category: 'fast' as Category,
        confidence: 0.95
      };
    }

    return null;
  },

  /* ------------------------------------------------------------------ */
  /* CODE                                                               */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase();
    if (/\b(error|exception|compile|stack trace|fix my|debug)\b/.test(t)) {
      return {
        intent: 'code_debug',
        category: 'code' as Category,
        confidence: 0.95
      };
    }
    return null;
  },

  /* ------------------------------------------------------------------ */
  /* CREATIVE                                                           */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase();
    if (/\b(poem|story|write a song|creative|compose|lyrics|slogan)\b/.test(t)) {
      return {
        intent: 'creative_writing',
        category: 'creative' as Category,
        confidence: 0.92
      };
    }
    return null;
  },

  /* ------------------------------------------------------------------ */
  /* EMOTIONAL                                                          */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase();
    if (/\b(feel|sad|anxious|depressed|i am|help me)\b/.test(t)) {
      return {
        intent: 'emotional_support',
        category: 'emotional' as Category,
        confidence: 0.9
      };
    }
    return null;
  },

  /* ------------------------------------------------------------------ */
  /* MATH                                                               */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase();
    if (/\b(integral|derivative|solve|calculate|equation|prove|theorem)\b/.test(t)) {
      return {
        intent: 'math',
        category: 'math' as Category,
        confidence: 0.9
      };
    }
    return null;
  },

  /* ------------------------------------------------------------------ */
  /* VISION                                                             */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase();
    if (/\b(image|photo|describe image|vision|analyze image)\b/.test(t)) {
      return {
        intent: 'vision',
        category: 'vision' as Category,
        confidence: 0.9
      };
    }
    return null;
  },

  /* ------------------------------------------------------------------ */
  /* INFORMATIVE                                                        */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase();
    if (/\b(what is|who is|explain|tell me about|information|define)\b/.test(t)) {
      return {
        intent: 'informative',
        category: 'informative' as Category,
        confidence: 0.8
      };
    }
    return null;
  },

  /* ------------------------------------------------------------------ */
  /* SYNTHESIS / OTHER                                                   */
  /* ------------------------------------------------------------------ */
  (text) => {
    const t = text.toLowerCase();
    if (/\b(compare|contrast|pros and cons|analyze|synthesize|summarize)\b/.test(t)) {
      return {
        intent: 'synthesis',
        category: 'other' as Category,
        confidence: 0.85
      };
    }
    return null;
  }
];

function detectDepth(text: string) {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 200 || sentences.length >= 4)
    return { depth: 'deep', complexity: 'high' };
  if (words > 60 || sentences.length >= 2)
    return { depth: 'medium', complexity: 'medium' };
  return { depth: 'shallow', complexity: 'low' };
}

function detectRisk(text: string) {
  const t = text.toLowerCase();
  const high = /\b(bomb|assassinate|kill|illegal|hack into|exploit|poison)\b/;
  const medium = /\b(hate|discriminate|fraud|steal|phish)\b/;
  if (high.test(t)) return { severity: 'high' as const };
  if (medium.test(t)) return { severity: 'medium' as const };
  return { severity: 'low' as const };
}

export async function analyzeIntent(
  req: RExRequest,
  opts?: { rules?: IntentRule[]; ctx?: PipelineContext }
): Promise<IntentProfile> {
  const text = req.text || '';
  const rules = opts?.rules ?? defaultRules;

  for (const r of rules) {
    try {
      const res = r(text, opts?.ctx);
      if (res && (res.intent || res.category)) {
        const depth = detectDepth(text);
        const risk = detectRisk(text);
        return {
          intent: res.intent ?? 'unknown',
          category: res.category as Category,
          confidence: res.confidence ?? 0.75,
          risk,
          entities: { depth: depth.depth, complexity: depth.complexity }
        };
      }
    } catch {}
  }

  const cat = await simpleCategoryClassifier(text);
  const depth = detectDepth(text);
  const risk = detectRisk(text);

  return {
    intent: 'unknown',
    category: cat.category,
    confidence: cat.confidence,
    risk,
    entities: { depth: depth.depth, complexity: depth.complexity }
  };
}

export default { analyzeIntent };
