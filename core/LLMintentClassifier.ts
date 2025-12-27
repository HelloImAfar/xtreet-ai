/**
 * core/LLMintentClassifier.ts
 *
 * GEN 1 — FINAL (ARCHITECTURE ALIGNED)
 */

import type { Category, IntentProfile } from '../types';
import { executeWithFailover } from './retry';

import GeminiProvider from './models/gemini/geminiProvider';
import DeepSeekProvider from './models/deepseek/deepseekProvider';
import MistralProvider from './models/mistral/mistralProvider';

/* -------------------------------------------------------------------------- */
/*                                  CONFIG                                    */
/* -------------------------------------------------------------------------- */

const ALLOWED_CATEGORIES: Category[] = [
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
  new GeminiProvider(),   // cheap / default (free tier aware)
  new DeepSeekProvider(), // reasoning backup
  new MistralProvider()   // last fallback
];

/* -------------------------------------------------------------------------- */
/*                                   PROMPT                                   */
/* -------------------------------------------------------------------------- */

function buildPrompt(text: string): string {
  return `
You are an intent classification engine.

Rules:
- Respond ONLY with valid JSON
- No markdown
- No explanations
- No trailing text

Allowed categories:
${ALLOWED_CATEGORIES.join(', ')}

JSON format:
{
  "category": "<category>",
  "confidence": number between 0 and 1,
  "entities": {
    "complexity": "low" | "medium" | "high"
  }
}

User input:
"""${text}"""
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                              NORMALIZATION                                 */
/* -------------------------------------------------------------------------- */

function normalizeCategory(raw?: string): Category {
  if (!raw) return 'other';

  const c = raw.toLowerCase().trim();

  if (ALLOWED_CATEGORIES.includes(c as Category)) {
    return c as Category;
  }

  if (c.includes('code') || c.includes('program')) return 'code';
  if (c.includes('math') || c.includes('calc')) return 'math';
  if (c.includes('feel') || c.includes('emotion')) return 'emotional';
  if (c.includes('story') || c.includes('create') || c.includes('poem'))
    return 'creative';
  if (c.includes('brand') || c.includes('logo')) return 'branding';
  if (c.includes('image') || c.includes('vision')) return 'vision';
  if (c.includes('news') || c.includes('today')) return 'current';
  if (c.includes('optimize') || c.includes('speed')) return 'efficiency';

  return 'other';
}

function clampConfidence(x: unknown): number {
  if (typeof x !== 'number' || Number.isNaN(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

/* -------------------------------------------------------------------------- */
/*                              CORE LOGIC                                    */
/* -------------------------------------------------------------------------- */

export async function analyzeIntentWithLLM(
  text: string
): Promise<IntentProfile> {
  const prompt = buildPrompt(text);

  try {
    const out = await executeWithFailover(PROVIDERS, prompt, {
      maxTokens: 120, // 👈 reduced for Gemini free
      temperature: 0
    });

    const rawText = out?.result?.text;
    if (!rawText) throw new Error('empty_intent_response');

    let parsed: any;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Gemini free sometimes returns text + JSON
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('invalid_json');
      parsed = JSON.parse(match[0]);
    }

    const category = normalizeCategory(parsed.category);

    return {
      intent: category, // 👈 intent === category (aligned)
      category,
      confidence: clampConfidence(parsed.confidence),
      entities: {
        complexity:
          parsed.entities?.complexity ??
          inferComplexity(text)
      }
    };
  } catch {
    /* ---------------------------- FAILSAFE ---------------------------- */
    const fallbackCategory: Category = 'other';

    return {
      intent: fallbackCategory,
      category: fallbackCategory,
      confidence: 0.3,
      entities: {
        complexity: inferComplexity(text)
      }
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                          COMPLEXITY HEURISTIC                               */
/* -------------------------------------------------------------------------- */

function inferComplexity(text: string): 'low' | 'medium' | 'high' {
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  if (words < 8) return 'low';
  if (words > 40) return 'high';
  return 'medium';
}

export default {
  analyzeIntentWithLLM
};
