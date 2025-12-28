/**
 * core/LLMintentClassifier.ts
 * Xtreet AI — GEN 1
 * PURE LLM INTENT CLASSIFIER
 * (NO KEYWORDS, NO HEURISTICS, NO FALLBACK)
 */

import logger from './logger';
import type { Category } from '../types';
import type { IntentProfile } from '../types/rex';

import DeepSeekProvider from './models/deepseek/deepseekProvider';

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

// GEN 1: single LLM, deterministic, no routing
const llm = new DeepSeekProvider();

/* -------------------------------------------------------------------------- */
/*                              JSON PARSING                                  */
/* -------------------------------------------------------------------------- */

function tryParseJSON(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   MAIN                                     */
/* -------------------------------------------------------------------------- */

export async function analyzeIntentWithLLM(
  text: string
): Promise<IntentProfile> {
  const prompt = `
You are an intent classification engine.

You MUST infer intent from meaning, context, tone and implication.
You MUST NOT rely on keywords.

Return ONLY valid JSON.
NO text.
NO explanation.
NO markdown.

Allowed categories:
${CATEGORIES.join(', ')}

JSON schema:
{
  "intent": "short_semantic_label",
  "category": "one_of_allowed_categories",
  "confidence": number_between_0_and_1,
  "entities": object
}

User input:
"""${text}"""
`.trim();

  let rawText = '';

  try {
    const res = await llm.execute(prompt, {
      temperature: 0,
      maxTokens: 200
    });

    rawText = res?.text ?? '';

    logger.info({
      event: 'intent_llm_raw_response',
      provider: 'deepseek',
      rawText
    });

    const parsed = tryParseJSON(rawText);

    if (!parsed) {
      logger.error({
        event: 'intent_llm_invalid_json',
        provider: 'deepseek',
        rawText
      });

      return {
        intent: 'llm_invalid_json',
        category: 'other',
        confidence: 0,
        entities: {
          error: 'INVALID_JSON_FROM_LLM',
          rawResponse: rawText
        }
      };
    }

    if (!CATEGORIES.includes(parsed.category)) {
      logger.error({
        event: 'intent_llm_invalid_category',
        provider: 'deepseek',
        category: parsed.category,
        rawText
      });

      return {
        intent: parsed.intent ?? 'llm_invalid_category',
        category: 'other',
        confidence: 0,
        entities: {
          error: 'INVALID_CATEGORY_FROM_LLM',
          rawResponse: rawText
        }
      };
    }

    return {
      intent: parsed.intent ?? 'unknown',
      category: parsed.category,
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      entities:
        typeof parsed.entities === 'object' && parsed.entities !== null
          ? parsed.entities
          : {}
    };
  } catch (err) {
    logger.error({
      event: 'intent_llm_execution_failed',
      provider: 'deepseek',
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
