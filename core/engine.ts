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

/* ----------------------------- PROVIDERS --------------------------------- */
import OpenAIProvider from './models/openai/openaiProvider';
import ClaudeProvider from './models/claude/claudeProvider';
import DeepSeekProvider from './models/deepseek/deepseekProvider';
import GrokProvider from './models/grok/grokProvider';
import GeminiProvider from './models/gemini/geminiProvider';
import LlamaProvider from './models/llama/llamaProvider';
import MistralProvider from './models/mistral/mistralProvider';
import QwenProvider from './models/qwen/qwenProvider';
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
  ttl: 1000 * 60 * 60
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
  const refill = (elapsed / RATE_LIMIT_REFILL_MS) * RATE_LIMIT_MAX_TOKENS;

  bucket.tokens = Math.min(RATE_LIMIT_MAX_TOKENS, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/*                              PROVIDER REGISTRY                              */
/* -------------------------------------------------------------------------- */

type ProviderInstance =
  | OpenAIProvider
  | ClaudeProvider
  | DeepSeekProvider
  | GrokProvider
  | GeminiProvider
  | LlamaProvider
  | MistralProvider
  | QwenProvider
  | MockProvider;

const providerFactories: Record<string, () => ProviderInstance> = {
  openai: () => new OpenAIProvider(),
  claude: () => new ClaudeProvider(),
  deepseek: () => new DeepSeekProvider(),
  grok: () => new GrokProvider(),
  gemini: () => new GeminiProvider(),
  llama: () => new LlamaProvider(),
  mistral: () => new MistralProvider(),
  qwen: () => new QwenProvider()
};

/* -------------------------------------------------------------------------- */
/*                                   RESULT                                    */
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
    const costController = new CostController({ userId: req.userId, requestId });

    const providerCache: Record<string, ProviderInstance> = {};
    const getProvider = (name: string): ProviderInstance =>
      providerCache[name] ??= providerFactories[name]?.() ?? new MockProvider();

    for (const task of tasks) {
      const decision = ctx.routing?.[task.id];
      if (!decision?.selected) {
        errors.push(`routing_missing:${task.id}`);
        continue;
      }

      /* 🔑 STRICT EXECUTION ORDER */
      const orderedProviders: ProviderInstance[] = [];

      // 1️⃣ Selected model
      orderedProviders.push(getProvider(decision.selected.provider));

      // 2️⃣ Strategic fallbacks
      for (const c of decision.candidates) {
        if (c.provider !== decision.selected.provider) {
          orderedProviders.push(getProvider(c.provider));
        }
      }

      // 3️⃣ Global failsafe
      orderedProviders.push(getProvider('deepseek'));

      // 4️⃣ Absolute fallback
      orderedProviders.push(new MockProvider());

      const out = await executeWithFailover(
        orderedProviders,
        task.text,
        {
          model: decision.selected.model,
          maxTokens: 512
        }
      );

      if (!out?.result?.text) {
        errors.push(`provider_error:${task.id}`);
        continue;
      }

      costController.addUsage({
        provider: out.providerId ?? 'unknown',
        model: decision.selected.model,
        tokensOutput: out.result.tokensUsed ?? 0
      });

      ctx.agentResults[task.id] = [
        {
          taskId: task.id,
          provider: out.providerId ?? 'unknown',
          model: decision.selected.model,
          text: out.result.text,
          status: 'fulfilled',
          tokensUsed: out.result.tokensUsed
        }
      ];
    }

    /* ------------------------------ VERIFICATION ---------------------------- */
    ctx.verification = verifyPipeline(ctx);

    /* -------------------------------- ASSEMBLE ------------------------------ */
    const modelPlan: string[] = [];
    const assembleInput: Array<{
      status: 'fulfilled';
      value: { text: string };
    }> = [];

    for (const task of tasks) {
      const r = ctx.agentResults?.[task.id]?.[0];
      if (r?.text) {
        modelPlan.push(`${r.provider}:${r.model}`);
        assembleInput.push({
          status: 'fulfilled',
          value: { text: r.text }
        });
      }
    }

    const mergedText = await assemble(assembleInput);

    /* --------------------------------- STYLE -------------------------------- */
    const styled =
      (await (await import('./styleWrapper')).styleWrapper(mergedText, {
        xtreetTone: true
      })) ?? mergedText;

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

export default { handleMessage, checkRateLimit };
