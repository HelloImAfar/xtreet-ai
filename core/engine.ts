import LRU from 'lru-cache';

import logger from './logger';
import { decomposeIfNeeded } from './decomposer';
import { assemble } from './assembler';
import { analyzeIntent } from './intentClassifier';
import { routeTask } from './router';
import { runAgents } from './agents/agent';
import LogicalAuditorAgent from './agents/logicalAuditor';
import StyleRefinementAgent from './agents/styleRefinement';
import CostOptimizationAgent from './agents/costOptimization';
import { executeWithFailover } from './retry';
import { verifyPipeline } from './verifier';
import { runSecurityChecks } from './security';
import { getMemory } from './memory';
import { CostController } from './costController';

import OpenAIProvider from './models/openai/openaiProvider';
import MockProvider from './models/mockProvider';

import type {
  Category,
  MessageRequest,
  RExRequest,
  PipelineContext,
  AgentResult
} from '../types';

/* -------------------------------------------------------------------------- */
/*                                   CACHE                                    */
/* -------------------------------------------------------------------------- */

const cache = new LRU<string, any>({
  max: 100,
  ttl: 1000 * 60 * 60 // 1h
});

/* -------------------------------------------------------------------------- */
/*                                RATE LIMIT                                  */
/* -------------------------------------------------------------------------- */

const rateLimitBuckets = new Map<
  string,
  { tokens: number; lastRefill: number }
>();

const RATE_LIMIT_MAX_TOKENS = 10;
const RATE_LIMIT_REFILL_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(ip);

  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX_TOKENS, lastRefill: now };
    rateLimitBuckets.set(ip, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refill =
    (elapsed / RATE_LIMIT_REFILL_MS) * RATE_LIMIT_MAX_TOKENS;

  bucket.tokens = Math.min(
    RATE_LIMIT_MAX_TOKENS,
    bucket.tokens + refill
  );
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/*                              MODEL SELECTION                               */
/* -------------------------------------------------------------------------- */
/**
 * GEN 1: simple, deterministic, transparent.
 * GEN 2: this logic will be replaced by a strategic selector.
 */
export function selectModel(
  category: Category
): { model: string; temperature: number } {
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

/* -------------------------------------------------------------------------- */
/*                                 RESULT                                     */
/* -------------------------------------------------------------------------- */

export interface EngineResult {
  ok: boolean;
  category: Category;
  modelPlan: string[];
  response: string;
  tokensUsed: number;
  estimatedCost: number;
  errors?: string[];
}

/* -------------------------------------------------------------------------- */
/*                               MAIN HANDLER                                 */
/* -------------------------------------------------------------------------- */

export async function handleMessage(
  req: MessageRequest,
  clientIp: string
): Promise<EngineResult> {
  const errors: string[] = [];

  const ctx: PipelineContext = {
    request: req as RExRequest
  };

  try {
    /* ------------------------------ RATE LIMIT ----------------------------- */
    if (!checkRateLimit(clientIp)) {
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

    /* -------------------------------- CACHE -------------------------------- */
    const cacheKey = `msg:${req.userId}:${req.text.slice(0, 200)}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    /* ---------------------------- SECURITY (PRE) ---------------------------- */
    const preSecurity = runSecurityChecks(ctx);
    if (preSecurity.some((s) => s.severity === 'high')) {
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

    /* ----------------------------- MEMORY LOAD ------------------------------ */
    ctx.memorySnapshot = await getMemory(req.userId);

    /* ------------------------------- INTENT -------------------------------- */
    const intent = await analyzeIntent(req);
    ctx.intent = intent;

    /* ------------------------------ DECOMPOSE ------------------------------- */
    const tasks = await decomposeIfNeeded(req.text, intent.category);
    ctx.tasks = tasks;

    /* -------------------------------- AGENTS -------------------------------- */
    const agents = [
      LogicalAuditorAgent,
      StyleRefinementAgent,
      CostOptimizationAgent
    ];

    ctx.agentResults = {};

    for (const task of tasks) {
      const outputs = await runAgents(agents, {
        taskId: task.id,
        text: task.text,
        ctx
      });

      ctx.agentResults[task.id] = outputs as AgentResult[];

      for (const o of outputs) {
        if (o.text && o.text !== task.text) {
          task.text = o.text;
        }
      }
    }

    /* -------------------------------- ROUTING ------------------------------- */
    ctx.routing = {};
    for (const task of tasks) {
      ctx.routing[task.id] = routeTask(task, intent, ctx);
    }

    /* ------------------------------- PROVIDERS ------------------------------ */
    const requestId = `${req.userId}:${Date.now()}`;
    const costController = new CostController({
      userId: req.userId,
      requestId
    });

    const providerCache: Record<string, OpenAIProvider | MockProvider> = {};

    const getProvider = (name: string) => {
      if (!providerCache[name]) {
        providerCache[name] =
          name === 'openai'
            ? new OpenAIProvider()
            : new MockProvider();
      }
      return providerCache[name];
    };

    for (const task of tasks) {
      const decision = ctx.routing?.[task.id];
      if (!decision) {
        errors.push(`routing_missing:${task.id}`);
        continue;
      }

      let providers = decision.candidates
        .map((c) => getProvider(c.provider))
        .filter(Boolean);

      if (providers.length === 0) {
        providers = [new MockProvider()];
      }

      const out = await executeWithFailover(
        providers,
        task.text,
        {
          model: decision.selected?.model,
          maxTokens: 512
        }
      );

      if (!out?.result?.text) {
        errors.push(`provider_error:${task.id}`);
        continue;
      }

      costController.addUsage({
        provider: out.providerId ?? 'unknown',
        model: decision.selected?.model ?? 'unknown',
        tokensOutput: out.result.tokensUsed ?? 0
      });

      ctx.agentResults[task.id] = [
        {
          taskId: task.id,
          provider: out.providerId ?? 'unknown',
          model: decision.selected?.model ?? 'unknown',
          text: out.result.text,
          status: 'fulfilled',
          tokensUsed: out.result.tokensUsed
        }
      ];
    }

    /* ------------------------------ VERIFICATION ---------------------------- */
    ctx.verification = verifyPipeline(ctx);

    /* -------------------------------- ASSEMBLE ------------------------------ */
    const parts: string[] = [];
    const modelPlan: string[] = [];
    const assembleInput: Array<{ status: 'fulfilled' | 'rejected'; value?: { text: string } }> = [];

    for (const task of tasks) {
      const r = ctx.agentResults?.[task.id]?.[0];
      if (r?.text) {
        parts.push(r.text.trim());
        modelPlan.push(r.model);
        assembleInput.push({
          status: 'fulfilled',
          value: { text: r.text }
        });
      }
    }

    const mergedText = await assemble(assembleInput);

    /* --------------------------------- STYLE -------------------------------- */
    const styleWrapperResult = await (
      await import('./styleWrapper')
    ).styleWrapper(
      mergedText,
      { xtreetTone: true }
    );
    const styled = styleWrapperResult ?? mergedText;

    /* ---------------------------------- COST -------------------------------- */
    const costReport = costController.getReport();

    const result: EngineResult = {
      ok: errors.length === 0,
      category: intent.category,
      modelPlan,
      response: styled,
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

export default {
  handleMessage,
  selectModel,
  checkRateLimit
};
