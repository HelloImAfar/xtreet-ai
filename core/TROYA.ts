import type {
  DecomposedTask,
  IntentProfile,
  ModelCandidate,
  PipelineContext
} from '@/types/rex';

import { getProvidersOrdered } from './config';

/* -------------------------------------------------------------------------- */
/*                               TROYA v1                                     */
/* -------------------------------------------------------------------------- */
/*
  Intent-aware global fallback.
  Activated ONLY when:
  - strategicModelSelector produced no usable candidates
  - or all strategic + fallbacks failed at execution time

  Ranks providers by quality–cost–latency using provider meta only.
  No mutation of strategic decisions.
*/

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

type QualityWeight = {
  quality: number;
  cost: number;
  latency: number;
};

/* -------------------------------------------------------------------------- */
/*                         INTENT → WEIGHT MAP                                 */
/* -------------------------------------------------------------------------- */
/* MUST stay aligned with strategicModelSelector categories */

const INTENT_WEIGHTS: Record<string, QualityWeight> = {
  creative: { quality: 0.55, cost: 0.2, latency: 0.25 },
  emotional: { quality: 0.55, cost: 0.25, latency: 0.2 },
  branding: { quality: 0.6, cost: 0.2, latency: 0.2 },
  informative: { quality: 0.5, cost: 0.3, latency: 0.2 },
  code: { quality: 0.6, cost: 0.25, latency: 0.15 },
  math: { quality: 0.65, cost: 0.2, latency: 0.15 },
  vision: { quality: 0.55, cost: 0.2, latency: 0.25 },
  fast: { quality: 0.4, cost: 0.4, latency: 0.2 },
  other: { quality: 0.5, cost: 0.25, latency: 0.25 }
};

/* -------------------------------------------------------------------------- */
/*                                  SCORING                                   */
/* -------------------------------------------------------------------------- */

function scoreProvider(
  quality: number,
  cost: number,
  latency: number,
  w: QualityWeight
): number {
  const safeCost = cost > 0 ? cost : 1;
  const safeLatency = latency > 0 ? latency : 300;

  return (
    quality * w.quality +
    (1 / safeCost) * w.cost +
    (1 / safeLatency) * w.latency
  );
}

/* -------------------------------------------------------------------------- */
/*                                TROYA CORE                                  */
/* -------------------------------------------------------------------------- */

export function troyaSelect(
  _task: DecomposedTask,
  intent?: IntentProfile,
  _ctx?: PipelineContext,
  excludedProviders: string[] = []
): ModelCandidate[] {
  const category = intent?.category ?? 'other';
  const weights = INTENT_WEIGHTS[category] ?? INTENT_WEIGHTS.other;

  return getProvidersOrdered()
    .filter((p) => p.enabled)
    .filter((p) => !excludedProviders.includes(p.name))
    .map((p) => {
      const meta = p.meta ?? {};

      const quality = meta.qualityScore ?? 0.7;
      const cost = meta.costPer1k ?? meta.costEstimate ?? 1;
      const latency = meta.latencyMs ?? 300;

      return {
        candidate: {
          provider: p.name,
          model: 'default',
          temperature: meta.defaultTemperature,
          costEstimate: cost,
          latencyEstimateMs: latency,
          reason: 'strategic:troya'
        },
        score: scoreProvider(quality, cost, latency, weights)
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.candidate);
}

export default troyaSelect;