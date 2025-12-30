import LRU from 'lru-cache';

import logger from './logger';
import { decomposeIfNeeded } from './decomposer';
import { assemble } from './assembler';
import { routeTask } from './router';
import { runAgents } from './agents/agent';
import LogicalAuditorAgent from './agents/logicalAuditor';
import StyleRefinementAgent from './agents/styleRefinement';
import CostOptimizationAgent from './agents/costOptimization';
import { executeWithFailover } from './retry';
import { verifyPipeline } from './verifier';
import { getMemory } from './memory';
import { CostController } from './costController';

/* ✅ LLM INTENT CLASSIFIER */
import { analyzeIntentWithLLM } from './LLMintentClassifier';

/* ----------------------------- PROVIDERS --------------------------------- */
import OpenAIProvider from './models/openai/openaiProvider';
import ClaudeProvider from './models/claude/claudeProvider';
import DeepSeekProvider from './models/deepseek/deepseekProvider';
import GrokProvider from './models/grok/grokProvider';
import GeminiProvider from './models/gemini/geminiProvider';
import LlamaProvider from './models/llama/llamaProvider';
import MistralProvider from './models/mistral/mistralProvider';
import QwenProvider from './models/qwen/qwenProvider';

import type {
  Category,
  MessageRequest,
  RExRequest,
  PipelineContext,
  AgentResult,
} from '../types';

/* -------------------------------------------------------------------------- */
/* CACHE (GEN 1: preparado, no usado aún) */
/* -------------------------------------------------------------------------- */
const cache = new LRU<string, unknown>({
  max: 100,
  ttl: 1000 * 60 * 60,
});

/* -------------------------------------------------------------------------- */
/* PROVIDER REGISTRY */
/* -------------------------------------------------------------------------- */
type ProviderInstance =
  | OpenAIProvider
  | ClaudeProvider
  | DeepSeekProvider
  | GrokProvider
  | GeminiProvider
  | LlamaProvider
  | MistralProvider
  | QwenProvider;

import providerRegistry from './providerRegistry';

/* -------------------------------------------------------------------------- */
/* RESULT */
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
/* MAIN HANDLER */
/* -------------------------------------------------------------------------- */
export async function handleMessage(
  req: MessageRequest,
  clientIp: string
): Promise<EngineResult> {
  const errors: string[] = [];

  const ctx: PipelineContext = {
    request: req as RExRequest,
  };

  try {
    /* ----------------------------- MEMORY LOAD ----------------------------- */
    ctx.memorySnapshot = await getMemory(req.userId);

    /* ------------------------------- INTENT -------------------------------- */
    const intent = await analyzeIntentWithLLM(req.text);
    ctx.intent = intent;

    logger.info({
      event: 'intent_result',
      category: intent.category,
      confidence: intent.confidence,
    });

    /* ------------------------------ DECOMPOSE ------------------------------- */
    const tasks = await decomposeIfNeeded(req.text, intent.category);
    ctx.tasks = tasks;

    /* -------------------------------- AGENTS -------------------------------- */
    const agents = [
      LogicalAuditorAgent,
      StyleRefinementAgent,
      CostOptimizationAgent,
    ];

    ctx.agentResults = {};

    for (const task of tasks) {
      const outputs = await runAgents(agents, {
        taskId: task.id,
        text: task.text,
        ctx,
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
      const decision = routeTask(task, intent, ctx);
      ctx.routing[task.id] = decision;

      logger.info({
        event: 'routing_decision',
        taskId: task.id,
        intent: intent.category,
        selected: decision.selected,
        candidates: decision.candidates,
      });
    }

    /* ------------------------------- PROVIDERS ------------------------------ */
    const requestId = `${req.userId}:${Date.now()}`;
    const costController = new CostController({ userId: req.userId, requestId });

    const providerCache: Record<string, ProviderInstance> = {};

    const getProvider = (name: string): ProviderInstance | undefined => {
      if (!providerRegistry.isKnownProvider(name)) {
        logger.warn('Unknown provider requested', { provider: name });
        return undefined;
      }

      if (!providerCache[name]) {
        const inst = providerRegistry.createProvider(name);
        if (!inst) {
          logger.warn('Failed to create provider', { provider: name });
          return undefined;
        }
        providerCache[name] = inst as ProviderInstance;
      }

      return providerCache[name];
    };

    const maxTokensByDepth: Record<'fast' | 'normal' | 'deep', number> = {
      fast: 256,
      normal: 512,
      deep: 1024,
    };

    for (const task of tasks) {
      const decision = ctx.routing[task.id];

      if (!decision?.selected) {
        errors.push(`routing_missing:${task.id}`);
        continue;
      }

      /* 🔹 DEPTH DECISION (GEN 1 — SINGLE SOURCE OF TRUTH) */
      const depth: 'fast' | 'normal' | 'deep' =
        intent.entities?.complexity === 'trivial'
          ? 'fast'
          : intent.entities?.complexity === 'deep'
            ? 'deep'
            : 'normal';

      logger.info({
        event: 'depth_resolved',
        depth,
        complexity: intent.entities?.complexity ?? 'missing',
      });

      const providers = decision.candidates
        .map((c) => getProvider(c.provider))
        .filter((p): p is ProviderInstance => Boolean(p));

      if (providers.length === 0) {
        errors.push(`no_available_providers:${task.id}`);
        logger.error('No available providers', {
          taskId: task.id,
          candidates: decision.candidates.map((c) => c.provider),
        });
        continue;
      }

      const out = await executeWithFailover(
        providers,
        task.text,
        {
          model: decision.selected.model,
          maxTokens: maxTokensByDepth[depth],
        },
        { depth }
      );

      if (!out?.result?.text) {
        errors.push(`provider_error:${task.id}`);
        continue;
      }

      costController.addUsage({
        provider: out.providerId ?? 'unknown',
        model: decision.selected.model ?? 'unknown',
        tokensOutput: out.result.tokensUsed ?? 0,
      });

      ctx.agentResults[task.id] = [
        {
          taskId: task.id,
          provider: out.providerId ?? 'unknown',
          model: decision.selected.model ?? 'unknown',
          text: out.result.text,
          status: 'fulfilled',
          tokensUsed: out.result.tokensUsed,
        },
      ];
    }

    /* ------------------------------ VERIFICATION ---------------------------- */
    ctx.verification = verifyPipeline(ctx);

    /* -------------------------------- ASSEMBLE ------------------------------ */
    const modelPlan: string[] = [];
    const assembleInput: Array<{
      status: 'fulfilled' | 'rejected';
      value?: { text: string };
    }> = [];

    for (const task of tasks) {
      const r = ctx.agentResults?.[task.id]?.[0];
      if (r?.text) {
        modelPlan.push(r.model);
        assembleInput.push({
          status: 'fulfilled',
          value: { text: r.text },
        });
      }
    }

    const mergedText = await assemble(assembleInput);

    /* --------------------------------- STYLE -------------------------------- */
    const styled =
      (await (await import('./styleWrapper')).styleWrapper(mergedText, {
        xtreetTone: true,
      })) ?? mergedText;

    /* ---------------------------------- COST -------------------------------- */
    const costReport = costController.getReport();

    return {
      ok: errors.length === 0,
      category: intent.category,
      modelPlan,
      response: styled,
      tokensUsed: costReport.totalTokens,
      estimatedCost: costReport.estimatedCost,
      errors: errors.length ? errors : undefined,
    };
  } catch (e) {
    logger.error('Engine fatal error', { error: String(e) });

    return {
      ok: false,
      category: 'other',
      modelPlan: [],
      response: 'Internal error.',
      tokensUsed: 0,
      estimatedCost: 0,
      errors: [String(e)],
    };
  }
}

export default { handleMessage };
