import type {
  DecomposedTask,
  IntentProfile,
  RoutingDecision,
  ModelCandidate,
  PipelineContext
} from '@/types/rex';

import { getProvidersOrdered, getConfig } from './config';
import { selectStrategicModel } from './strategicModelSelector';

/* -------------------------------------------------------------------------- */
/*                                  SCORING                                   */
/* -------------------------------------------------------------------------- */

export type ScoringStrategy = (
  candidate: ModelCandidate,
  task: DecomposedTask,
  intent?: IntentProfile,
  ctx?: PipelineContext
) => number;

/**
 * XTREET GEN 1 SCORING PRINCIPLE
 *
 * 1. Strategic quality defines the tier (cannot be overridden)
 * 2. Cost / latency / size adjust ranking WITHIN the same tier
 * 3. Lower score is better
 */
export const defaultScoring: ScoringStrategy = (candidate, task) => {
  /* ------------------------- STRATEGIC QUALITY ------------------------ */
  // Strong advantage for strategically selected models
  let qualityBias = 1000;

  if (candidate.reason?.startsWith('strategic:')) {
    qualityBias = 0; // primary strategic model
  }

  /* --------------------------- PRACTICAL FACTORS ---------------------- */
  const cost = candidate.costEstimate ?? 1;
  const latency = candidate.latencyEstimateMs ?? 200;

  const words = task.text.split(/\s+/).filter(Boolean).length;
  const estTokens = Math.max(1, Math.round(words / 4));

  const practicalScore =
    cost * estTokens + latency / 100;

  return qualityBias + practicalScore;
};

export interface RouterOptions {
  scoring?: ScoringStrategy;
  maxCandidates?: number;
}

/* -------------------------------------------------------------------------- */
/*                          CANDIDATE CONSTRUCTION                             */
/* -------------------------------------------------------------------------- */

function buildCandidates(maxCandidates = 3): ModelCandidate[] {
  const providers = getProvidersOrdered();
  const out: ModelCandidate[] = [];

  for (const p of providers) {
    if (!p.enabled) continue;

    const meta = p.meta || {};

    out.push({
      provider: p.name,
      model: meta.defaultModel || `${p.name}-default`,
      temperature: meta.defaultTemperature,
      costEstimate: meta.costPer1k || meta.costEstimate,
      latencyEstimateMs: meta.latencyMs,
      reason: 'from-config'
    });

    if (out.length >= maxCandidates) break;
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*                                   ROUTER                                   */
/* -------------------------------------------------------------------------- */

/**
 * Route a single task to providers.
 * - NO provider calls
 * - Deterministic
 * - Quality-first with practical constraints
 */
export function routeTask(
  task: DecomposedTask,
  intent?: IntentProfile,
  ctx?: PipelineContext,
  opts: RouterOptions = {}
): RoutingDecision {
  const cfg = getConfig();
  const scoring = opts.scoring ?? defaultScoring;
  const maxCandidates = opts.maxCandidates ?? 4;

  /* ------------------------- BASE CANDIDATES ------------------------- */

  let candidates = buildCandidates(maxCandidates);

  /* ------------------- STRATEGIC MODEL SELECTION --------------------- */
  /**
   * Defines QUALITY ORDER.
   * This must NEVER be overridden by cost/latency alone.
   */
  try {
    if (intent?.category) {
      const strategy = selectStrategicModel(
        intent.category,
        intent.confidence,
        (intent.entities as any)?.complexity ?? 'medium'
      );

      candidates = candidates.map((c) =>
        c.provider === strategy.primary.provider
          ? {
              ...c,
              model: strategy.primary.model,
              temperature: strategy.primary.temperature,
              reason: `strategic:${strategy.reason}`
            }
          : c
      );
    }
  } catch {
    // Strategy failure must NEVER break routing
  }

  /* ---------------------------- SCORING ------------------------------ */

  const scored = candidates.map((c) => ({
    c,
    score: scoring(c, task, intent, ctx)
  }));

  scored.sort((a, b) => a.score - b.score);

  const selected = scored.length > 0 ? scored[0].c : candidates[0];

  /* --------------------------- PARALLEL ------------------------------ */

  let parallel = false;
  try {
    const features = cfg.features;
    const isMulticoreEnabled = Boolean(features?.multicore);
    const complexity =
      ctx?.request?.meta?.complexity ||
      (intent?.entities as any)?.complexity;

    if (isMulticoreEnabled && (complexity === 'high' || complexity === 'deep')) {
      parallel = true;
    }
  } catch {
    parallel = false;
  }

  /* ----------------------- FINAL DECISION ---------------------------- */

  const decision: RoutingDecision = {
    taskId: task.id,
    candidates: scored.map((s) => s.c), // ordered from best → worst
    selected,
    parallel
  };

  return decision;
}

export default { routeTask, defaultScoring };