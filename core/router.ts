import type {
  DecomposedTask,
  IntentProfile,
  RoutingDecision,
  ModelCandidate,
  PipelineContext
} from '@/types/rex';

import { getProvidersOrdered, getConfig } from './config';
import providerRegistry from './providerRegistry';
import { selectStrategicModel } from './strategicModelSelector';

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

type Depth = 'trivial' | 'normal' | 'deep';
type TaskComplexity = 'low' | 'medium' | 'high';

/* -------------------------------------------------------------------------- */
/*                         DEPTH → COMPLEXITY MAP                              */
/* -------------------------------------------------------------------------- */
/* GEN 1 ADAPTER — do NOT remove (GEN 2 may unify this) */

function mapDepthToTaskComplexity(depth: Depth): TaskComplexity {
  switch (depth) {
    case 'trivial':
      return 'low';
    case 'normal':
      return 'medium';
    case 'deep':
      return 'high';
    default:
      return 'medium';
  }
}

/* -------------------------------------------------------------------------- */
/*                                  SCORING                                   */
/* -------------------------------------------------------------------------- */

export type ScoringStrategy = (
  candidate: ModelCandidate,
  task: DecomposedTask,
  intent?: IntentProfile,
  ctx?: PipelineContext
) => number;

export const defaultScoring: ScoringStrategy = (candidate, task) => {
  const words = task.text.split(/\s+/).filter(Boolean).length;
  const estTokens = Math.max(1, Math.round(words / 4));

  const cost = candidate.costEstimate ?? 1;
  const latency = candidate.latencyEstimateMs ?? 200;

  const practicalScore = cost * estTokens + latency / 100;

  if (!candidate.reason?.startsWith('strategic:')) {
    return 5_000 + practicalScore;
  }

  return practicalScore;
};

/* -------------------------------------------------------------------------- */
/*                          CANDIDATE CONSTRUCTION                             */
/* -------------------------------------------------------------------------- */

function buildCandidates(maxCandidates = 4): ModelCandidate[] {
  const providers = getProvidersOrdered();
  const out: ModelCandidate[] = [];

  for (const p of providers) {
    if (!p.enabled) continue;
    if (!providerRegistry.isKnownProvider(p.name)) continue;

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
  opts: { scoring?: ScoringStrategy; maxCandidates?: number } = {}
): RoutingDecision {
  const cfg = getConfig();
  const scoring = opts.scoring ?? defaultScoring;
  const maxCandidates = opts.maxCandidates ?? 4;

  const depth: Depth =
    (intent?.entities as any)?.complexity === 'trivial'
      ? 'trivial'
      : (intent?.entities as any)?.complexity === 'deep'
      ? 'deep'
      : 'normal';

  const taskComplexity = mapDepthToTaskComplexity(depth);

  /* ------------------------------------------------------------------ */
  /* 🚀 FAST — HARD EXIT                                                 */
  /* ------------------------------------------------------------------ */

  if (
    intent?.category === 'fast' &&
    intent.confidence >= 0.9 &&
    taskComplexity === 'low'
  ) {
    const strategy = selectStrategicModel(
      'fast',
      1,
      taskComplexity
    );

    const selected: ModelCandidate = {
      provider: strategy.primary.provider,
      model: strategy.primary.model,
      temperature: strategy.primary.temperature,
      reason: `strategic:${strategy.reason}`
    };

    return {
      taskId: task.id,
      candidates: [selected],
      selected,
      parallel: false
    };
  }

  /* ------------------------- BASE CANDIDATES ------------------------- */

  let candidates = buildCandidates(maxCandidates);

  /* ------------------- STRATEGIC MODEL SELECTION --------------------- */

  try {
    if (intent?.category) {
      const strategy = selectStrategicModel(
        intent.category,
        intent.confidence,
        taskComplexity
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
    // routing must NEVER break
  }

  /* ------------------------ GLOBAL FAILSAFE -------------------------- */

  const hasStrategic = candidates.some((c) =>
    c.reason?.startsWith('strategic:')
  );

  if (!hasStrategic) {
    candidates = candidates.map((c) => {
      if (c.provider === 'deepseek') {
        return { ...c, reason: 'strategic:failsafe-global' };
      }
      if (c.provider === 'mistral') {
        return { ...c, reason: 'strategic:failsafe-secondary' };
      }
      return c;
    });
  }

  /* ---------------------------- SCORING ------------------------------ */

  const scored = candidates
    .map((c) => ({
      c,
      score: scoring(c, task, intent, ctx)
    }))
    .sort((a, b) => a.score - b.score);

  const selected = scored[0]?.c;

  /* --------------------------- PARALLEL ------------------------------ */

  let parallel = false;

  try {
    if (
      cfg.features?.multicore &&
      (taskComplexity === 'high')
    ) {
      parallel = true;
    }
  } catch {}

  return {
    taskId: task.id,
    candidates: scored.map((s) => s.c),
    selected,
    parallel
  };
}

export default { routeTask, defaultScoring };
