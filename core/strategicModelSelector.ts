/**
 * core/strategicModelSelector.ts
 *
 * GEN 1 — FINAL, QUALITY-CORRECT VERSION
 *
 * - Quality-first, reality-based ordering
 * - Deterministic, testable, clean
 * - No provider imports, no side effects
 */

import type { Category } from '../types';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type TaskComplexity = 'low' | 'medium' | 'high';

export interface ModelChoice {
  provider: string;
  model: string;
  temperature: number;
}

export interface ModelExecutionPlan {
  primary: ModelChoice;
  fallbacks: ModelChoice[];
  reason: string;
}

/* -------------------------------------------------------------------------- */
/*                             CATEGORY STRATEGY                              */
/* -------------------------------------------------------------------------- */

const CATEGORY_STRATEGY: Record<
  Category | 'fast',
  {
    orderedModels: Array<{ provider: string; model: string }>;
    baseTemp: number;
    rationale: string;
  }
> = {
  /* ----------------------------- CREATIVE ----------------------------- */
  creative: {
    orderedModels: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-default' },
      { provider: 'mistral', model: 'mistral-large' }
    ],
    baseTemp: 0.7,
    rationale: 'Deep creativity, symbolism, narrative coherence.'
  },

  /* ----------------------------- EMOTIONAL ----------------------------- */
  emotional: {
    orderedModels: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-default' }
    ],
    baseTemp: 0.6,
    rationale: 'Empathy, emotional depth, human nuance.'
  },

  /* -------------------------------- CODE ------------------------------- */
  code: {
    orderedModels: [
      { provider: 'deepseek', model: 'deepseek-coder' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'qwen', model: 'qwen-max' },
      { provider: 'grok', model: 'grok-default' }
    ],
    baseTemp: 0.05,
    rationale: 'Correctness, reasoning, architecture over speed.'
  },

  /* -------------------------------- MATH ------------------------------- */
  math: {
    orderedModels: [
      { provider: 'deepseek', model: 'deepseek-math' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'grok', model: 'grok-default' }
    ],
    baseTemp: 0.0,
    rationale: 'Deterministic mathematical reasoning.'
  },

  /* ------------------------------- VISION ------------------------------ */
  vision: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-default' },
      { provider: 'mistral', model: 'mistral-large' }
    ],
    baseTemp: 0.2,
    rationale: 'Multimodal perception and image understanding.'
  },

  /* ------------------------------ BRANDING ----------------------------- */
  branding: {
    orderedModels: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-default' },
      { provider: 'mistral', model: 'mistral-large' }
    ],
    baseTemp: 0.55,
    rationale: 'Brand voice consistency, identity, controlled expression.'
  },

  /* ----------------------------- EFFICIENCY ---------------------------- */
  efficiency: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'qwen', model: 'qwen-max' },
      { provider: 'grok', model: 'grok-default' },
      { provider: 'gemini', model: 'gemini-default' }
    ],
    baseTemp: 0.15,
    rationale: 'Speed/cost tradeoff with acceptable quality.'
  },

  /* ---------------------------- INFORMATIVE ---------------------------- */
  informative: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'claude', model: 'claude-3-sonnet' },
      { provider: 'gemini', model: 'gemini-default' }
    ],
    baseTemp: 0.25,
    rationale: 'Clarity, structure, factual accuracy.'
  },

  /* ------------------------------- OTHER ------------------------------- */
  other: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'gemini', model: 'gemini-default' },
      { provider: 'grok', model: 'grok-default' }
    ],
    baseTemp: 0.3,
    rationale: 'Safe general-purpose fallback.'
  },

  /* ------------------------------ CURRENT ------------------------------ */
  current: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-default' }
    ],
    baseTemp: 0.3,
    rationale: 'Most reliable up-to-date general intelligence.'
  },

  /* ------------------------------- FAST -------------------------------- */
  fast: {
    orderedModels: [
      { provider: 'llama', model: 'llama-fast' },
      { provider: 'grok', model: 'grok-default' },
      { provider: 'openai', model: 'gpt-4o-mini' }
    ],
    baseTemp: 0.2,
    rationale: 'Ultra-low latency responses where quality ceiling is acceptable.'
  }
};

/* -------------------------------------------------------------------------- */
/*                                   UTILS                                    */
/* -------------------------------------------------------------------------- */

function clamp(x: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, x));
}

/* -------------------------------------------------------------------------- */
/*                         STRATEGIC MODEL SELECTOR                            */
/* -------------------------------------------------------------------------- */

export function selectStrategicModel(
  category: Category | 'fast',
  intentConfidence?: number,
  taskComplexity: TaskComplexity = 'medium'
): ModelExecutionPlan {
  const strategy = CATEGORY_STRATEGY[category] ?? CATEGORY_STRATEGY.other;

  let temperature = clamp(strategy.baseTemp);

  if (taskComplexity === 'high') temperature -= 0.15;
  if (taskComplexity === 'low') temperature += 0.05;

  if (typeof intentConfidence === 'number') {
    if (intentConfidence > 0.85) temperature -= 0.12;
    if (intentConfidence < 0.4) temperature += 0.12;
  }

  temperature = clamp(Math.round(temperature * 100) / 100);

  const [primary, ...fallbacks] = strategy.orderedModels;

  return {
    primary: { ...primary, temperature },
    fallbacks: fallbacks.map((m) => ({ ...m, temperature })),
    reason: [
      `Category: ${category}`,
      `Complexity: ${taskComplexity}`,
      intentConfidence !== undefined
        ? `IntentConfidence: ${intentConfidence}`
        : 'IntentConfidence: n/a',
      strategy.rationale
    ].join(' | ')
  };
}
