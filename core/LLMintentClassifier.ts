/**
 * core/LLMintentClassifier.ts
 * Xtreet AI — GEN 1
 */

import { executeWithFailover } from './retry';
import logger from './logger';

import type { Category } from '../types';
import type { IntentProfile } from '../types/rex';

import DeepSeekProvider from './models/deepseek/deepseekProvider';
import GeminiProvider from './models/gemini/geminiProvider';
import MistralProvider from './models/mistral/mistralProvider';

/* -------------------------------------------------------------------------- */
/*                                   CONFIG                                   */
/* -------------------------------------------------------------------------- */

const CATEGORIES: Category[] = [
  'creative',
  'emotional',
  'code',
  'math',
  'vision',
  'branding',
  'informative',
  'current',
  'efficiency',
  'fast',
  'other'
];

const PROVIDERS = [
  new DeepSeekProvider(),
  new GeminiProvider(),
  new MistralProvider()
];

/* -------------------------------------------------------------------------- */
/*                              UTILITIES                                     */
/* -------------------------------------------------------------------------- */

function normalizeCategory(raw: any): Category {
  if (typeof raw !== 'string') return 'other';
  const c = raw.toLowerCase().trim();

  if (CATEGORIES.includes(c as Category)) return c as Category;

  if (c.includes('code')) return 'code';
  if (c.includes('math')) return 'math';
  if (c.includes('poem') || c.includes('story') || c.includes('creative'))
    return 'creative';
  if (c.includes('emotion') || c.includes('feel')) return 'emotional';
  if (c.includes('brand')) return 'branding';
  if (c.includes('image') || c.includes('vision')) return 'vision';
  if (c.includes('news') || c.includes('today')) return 'current';
  if (c.includes('optimize') || c.includes('efficient')) return 'efficiency';

  return 'other';
}

function clampConfidence(x: any): number {
  if (typeof x !== 'number' || isNaN(x)) return 0.5;
  return Math.max(0.1, Math.min(1, x));
}

function tryParseJSON(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// Heuristics removed: rely on LLMs to decide categories. If LLMs fail to return
// valid JSON, a minimal safe fallback is returned by the caller.

/* -------------------------------------------------------------------------- */
/*                               FAST GUARD                                   */
/* -------------------------------------------------------------------------- */

function fastGuard(text: string): IntentProfile | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (
    t.length <= 3 ||
    /^(hi|hello|hey|ok|okay|thanks|thank you|next|continue)$/i.test(t)
  ) {
    return {
      intent: 'fast_response',
      category: 'fast',
      confidence: 0.98,
      entities: { complexity: 'low' }
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*                               MAIN                                         */
/* -------------------------------------------------------------------------- */

export async function analyzeIntentWithLLM(
  text: string
): Promise<IntentProfile> {
  const fast = fastGuard(text);
  if (fast) return fast;

  const prompt = `You are an intent classification engine. You must infer the user's high-level intent from the input text and map it to exactly one of these categories: ${CATEGORIES.join(', ')}.

Rules:
- Return ONLY a single valid JSON object (no surrounding text, no markdown, no explanation).
- The JSON must include: {"intent": string, "category": string, "confidence": number, "entities": object}
- The "category" value MUST be exactly one of: ${CATEGORIES.join(', ')}.
- "confidence" is a number between 0 and 1 representing your certainty.
- Never output multiple categories; choose the single best category even when the input is short or ambiguous.
- Do NOT rely on the presence of specific keywords; infer meaning from context and paraphrase.

Multilingual short examples (input → JSON):
Input: "No compila mi proyecto en TypeScript, sale un error de sintaxis"
Output: {"intent":"code_error","category":"code","confidence":0.95}

Input: "Hazme un guion para un video viral"
Output: {"intent":"create_video_script","category":"creative","confidence":0.9}

Input: "¿Qué pasó hoy en las noticias sobre tecnología?"
Output: {"intent":"news_update","category":"current","confidence":0.85}

Input: "Resume este texto en una frase"
Output: {"intent":"summarize","category":"informative","confidence":0.9}

Input: "¿Cómo puedo optimizar el rendimiento de mi web?"
Output: {"intent":"optimize_performance","category":"efficiency","confidence":0.86}

Input: "Tengo que resolver una integral y no sé cómo"
Output: {"intent":"math_problem","category":"math","confidence":0.9}

Input: "Quiero que me ayudes a escribir un slogan para mi marca"
Output: {"intent":"brand_slogan","category":"branding","confidence":0.88}

Now classify the user input below and return JSON only.
User input:
"""${text}"""`;

  try {
    // Call all providers concurrently (we trust providers more than heuristics)
    const calls = PROVIDERS.map(async (p) => {
      try {
        const res = await p.execute(prompt, { maxTokens: 200, temperature: 0 });
        return { provider: (p as any).id ?? 'unknown', text: res.text ?? '', tokens: res.tokensUsed ?? 0 };
      } catch (e: any) {
        return { provider: (p as any).id ?? 'unknown', text: '', error: String(e) };
      }
    });

    const settled = await Promise.all(calls);

    logger.info({ event: 'intent_llm_raw_multi', raw: settled.map((s) => ({ provider: s.provider, text: (s as any).text?.slice?.(0, 400) })) });

    // Parse results and pick best
    const candidates = settled
      .map((s) => {
        const txt = (s as any).text || '';
        const parsed = tryParseJSON(txt);
        if (!parsed) return null;
        const cat = normalizeCategory(parsed.category);
        const conf = clampConfidence(parsed.confidence ?? 0.6);
        const intent = parsed.intent ?? cat;
        return { provider: s.provider, intent, category: cat, confidence: conf, entities: parsed.entities ?? {} };
      })
      .filter((x): x is { provider: string; intent: string; category: Category; confidence: number; entities: any } => !!x);

    // Prefer highest confidence; tie-break by provider order in PROVIDERS
    const providerOrder = PROVIDERS.map((p) => (p as any).id ?? 'unknown');
    candidates.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const ia = providerOrder.indexOf(a.provider);
      const ib = providerOrder.indexOf(b.provider);
      return ia - ib;
    });

    const best = candidates[0];

    if (!best) {
      // No provider produced valid JSON — attempt a final failover LLM call
      const retryPrompt = `Classify the following user input into exactly one of: ${CATEGORIES.join(', ')}. Return ONLY a single valid JSON object with fields {"intent", "category", "confidence", "entities"}. User input:\n"""${text}"""`;
      try {
        const out2 = await executeWithFailover(PROVIDERS, retryPrompt, { maxTokens: 150, temperature: 0 });
        const raw2 = out2.result?.text;
        if (raw2) {
          const parsed2 = tryParseJSON(raw2);
          if (parsed2) {
            const cat = normalizeCategory(parsed2.category);
            const conf = clampConfidence(parsed2.confidence ?? 0.6);
            const intent = parsed2.intent ?? cat;
            return { intent, category: cat, confidence: conf, entities: parsed2.entities ?? {} };
          }
        }
      } catch (e) {
        // fall through to safe fallback
      }

      // Final safe fallback if no LLM returned valid JSON
      return { intent: 'unknown', category: 'other', confidence: 0.35, entities: {} };
    }

    // TRUST LLM: accept best provider's category/intent/confidence as authoritative
    return { intent: best.intent, category: best.category, confidence: best.confidence, entities: best.entities };
  } catch (err) {
    logger.warn('intent_classifier_fallback', { error: err instanceof Error ? err.message : String(err), input: text });
    // Try a final LLM failover before returning a safe default
    const retryPrompt = `Classify the following user input into exactly one of: ${CATEGORIES.join(', ')}. Return ONLY a single valid JSON object with fields {"intent", "category", "confidence", "entities"}. User input:\n"""${text}"""`;
    try {
      const out2 = await executeWithFailover(PROVIDERS, retryPrompt, { maxTokens: 150, temperature: 0 });
      const raw2 = out2.result?.text;
      if (raw2) {
        const parsed2 = tryParseJSON(raw2);
        if (parsed2) {
          const cat = normalizeCategory(parsed2.category);
          const conf = clampConfidence(parsed2.confidence ?? 0.6);
          const intent = parsed2.intent ?? cat;
          return { intent, category: cat, confidence: conf, entities: parsed2.entities ?? {} };
        }
      }
    } catch (_) {
      // ignore
    }

    return { intent: 'unknown', category: 'other', confidence: 0.35, entities: {} };
  }
}

export default {
  analyzeIntentWithLLM
};
