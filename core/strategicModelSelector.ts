/**
 * core/strategicModelSelector.ts
 *
 * GEN 1 — FINAL COHERENT VERSION
 * FAST-safe, router-aligned
 */

import type { Category } from '../types';

export type TaskComplexity = 'low' | 'medium' | 'high';

export interface ModelChoice {
  provider: string;
  model: 'default' | 'fast' | 'strong' | 'code' | 'math';
  temperature: number;
}

export interface ModelExecutionPlan {
  primary: ModelChoice;
  fallbacks: ModelChoice[];
  reason: string;
}

const CATEGORY_STRATEGY: Record<
  Category | 'fast' | 'current' | 'efficiency',
  {
    orderedModels: Array<{ provider: string; model: ModelChoice['model'] }>;
    baseTemp: number;
    rationale: string;
  }
> = {
  creative: {
    orderedModels: [
      { provider: 'claude', model: 'strong' },
      { provider: 'openai', model: 'strong' },
      { provider: 'gemini', model: 'strong' },
      { provider: 'mistral', model: 'default' }
    ],
    baseTemp: 0.7,
    rationale: 'Deep creativity and narrative coherence.'
  },

  emotional: {
    orderedModels: [
      { provider: 'claude', model: 'strong' },
      { provider: 'openai', model: 'strong' },
      { provider: 'gemini', model: 'default' }
    ],
    baseTemp: 0.6,
    rationale: 'Emotional nuance and empathy.'
  },

  code: {
    orderedModels: [
      { provider: 'deepseek', model: 'code' },
      { provider: 'openai', model: 'strong' },
      { provider: 'qwen', model: 'code' }
    ],
    baseTemp: 0.05,
    rationale: 'Correctness and architectural reasoning.'
  },

  math: {
    orderedModels: [
      { provider: 'deepseek', model: 'math' },
      { provider: 'openai', model: 'strong' }
    ],
    baseTemp: 0.0,
    rationale: 'Deterministic mathematical reasoning.'
  },

  vision: {
    orderedModels: [
      { provider: 'openai', model: 'strong' },
      { provider: 'gemini', model: 'strong' }
    ],
    baseTemp: 0.2,
    rationale: 'Multimodal perception.'
  },

  branding: {
    orderedModels: [
      { provider: 'claude', model: 'strong' },
      { provider: 'openai', model: 'strong' },
      { provider: 'gemini', model: 'default' }
    ],
    baseTemp: 0.55,
    rationale: 'Brand identity and controlled expression.'
  },

  informative: {
    orderedModels: [
      { provider: 'openai', model: 'strong' },
      { provider: 'claude', model: 'default' },
      { provider: 'gemini', model: 'default' }
    ],
    baseTemp: 0.25,
    rationale: 'Clarity and factual accuracy.'
  },

  other: {
    orderedModels: [
      { provider: 'openai', model: 'fast' },
      { provider: 'gemini', model: 'default' }
    ],
    baseTemp: 0.3,
    rationale: 'Safe fallback.'
  },

  fast: {
    orderedModels: [
      { provider: 'llama', model: 'fast' },
      { provider: 'openai', model: 'fast' }
    ],
    baseTemp: 0.2,
    rationale: 'Ultra-low latency trivial queries.'
  },

  current: {
    orderedModels: [
      { provider: 'openai', model: 'strong' },
      { provider: 'claude', model: 'default' }
    ],
    baseTemp: 0.3,
    rationale: 'Current events awareness.'
  },

  efficiency: {
    orderedModels: [
      { provider: 'openai', model: 'strong' },
      { provider: 'gemini', model: 'default' }
    ],
    baseTemp: 0.15,
    rationale: 'Cost / speed optimized.'
  }
};

function clamp(x: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, x));
}

export function selectStrategicModel(
  category: Category | 'fast' | 'current' | 'efficiency',
  intentConfidence?: number,
  taskComplexity: TaskComplexity = 'medium'
): ModelExecutionPlan {
  let downgraded: string | null = null;

  if (
    category === 'fast' &&
    (taskComplexity !== 'low' ||
      typeof intentConfidence !== 'number' ||
      intentConfidence < 0.9)
  ) {
    category = 'other';
    downgraded = 'FAST → OTHER';
  }

  if (
    (category === 'current' || category === 'efficiency') &&
    typeof intentConfidence === 'number' &&
    intentConfidence < 0.7
  ) {
    category = 'other';
    downgraded = 'CATEGORY → OTHER';
  }

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
      downgraded ? `Downgrade: ${downgraded}` : null,
      strategy.rationale
    ]
      .filter(Boolean)
      .join(' | ')
  };
}
