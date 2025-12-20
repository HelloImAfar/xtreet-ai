/**
 * core/strategicModelSelector.ts
 *
 * GEN 1:
 * - Selects an ordered execution plan (primary + fallbacks)
 * - Multi-provider aware
 * - Pure, deterministic, testable logic
 *
 * IMPORTANT:
 * - NO model calls
 * - NO provider imports
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
  Category,
  {
    orderedModels: Array<{ provider: string; model: string }>;
    baseTemp: number;
    rationale: string;
  }
> = {
  creative: {
    orderedModels: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'mistral', model: 'mistral-large' }
    ],
    baseTemp: 0.7,
    rationale: 'Creativity benefits from expressive, stylistic models.'
  },

  emotional: {
    orderedModels: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' }
    ],
    baseTemp: 0.6,
    rationale: 'Emotional nuance prefers empathetic language models.'
  },

  code: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'deepseek', model: 'deepseek-coder' },
      { provider: 'qwen', model: 'qwen-max' }
    ],
    baseTemp: 0.1,
    rationale: 'Code requires precision and deterministic reasoning.'
  },

  math: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'deepseek', model: 'deepseek-math' }
    ],
    baseTemp: 0.0,
    rationale: 'Math tasks must be strictly deterministic.'
  },

  vision: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' }
    ],
    baseTemp: 0.2,
    rationale: 'Vision tasks rely on multimodal capability.'
  },

  branding: {
    orderedModels: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'mistral', model: 'mistral-large' }
    ],
    baseTemp: 0.6,
    rationale: 'Brand voice requires controlled creativity.'
  },

  efficiency: {
    orderedModels: [
      { provider: 'qwen', model: 'qwen-max' },
      { provider: 'openai', model: 'gpt-4o-mini' }
    ],
    baseTemp: 0.15,
    rationale: 'Efficiency prioritizes speed and cost.'
  },

  informative: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'claude', model: 'claude-3-sonnet' }
    ],
    baseTemp: 0.25,
    rationale: 'Informative tasks value clarity and accuracy.'
  },

  other: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o-mini' }
    ],
    baseTemp: 0.3,
    rationale: 'Safe default for uncategorized tasks.'
  },

  current: {
    orderedModels: [
      { provider: 'openai', model: 'gpt-4o' }
    ],
    baseTemp: 0.3,
    rationale: 'Current tasks use general-purpose models.'
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
  category: Category,
  intentConfidence?: number,
  taskComplexity: TaskComplexity = 'medium'
): ModelExecutionPlan {
  const strategy = CATEGORY_STRATEGY[category] ?? CATEGORY_STRATEGY.other;

  let temperature = clamp(strategy.baseTemp);

  if (taskComplexity === 'high') temperature -= 0.15;
  if (taskComplexity === 'low') temperature += 0.05;

  if (typeof intentConfidence === 'number') {
    if (intentConfidence > 0.85) temperature -= 0.15;
    if (intentConfidence < 0.4) temperature += 0.15;
  }

  temperature = clamp(Math.round(temperature * 100) / 100);

  const [primaryModel, ...fallbackModels] = strategy.orderedModels;

  return {
    primary: {
      ...primaryModel,
      temperature
    },
    fallbacks: fallbackModels.map((m) => ({
      ...m,
      temperature
    })),
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