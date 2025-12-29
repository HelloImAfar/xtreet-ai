/**
 * core/LLMintentClassifier.ts
 * Xtreet AI — GEN 1
 * PURE LLM INTENT CLASSIFIER (GEMINI)
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
You are an intent classification engine.

Infer intent from meaning, context, tone and implication.
Do NOT rely on keywords.

Return ONLY valid JSON.
No markdown. No explanations. No extra text.

Allowed categories:
${CATEGORIES.join(', ')}

JSON schema:
{
  "intent": "short semantic description",
  "category": "one of the allowed categories",
  "confidence": number between 0 and 1
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
      logger.error({
        event: 'intent_llm_empty_response',
        provider: 'gemini'
      });

      return {
        intent: 'empty_llm_response',
        category: 'other',
        confidence: 0,
        entities: {
          error: 'EMPTY_RESPONSE_FROM_LLM'
        }
      };
    }

    const parsed = safeJSON(rawText);

    if (!parsed) {
      logger.error({
        event: 'intent_llm_invalid_json',
        provider: 'gemini',
        rawText
      });

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

    if (!CATEGORIES.includes(parsed.category)) {
      logger.error({
        event: 'intent_llm_invalid_category',
        provider: 'gemini',
        category: parsed.category,
        rawText
      });

      return {
        intent: parsed.intent ?? 'invalid_category',
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
      entities: {}
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
