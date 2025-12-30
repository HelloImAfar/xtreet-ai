/**
 * core/LLMintentClassifier.ts
 * Xtreet AI — GEN 1
 * PURE LLM INTENT + COMPLEXITY CLASSIFIER (GEMINI)
 */

import logger from './logger';
import type { Category } from '../types';
import type { IntentProfile } from '../types/rex';

import GeminiProvider from './models/gemini/geminiProvider';

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                     */
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

type Complexity = 'trivial' | 'normal' | 'deep';

// GEN 1: single deterministic LLM for intent
const llm = new GeminiProvider();

/* -------------------------------------------------------------------------- */
/* JSON PARSING (DEFENSIVE, LLM-SAFE)                                         */
/* -------------------------------------------------------------------------- */

function safeJSON(text: string): any | null {
  try {
    if (!text || typeof text !== 'string') return null;

    const cleaned = text
      .trim()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* MAIN                                                                       */
/* -------------------------------------------------------------------------- */

export async function analyzeIntentWithLLM(
  text: string
): Promise<IntentProfile> {
  const prompt = `
You are an intent and complexity classification engine.

Your task:
1. Infer the user's intent semantically.
2. Classify the request by required cognitive depth.

Do NOT rely on keywords.
Do NOT assume length equals complexity.
Reason about the minimum depth required to answer WELL.

Complexity definitions:
- trivial: social, reactive, acknowledgements, confirmations, greetings, thanks, simple replies that require no reasoning or creativity.
- normal: standard questions or requests that require explanation, structure or light reasoning.
- deep: requests that require multi-step reasoning, creativity, planning, expertise or high-quality output.

Rules:
- "fast" category is ONLY valid if complexity is trivial.
- If complexity is trivial, category MUST be "fast".
- If complexity is normal or deep, category MUST NOT be "fast".

Return ONLY valid JSON.
No markdown. No explanations. No extra text.

Allowed categories:
${CATEGORIES.join(', ')}

JSON schema:
{
  "intent": "short semantic description",
  "category": "one of the allowed categories",
  "confidence": number between 0 and 1,
  "complexity": "trivial | normal | deep"
}

User input:
"""${text}"""
`.trim();

  logger.info({
    event: 'intent_llm_request',
    provider: 'gemini',
    promptPreview: prompt.slice(0, 200)
  });

  let rawText = '';

  try {
    const res = await llm.execute(prompt, {
      temperature: 0,
      maxTokens: 200
    });

    rawText = res?.text ?? '';

    logger.info({
      event: 'intent_llm_raw_response',
      provider: 'gemini',
      rawText
    });

    if (!rawText) {
      return {
        intent: 'empty_llm_response',
        category: 'other',
        confidence: 0,
        entities: { error: 'EMPTY_RESPONSE_FROM_LLM' }
      };
    }

    const parsed = safeJSON(rawText);

    if (!parsed) {
      return {
        intent: 'invalid_json',
        category: 'other',
        confidence: 0,
        entities: {
          error: 'INVALID_JSON_FROM_LLM',
          rawResponse: rawText
        }
      };
    }

    const complexity: Complexity =
      parsed.complexity === 'trivial' ||
      parsed.complexity === 'normal' ||
      parsed.complexity === 'deep'
        ? parsed.complexity
        : 'normal';

    let category: Category = CATEGORIES.includes(parsed.category)
      ? parsed.category
      : 'other';

    // 🔒 HARD RULE: trivial ⇒ fast
    if (complexity === 'trivial') {
      category = 'fast';
    }

    // 🔒 HARD RULE: non-trivial ⇒ never fast
    if (complexity !== 'trivial' && category === 'fast') {
      category = 'other';
    }

    return {
      intent: parsed.intent ?? 'unknown',
      category,
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      entities: {
        complexity
      }
    };
  } catch (err) {
    logger.error({
      event: 'intent_llm_execution_failed',
      provider: 'gemini',
      error: err instanceof Error ? err.message : String(err),
      rawText
    });

    return {
      intent: 'llm_execution_error',
      category: 'other',
      confidence: 0,
      entities: {
        error: 'LLM_EXECUTION_FAILED'
      }
    };
  }
}

export default {
  analyzeIntentWithLLM
};
