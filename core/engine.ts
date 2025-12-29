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
import providerRegistry from './providerRegistry';

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
/*                                   RESULT                                   */
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
/*                               MAIN HANDLER                                  */
/* -------------------------------------------------------------------------- */

export async function handleMessage(
  req: MessageRequest,
  clientIp: string
): Promise<EngineResult> {
  const errors: string[] = [];

  const ctx: PipelineContext & {
    failures: Record<string, string[]>;
  } = {
    request: req as RExRequest,
    failures: {}
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
      confidence: intent.confidence
    });

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
      const decision = routeTask(task, intent, ctx);
      ctx.routing[task.id] = decision;

      logger.info({
        event: 'routing_decision',
        taskId: task.id,
        selected: decision.selected,
        candidates: decision.candidates
      });
    }

    /* ------------------------------- PROVIDERS ------------------------------ */
    const requestId = `${req.userId}:${Date.now()}`;
    const costController = new CostController({ userId: req.userId, requestId });

    const providerCache: Record<string, any> = {};

    const getProvider = (name: string) => {
      if (!providerRegistry.isKnownProvider(name)) return undefined;
      if (!providerCache[name]) {
        providerCache[name] = providerRegistry.createProvider(name);
      }
      return providerCache[name];
    };

    const toProviders = (candidates: any[]) =>
      candidates
        .map((c) => getProvider(c.provider))
        .filter(Boolean);

    for (const task of tasks) {
      const decision = ctx.routing[task.id];

      if (!decision?.candidates?.length) {
        const err = `routing_missing:${task.id}`;
        errors.push(err);
        ctx.failures[task.id] = [err];
        continue;
      }

      ctx.failures[task.id] = [];

      const strategic = decision.candidates.filter(
        (c) => c.reason?.startsWith('strategic:')
      );

      const nonStrategic = decision.candidates.filter(
        (c) => !c.reason?.startsWith('strategic:')
      );

      let executionResult: any = null;

      /* ------------------------- PHASE 1 — STRATEGIC ------------------------ */
      if (strategic.length > 0) {
        const providers = toProviders(strategic);

        const out = await executeWithFailover(
          providers,
          task.text,
          {
            model: strategic[0].model,
            maxTokens: 512
          }
        );

        if (out.result?.text) {
          executionResult = out;
        } else {
          const err = `strategic_failed:${strategic
            .map((s) => s.provider)
            .join(',')}`;
          errors.push(err);
          ctx.failures[task.id].push(err);
        }
      }

      /* --------------------- PHASE 2 — QUALITY / PRICE ---------------------- */
      if (!executionResult && nonStrategic.length > 0) {
        const sorted = [...nonStrategic].sort((a, b) => {
          const ca = a.costEstimate ?? 1;
          const cb = b.costEstimate ?? 1;
          return ca - cb;
        });

        const providers = toProviders(sorted);

        const out = await executeWithFailover(
          providers,
          task.text,
          {
            model: 'default',
            maxTokens: 512
          }
        );

        if (out.result?.text) {
          executionResult = out;
        } else {
          const err = `heuristic_failed:${sorted
            .map((s) => s.provider)
            .join(',')}`;
          errors.push(err);
          ctx.failures[task.id].push(err);
        }
      }

      /* -------------------------- PHASE 3 — MOCK ---------------------------- */
      if (!executionResult) {
        const err = 'mock_used';
        errors.push(err);
        ctx.failures[task.id].push(err);

        executionResult = {
          result: {
            text:
              '[MOCK RESPONSE] No provider available to answer this request.',
            tokensUsed: 0
          },
          providerId: 'mock'
        };
      }

      costController.addUsage({
        provider: executionResult.providerId ?? 'unknown',
        model: decision.selected?.model ?? 'unknown',
        tokensOutput: executionResult.result.tokensUsed ?? 0
      });

      ctx.agentResults[task.id] = [
        {
          taskId: task.id,
          provider: executionResult.providerId ?? 'unknown',
          model: decision.selected?.model ?? 'unknown',
          text: executionResult.result.text,
          status: 'fulfilled',
          tokensUsed: executionResult.result.tokensUsed
        }
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
          value: { text: r.text }
        });
      }
    }

    const mergedText = await assemble(assembleInput);

    /* ------------------------------- STYLE --------------------------------- */
    const styled =
      (await (await import('./styleWrapper')).styleWrapper(mergedText, {
        xtreetTone: true
      })) ?? mergedText;

    /* ----------------------- PROVIDER / MODEL TAG --------------------------- */
    let providerTag = '';
    const mainResult = ctx.agentResults?.[tasks[0]?.id]?.[0];

    if (mainResult?.provider && mainResult?.model) {
      providerTag = `[${mainResult.provider} · ${mainResult.model}]\n\n`;
    }

    /* --------------------------- FAILURE REPORT ----------------------------- */
    let failureReport = '';

    if (Object.keys(ctx.failures).some((k) => ctx.failures[k].length > 0)) {
      failureReport += '\n\n\x1b[31m--- MODEL FAILURES DETECTED ---\x1b[0m\n';

      for (const [taskId, fails] of Object.entries(ctx.failures)) {
        if (fails.length === 0) continue;

        failureReport += `\x1b[33mTask ${taskId}:\x1b[0m\n`;
        for (const f of fails) {
          failureReport += `  \x1b[31m- ${f}\x1b[0m\n`;
        }
      }
    }

    /* ---------------------------------- COST -------------------------------- */
    const costReport = costController.getReport();

    return {
      ok: true,
      category: intent.category,
      modelPlan,
      response: providerTag + styled + failureReport,
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

