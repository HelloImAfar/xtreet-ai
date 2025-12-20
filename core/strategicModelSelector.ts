/**
 * core/strategicModelSelector.ts
 *
 * GEN 1 — Strategic model selection
 *
 * Responsibilities:
 * - Decide WHICH provider + model to use per task
 * - Fully deterministic and testable
 * - NO API calls
 * - NO provider imports
 *
 * GEN 2 will extend this with:
 * - multi-model ensembles
 * - DeepSeek review layer
 * - cost / latency telemetry
 */

import type { Category } from '../types';

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

export type TaskComplexity = 'low' | 'medium' | 'high';

export type ProviderId =
  | 'openai'
  | 'claude'
  | 'gemini'
  | 'grok'
  | 'llama'
  | 'mistral'
  | 'qwen';

export interface ModelCandidate {
  provider: ProviderId;
  model: string;
}

export interface ModelSelection {
  provider: ProviderId;
  model: string;
  temperature: number;
  reason: string;
}

/* -------------------------------------------------------------------------- */
/*                                  FALLBACK                                  */
/* -------------------------------------------------------------------------- */

const FALLBACK: ModelSelection = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  reason: 'Fallback: safe default (GEN 1)',
};

/* -------------------------------------------------------------------------- */
/*                          CATEGORY → MODEL STRATEGY                          */
/* -------------------------------------------------------------------------- */

const CATEGORY_PREFERENCES: Record<
  Category,
  {
    candidates: ModelCandidate[];
    baseTemp: number;
    rationale: string;
  }
> = {
  creative: {
    candidates: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-1.5-pro' },
    ],
    baseTemp: 0.7,
    rationale: 'Creative tasks benefit from expressive and stylistic models.',
  },

  emotional: {
    candidates: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
    ],
    baseTemp: 0.6,
    rationale: 'Empathy and nuance are best handled by conversational models.',
  },

  code: {
    candidates: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'qwen', model: 'qwen-coder' },
      { provider: 'mistral', model: 'mistral-large' },
    ],
    baseTemp: 0.1,
    rationale: 'Code requires precision and strong reasoning.',
  },

  math: {
    candidates: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'mistral', model: 'mistral-large' },
    ],
    baseTemp: 0.0,
    rationale: 'Math tasks demand deterministic reasoning.',
  },

  vision: {
    candidates: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-1.5-pro' },
    ],
    baseTemp: 0.2,
    rationale: 'Vision tasks require multimodal-capable models.',
  },

  branding: {
    candidates: [
      { provider: 'claude', model: 'claude-3-opus' },
      { provider: 'openai', model: 'gpt-4o' },
    ],
    baseTemp: 0.6,
    rationale: 'Brand voice needs controlled creativity.',
  },

  efficiency: {
    candidates: [
      { provider: 'mistral', model: 'mistral-small' },
      { provider: 'llama', model: 'llama-3-8b' },
    ],
    baseTemp: 0.15,
    rationale: 'Efficiency favors speed and cost-effective models.',
  },

  informative: {
    candidates: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'gemini', model: 'gemini-1.5-pro' },
    ],
    baseTemp: 0.25,
    rationale: 'Informative tasks prioritize clarity and accuracy.',
  },

  other: {
    candidates: [{ provider: 'openai', model: 'gpt-4o-mini' }],
    baseTemp: 0.3,
    rationale: 'Safe default for uncategorized tasks.',
  },
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
): ModelSelection {
  try {
    const prefs = CATEGORY_PREFERENCES[category];
    if (!prefs) return FALLBACK;

    const confidence =
      typeof intentConfidence === 'number'
        ? clamp(intentConfidence, 0, 1)
        : undefined;

    /* ------------------------- MODEL PICKING ------------------------- */
    let index = 0;

    if (taskComplexity === 'low' && prefs.candidates.length > 1) {
      index = 1;
    }

    if (confidence !== undefined) {
      if (confidence < 0.35 && prefs.candidates.length > 1) {
        index = Math.min(index + 1, prefs.candidates.length - 1);
      }
      if (confidence > 0.9) {
        index = 0;
      }
    }

    const chosen =
      prefs.candidates[Math.min(index, prefs.candidates.length - 1)];

    /* ----------------------- TEMPERATURE ----------------------- */
    let temperature = clamp(prefs.baseTemp);

    if (taskComplexity === 'high') temperature -= 0.15;
    if (taskComplexity === 'low') temperature += 0.05;

    if (confidence !== undefined) {
      if (confidence > 0.85) temperature -= 0.15;
      if (confidence < 0.4) temperature += 0.15;
    }

    temperature = clamp(Math.round(temperature * 100) / 100);

    return {
      provider: chosen.provider,
      model: chosen.model,
      temperature,
      reason: [
        `Category=${category}`,
        `Provider=${chosen.provider}`,
        `Model=${chosen.model}`,
        `Complexity=${taskComplexity}`,
        confidence !== undefined
          ? `IntentConfidence=${confidence}`
          : 'IntentConfidence=n/a',
        prefs.rationale,
      ].join(' | '),
    };
  } catch (err) {
    return {
      ...FALLBACK,
      reason: `Selector error: ${(err as Error).message}`,
    };
  }
}
