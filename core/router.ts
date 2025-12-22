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
 * 1. STRATEGY is a hard gate
 * 2. Cost / latency only rank inside the same strategic tier
 * 3. Lower score = better
 */
export const defaultScoring: ScoringStrategy = (candidate, task) => {
  const words = task.text.split(/\s+/).filter(Boolean).length;
  const estTokens = Math.max(1, Math.round(words / 4));

  const cost = candidate.costEstimate ?? 1;
  const latency = candidate.latencyEstimateMs ?? 200;

  const practicalScore = cost * estTokens + latency / 100;

  // 🚨 HARD STRATEGIC GATE
  if (!candidate.reason?.startsWith('strategic:')) {
    return 10_000 + practicalScore;
  }

  return practicalScore;
};

export interface RouterOptions {
  scoring?: ScoringStrategy;
  maxCandidates?: number;
}

/* -------------------------------------------------------------------------- */
/*                          CANDIDATE CONSTRUCTION                             */
/* -------------------------------------------------------------------------- */

/**
 * Build base candidates.
 * Router NEVER selects physical models.
 * Logical aliases only.
 */
function buildCandidates(maxCandidates = 4): ModelCandidate[] {
  const providers = getProvidersOrdered();
  const out: ModelCandidate[] = [];

  for (const p of providers) {
    if (!p.enabled) continue;

    const meta = p.meta || {};

    out.push({
      provider: p.name,
      model: 'default',
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

  /* --------------------------- FAST OVERRIDE ------------------------- */
  /**
   * FAST is deterministic.
   * If intent is fast → force LLaMA lane.
   */
  if (intent?.category === 'fast') {
    candidates = candidates.map((c) => {
      if (c.provider !== 'llama') return c;

      return {
        ...c,
        model: 'fast',
        temperature: 0.2,
        reason: 'strategic:fast-lane'
      };
    });
  }

  /* ------------------- STRATEGIC MODEL SELECTION --------------------- */

  try {
    if (intent?.category && intent.category !== 'fast') {
      const strategy = selectStrategicModel(
        intent.category,
        intent.confidence,
        (intent.entities as any)?.complexity ?? 'medium'
      );

      const strategicProviders = [
        strategy.primary.provider,
        ...strategy.fallbacks.map((f) => f.provider)
      ];

      candidates = candidates.map((c) => {
        if (!strategicProviders.includes(c.provider)) return c;

        if (c.provider === strategy.primary.provider) {
          return {
            ...c,
            model: strategy.primary.model,
            temperature: strategy.primary.temperature,
            reason: `strategic:${strategy.reason}`
          };
        }

        const fb = strategy.fallbacks.find(
          (f) => f.provider === c.provider
        );

        return {
          ...c,
          model: fb?.model ?? c.model,
          temperature: strategy.primary.temperature,
          reason: `strategic:${strategy.reason}`
        };
      });
    }
  } catch {
    // strategy failure must NEVER break routing
  }

  /* ------------------------ GLOBAL FAILSAFE -------------------------- */
  /**
   * Ensure at least one strategic candidate always exists.
   * Order:
   * 1. DeepSeek
   * 2. Mistral
   */
  const hasStrategic = candidates.some((c) =>
    c.reason?.startsWith('strategic:')
  );

  if (!hasStrategic) {
    candidates = candidates.map((c) => {
      if (c.provider === 'deepseek') {
        return {
          ...c,
          model: 'default',
          temperature: 0.3,
          reason: 'strategic:failsafe-global'
        };
      }

      if (c.provider === 'mistral') {
        return {
          ...c,
          model: 'default',
          temperature: 0.4,
          reason: 'strategic:failsafe-secondary'
        };
      }

      return c;
    });
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

    if (
      isMulticoreEnabled &&
      (complexity === 'high' || complexity === 'deep')
    ) {
      parallel = true;
    }
  } catch {
    parallel = false;
  }

  /* ----------------------- FINAL DECISION ---------------------------- */

  return {
    taskId: task.id,
    candidates: scored.map((s) => s.c),
    selected,
    parallel
  };
}

export default { routeTask, defaultScoring };
