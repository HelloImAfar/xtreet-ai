import LRU from 'lru-cache';

import logger from './logger';
import { decomposeIfNeeded } from './decomposer';
import { assemble } from './assembler';
import { routeTask } from './router';
import { runAgents } from './agents/agent';
import LogicalAuditorAgent from './agents/logicalAuditor';
import CostOptimizationAgent from './agents/costOptimization';
import { executeWithFailover } from './retry';
import { verifyPipeline } from './verifier';
import { getMemory } from './memory';
import { CostController } from './costController';
import { SYSTEM_PROMPT_V1 } from './systemPrompt';
import { XTREET_SYSTEM_PROMPT } from './xtreetPrompt';
import troyaSelect from './TROYA';
import { analyzeIntentWithLLM } from './LLMintentClassifier';

import type {
  Category,
  MessageRequest,
  RExRequest,
  PipelineContext,
  AgentResult,
  ModelResponse
} from '../types';

/* -------------------------------------------------------------------------- */
/* CACHE                                                                       */
/* -------------------------------------------------------------------------- */

const cache = new LRU<string, unknown>({
  max: 100,
  ttl: 1000 * 60 * 60
});

/* -------------------------------------------------------------------------- */
/* PROVIDERS                                                                   */
/* -------------------------------------------------------------------------- */

import providerRegistry from './providerRegistry';
type ProviderInstance = ReturnType<typeof providerRegistry.createProvider>;

/* -------------------------------------------------------------------------- */
/* RESULT TYPE                                                                 */
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
/* MAIN                                                                        */
/* -------------------------------------------------------------------------- */

export async function handleMessage(
  req: MessageRequest,
  clientIp: string
): Promise<EngineResult> {
  const errors: string[] = [];
  const modelPlan: string[] = [];

  const ctx: PipelineContext = {
    request: req as RExRequest
  };

  try {
    /* ----------------------------- MEMORY ---------------------------------- */
    ctx.memorySnapshot = await getMemory(req.userId);

    /* ------------------------------ INTENT --------------------------------- */
    const intent = await analyzeIntentWithLLM(req.text);
    ctx.intent = intent;

    logger.info({
      event: 'intent_result',
      category: intent.category,
      confidence: intent.confidence
    });

    /* ---------------------------- DECOMPOSE -------------------------------- */
    const tasks = await decomposeIfNeeded(req.text, intent.category);
    ctx.tasks = tasks;

    /* ------------------------------ AGENTS --------------------------------- */
    const agents = [LogicalAuditorAgent, CostOptimizationAgent];
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

    /* ------------------------------ ROUTING -------------------------------- */
    ctx.routing = {};

    for (const task of tasks) {
      const decision = routeTask(task, intent, ctx);
      ctx.routing[task.id] = decision;

      logger.info({
        event: 'routing_decision',
        taskId: task.id,
        selected: decision.selected,
        candidates: decision.candidates
      });
    }

    /* ----------------------------- EXECUTION ------------------------------- */
    const requestId = `${req.userId}:${Date.now()}`;
    const costController = new CostController({ userId: req.userId, requestId });

    const providerCache: Record<string, ProviderInstance> = {};

    const getProvider = (name: string): ProviderInstance | undefined => {
      if (!providerRegistry.isKnownProvider(name)) return;
      if (!providerCache[name]) {
        providerCache[name] = providerRegistry.createProvider(name);
      }
      return providerCache[name];
    };

    const maxTokensByDepth = {
      fast: 256,
      normal: 512,
      deep: 1024
    } as const;

    const settledResults: PromiseSettledResult<ModelResponse>[] = [];

    for (const task of tasks) {
      const decision = ctx.routing[task.id];
      if (!decision?.selected) {
        errors.push(`routing_missing:${task.id}`);
        continue;
      }

      const depth =
        intent.entities?.complexity === 'trivial'
          ? 'fast'
          : intent.entities?.complexity === 'deep'
          ? 'deep'
          : 'normal';

      const systemPrompt =
        intent.category === 'xtreet'
          ? XTREET_SYSTEM_PROMPT
          : SYSTEM_PROMPT_V1;

      const finalPrompt = `${systemPrompt}

User input:
${task.text}`;

      /* ---------------- STRATEGIC EXECUTION ---------------- */

      const strategicPlan = decision.candidates
        .map(c => ({
          provider: getProvider(c.provider),
          providerId: c.provider,
          model: c.model
        }))
        .filter(p => p.provider);

      let out: any = null;

      for (const step of strategicPlan) {
        const res = await executeWithFailover(
          [step.provider!],
          finalPrompt,
          {
            model: step.model,
            maxTokens: maxTokensByDepth[depth]
          },
          { depth }
        );

        if (res.result) {
          out = { ...res, usedModel: step.model };
          break;
        }
      }

      /* ---------------- TROYA (ONLY IF STRATEGIC FAILED) ---------------- */

      if (!out) {
        logger.warn({
          event: 'strategic_exhausted',
          taskId: task.id
        });

        const troyaCandidates = troyaSelect(
          task,
          intent,
          ctx,
          strategicPlan.map(p => p.providerId)
        );

        for (const c of troyaCandidates) {
          const p = getProvider(c.provider);
          if (!p) continue;

          const res = await executeWithFailover(
            [p],
            finalPrompt,
            {
              model: c.model ?? 'default',
              maxTokens: maxTokensByDepth[depth]
            },
            { depth }
          );

          if (res.result) {
            out = { ...res, usedModel: c.model ?? 'default' };
            break;
          }
        }
      }

      if (!out || !out.result) {
        errors.push(`execution_failed:${task.id}`);
        continue;
      }

      modelPlan.push(`${out.providerId}:${out.usedModel}`);

      costController.addUsage({
        provider: out.providerId ?? 'unknown',
        model: out.usedModel,
        tokensOutput: out.result.tokensUsed ?? 0
      });

      settledResults.push({
        status: 'fulfilled',
        value: out.result
      });
    }

    /* -------------------------- VERIFY + ASSEMBLE -------------------------- */
    ctx.verification = verifyPipeline(ctx);

    const merged = await assemble(settledResults);
    const responseText = typeof merged === 'string' ? merged : merged.text;

    const costReport = costController.getReport();

    return {
      ok: errors.length === 0,
      category: intent.category,
      modelPlan,
      response: responseText,
      tokensUsed: costReport.totalTokens,
      estimatedCost: costReport.estimatedCost,
      errors: errors.length ? errors : undefined
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
      errors: [String(e)]
    };
  }
}

export default { handleMessage };
