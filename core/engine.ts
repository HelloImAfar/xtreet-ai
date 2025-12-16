import LRU from 'lru-cache';
import { decomposeIfNeeded } from './decomposer';
import { assemble } from './assembler';
import logger from './logger';
import type { Category, MessageRequest } from '../types';
import { analyzeIntent } from './intentClassifier';
import { routeTask } from './router';
import { runAgents } from './agents/agent';
import LogicalAuditorAgent from './agents/logicalAuditor';
import StyleRefinementAgent from './agents/styleRefinement';
import CostOptimizationAgent from './agents/costOptimization';
import { executeWithFailover } from './retry';
import { verifyPipeline } from './verifier';
import { runSecurityChecks } from './security';
import { getMemory, upsertMemory } from './memory';
import { CostController } from './costController';
import OpenAIProvider from './models/openaiProvider';
import MockProvider from './models/mockProvider';

// In-memory cache for responses (LRU, max 100 entries, 1h TTL)
const cache = new LRU<string, any>({
  max: 100,
  ttl: 1000 * 60 * 60
});

// Rate limiter: token bucket per IP (in-memory for dev)
const rateLimitBuckets = new Map<string, { tokens: number; lastRefill: number }>();
const RATE_LIMIT_MAX_TOKENS = 10; // 10 req/min
const RATE_LIMIT_REFILL_MS = 60000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX_TOKENS, lastRefill: now };
    rateLimitBuckets.set(ip, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / RATE_LIMIT_REFILL_MS) * RATE_LIMIT_MAX_TOKENS;
  bucket.tokens = Math.min(RATE_LIMIT_MAX_TOKENS, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens--;
    return true;
  }
  return false;
}

// Category → model hint (router decides provider)
export function selectModel(category: Category): { model: string; temperature: number } {
  switch (category) {
    case 'creative':
      return { model: 'gpt-4o', temperature: 0.9 };
    case 'emotional':
      return { model: 'gpt-4o-mini', temperature: 0.7 };
    case 'code':
      return { model: 'gpt-4o', temperature: 0.1 };
    case 'vision':
      return { model: 'gpt-4o', temperature: 0.5 };
    case 'math':
      return { model: 'gpt-4o', temperature: 0.2 };
    case 'branding':
      return { model: 'gpt-4o', temperature: 0.7 };
    case 'efficiency':
      return { model: 'gpt-4o-mini', temperature: 0.3 };
    default:
      return { model: 'gpt-4o', temperature: 0.6 };
  }
}

export interface EngineResult {
  ok: boolean;
  category: Category;
  modelPlan: string[];
  response: string;
  tokensUsed: number;
  estimatedCost: number;
  errors?: string[];
}

export async function handleMessage(
  req: MessageRequest,
  clientIp: string
): Promise<EngineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const ctx: any = { request: req };

  try {
    /* RATE LIMIT */
    logger.logPipelineStep(req.userId, 'rate_limit', 'start', { ip: clientIp });
    if (!checkRateLimit(clientIp)) {
      logger.logPipelineStep(req.userId, 'rate_limit', 'error');
      return {
        ok: false,
        category: 'other',
        modelPlan: [],
        response: 'Rate limit exceeded.',
        tokensUsed: 0,
        estimatedCost: 0,
        errors: ['rate_limit']
      };
    }
    logger.logPipelineStep(req.userId, 'rate_limit', 'end');

    /* CACHE */
    const cacheKey = `msg:${req.userId}:${req.text.slice(0, 200)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info('Cache hit', { cacheKey });
      return cached;
    }

    /* SECURITY (PRE) */
    logger.logPipelineStep(req.userId, 'security', 'start');
    const preSec = runSecurityChecks(ctx);
    if (preSec.some((s: any) => s.severity === 'high')) {
      return {
        ok: false,
        category: 'other',
        modelPlan: [],
        response: 'Request blocked by security policy.',
        tokensUsed: 0,
        estimatedCost: 0,
        errors: ['security_block']
      };
    }
    logger.logPipelineStep(req.userId, 'security', 'end');

    /* MEMORY LOAD */
    logger.logPipelineStep(req.userId, 'memory.load', 'start');
    ctx.memorySnapshot = await getMemory(req.userId);
    logger.logPipelineStep(req.userId, 'memory.load', 'end');

    /* INTENT */
    logger.logPipelineStep(req.userId, 'classify', 'start');
    const intent = analyzeIntent(req as any);
    ctx.intent = intent;
    logger.logPipelineStep(req.userId, 'classify', 'end');

    /* DECOMPOSE */
    logger.logPipelineStep(req.userId, 'decompose', 'start');
    const tasks = await decomposeIfNeeded(req.text, intent.category);
    ctx.tasks = tasks;
    logger.logPipelineStep(req.userId, 'decompose', 'end');

    /* AGENTS */
    logger.logPipelineStep(req.userId, 'agents', 'start');
    const agents = [LogicalAuditorAgent, StyleRefinementAgent, CostOptimizationAgent];
    ctx.agentOutputs = {};
    for (const t of tasks) {
      const outs = await runAgents(agents, { taskId: t.id, text: t.text, ctx });
      ctx.agentOutputs[t.id] = outs;
      for (const o of outs) {
        if (o.text && o.text !== t.text) t.text = o.text;
      }
    }
    logger.logPipelineStep(req.userId, 'agents', 'end');

    /* ROUTING */
    logger.logPipelineStep(req.userId, 'routing', 'start');
    ctx.routing = {};
    for (const t of tasks) ctx.routing[t.id] = routeTask(t, intent, ctx);
    logger.logPipelineStep(req.userId, 'routing', 'end');

    /* PROVIDERS */
    logger.logPipelineStep(req.userId, 'providers', 'start');
    const requestId = `${req.userId}:${Date.now()}`;
    const costCtrl = new CostController({ userId: req.userId, requestId });
    ctx.agentResults = {};

    const providerCache: Record<string, any> = {};
    const getProvider = (name: string) =>
      providerCache[name] ??
      (providerCache[name] =
        name === 'openai' ? new OpenAIProvider() : new MockProvider());

    for (const t of tasks) {
      const decision = ctx.routing[t.id];
      const providers = decision.candidates.map((c) => getProvider(c.provider));

      const out = await executeWithFailover(
        providers,
        t.text,
        { model: decision.selected?.model, maxTokens: 512 },
        { backoff: 'exponential' }
      );

      if (out.result) {
        costCtrl.addUsage({
          provider: out.providerId || 'unknown',
          model: decision.selected?.model || 'unknown',
          tokensOutput: out.result.tokensUsed || 0
        });

        ctx.agentResults[t.id] = [{
          status: 'fulfilled',
          text: out.result.text,
          model: decision.selected?.model
        }];
      } else {
        errors.push(`provider_error:${t.id}`);
      }
    }
    logger.logPipelineStep(req.userId, 'providers', 'end');

    /* VERIFICATION */
    logger.logPipelineStep(req.userId, 'verification', 'start');
    ctx.verification = verifyPipeline(ctx);
    logger.logPipelineStep(req.userId, 'verification', 'end');

    /* ASSEMBLE */
    logger.logPipelineStep(req.userId, 'assemble', 'start');
    const parts: string[] = [];
    const modelPlan: string[] = [];
    for (const t of tasks) {
      const r = ctx.agentResults[t.id]?.[0];
      if (r?.text) {
        parts.push(r.text.trim());
        modelPlan.push(r.model);
      }
    }
    const mergedText = parts.join('\n\n');
    logger.logPipelineStep(req.userId, 'assemble', 'end');

    /* STYLE */
    logger.logPipelineStep(req.userId, 'style', 'start');
    const styled = await (await import('./styleWrapper')).styleWrapper(
      { text: mergedText },
      { xtreetTone: true }
    );
    logger.logPipelineStep(req.userId, 'style', 'end');

    /* COST */
    const costReport = costCtrl.getReport();
    logger.logCostReport(req.userId, costReport);

    const result: EngineResult = {
      ok: errors.length === 0,
      category: intent.category,
      modelPlan,
      response: styled.text || mergedText,
      tokensUsed: costReport.totalTokens,
      estimatedCost: costReport.estimatedCost,
      errors: errors.length ? errors : undefined
    };

    cache.set(cacheKey, result);
    return result;

  } catch (e) {
    logger.error('Engine fatal error', { error: String(e) });
    return {
      ok: false,
      category: 'other',
      modelPlan: [],
      response: 'Internal error.',
      tokensUsed: 0,
      estimatedCost: 0,
      errors: [String(e)]
    };
  }
}

export default { handleMessage, selectModel, checkRateLimit };
