import type {
  DecomposedTask,
  IntentProfile,
  RoutingDecision,
  ModelCandidate,
  PipelineContext
} from '@/types/rex';
import { getProvidersOrdered, getConfig } from './config';

export type ScoringStrategy = (candidate: ModelCandidate, task: DecomposedTask, intent?: IntentProfile, ctx?: PipelineContext) => number;

/**
 * Default scoring strategy balances priority, estimated cost and latency.
 * Lower score is better.
 */
export const defaultScoring: ScoringStrategy = (candidate, task) => {
  // simple heuristics: cost (lower better), priority (lower better), latencyEstimateMs (lower better)
  const cost = candidate.costEstimate ?? 1;
  const priority = candidate.priority ?? 100;
  const latency = candidate.latencyEstimateMs ?? 200;

  // estimate tokens roughly from task length (words/4)
  const words = task.text.split(/\s+/).filter(Boolean).length;
  const estTokens = Math.max(1, Math.round(words / 4));

  // normalized score
  const score = cost * estTokens * 1.0 + priority * 0.5 + latency / 100.0;
  return score;
};

export interface RouterOptions {
  scoring?: ScoringStrategy;
  maxCandidates?: number;
}

/**
 * Build ModelCandidate list from provider configs. Non-invasive, no external calls.
 */
function buildCandidates(maxCandidates = 3): ModelCandidate[] {
  const providers = getProvidersOrdered();
  const out: ModelCandidate[] = [];
  for (const p of providers) {
    if (!p.enabled) continue;
    // meta may include defaults for cost/latency
    const meta = p.meta || {};
    out.push({
      provider: p.name,
      model: meta.defaultModel || `${p.name}-default`,
      temperature: meta.defaultTemperature,
      costEstimate: meta.costPer1k || meta.costEstimate || undefined,
      latencyEstimateMs: meta.latencyMs || undefined,
      reason: 'from-config'
    });
    if (out.length >= maxCandidates) break;
  }
  return out;
}

/**
 * Route a single task to providers. Returns a RoutingDecision object.
 * Logic is strategy-driven and replaceable; no provider calls are made here.
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

  // Build candidates from configured providers
  const candidates = buildCandidates(maxCandidates);

  // Score candidates
  const scored = candidates.map((c) => ({ c, score: scoring(c, task, intent, ctx) }));
  scored.sort((a, b) => a.score - b.score);

  // Select top candidate as primary
  const selected = scored.length > 0 ? scored[0].c : candidates[0];

  // Decide whether to parallelize: enable multicore for deep/complex tasks or if feature flag set
  let parallel = false;
  try {
    const features = cfg.features;
    const isMulticoreEnabled = Boolean(features && (features.multicore as boolean));
    const complexity = (ctx?.request?.meta?.complexity || (intent?.entities as any)?.complexity) as string | undefined;
    if (isMulticoreEnabled && (complexity === 'high' || complexity === 'deep')) parallel = true;
  } catch (e) {
    parallel = false;
  }

  // Build final RoutingDecision; include fallback chain in candidates order
  const decision: RoutingDecision = {
    taskId: task.id,
    candidates: scored.map((s) => s.c),
    selected,
    parallel
  };

  return decision;
}

export default { routeTask, defaultScoring };
