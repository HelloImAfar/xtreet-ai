import LRU from 'lru-cache';
import { timeoutPromise } from '../lib/utils';
import { classify } from './classifier';
import { decomposeIfNeeded } from './decomposer';
import { assemble } from './assembler';
import { verifier } from './verifier';
import { styleWrapper } from './styleWrapper';
import { getMemory, upsertMemory } from './memory';
import logger from './logger';
import type { Category, MessageRequest, ModelResponse } from '../types';
import openai from './models/openai';

// In-memory cache for responses (LRU, max 100 entries, 1h TTL)
const cache = new LRU<string, any>({
  max: 100,
  ttl: 1000 * 60 * 60
});

// Rate limiter: token bucket per IP (in-memory for dev)
const rateLimitBuckets = new Map<string, { tokens: number; lastRefill: number }>();
const RATE_LIMIT_MAX_TOKENS = 10; // 10 requests per minute per IP
const RATE_LIMIT_REFILL_MS = 60000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX_TOKENS, lastRefill: now };
    rateLimitBuckets.set(ip, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / RATE_LIMIT_REFILL_MS) * RATE_LIMIT_MAX_TOKENS;
  bucket.tokens = Math.min(RATE_LIMIT_MAX_TOKENS, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens--;
    return true;
  }
  return false;
}

// Model selection rules
export function selectModel(category: Category): { model: string; module: any; temperature: number } {
  switch (category) {
    case 'creative':
      return { model: 'gpt-4o', module: openai, temperature: 0.9 };
    case 'emotional':
      return { model: 'gpt-4o-mini', module: openai, temperature: 0.7 };
    case 'code':
      return { model: 'gpt-4o', module: openai, temperature: 0.1 };
    case 'vision':
      return { model: 'gpt-4o', module: openai, temperature: 0.5 };
    case 'current':
      return { model: 'gpt-4o', module: openai, temperature: 0.6 };
    case 'math':
      return { model: 'gpt-4o', module: openai, temperature: 0.2 };
    case 'branding':
      return { model: 'gpt-4o', module: openai, temperature: 0.7 };
    case 'efficiency':
      return { model: 'gpt-4o-mini', module: openai, temperature: 0.3 };
    case 'informative':
      return { model: 'gpt-4o', module: openai, temperature: 0.5 };
    default:
      return { model: 'gpt-4o', module: openai, temperature: 0.6 };
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

  try {
    // 0. Rate limit check
    if (!checkRateLimit(clientIp)) {
      return {
        ok: false,
        category: 'other',
        modelPlan: [],
        response: 'Rate limit exceeded. Please try again in a moment.',
        tokensUsed: 0,
        estimatedCost: 0,
        errors: ['rate_limit']
      };
    }

    // 1. Cache check
    const cacheKey = `msg:${req.userId}:${req.text.substring(0, 50)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info('Cache hit', { userId: req.userId, cacheKey });
      return cached;
    }

    // 2. Load user memory
    const memory = await getMemory(req.userId);
    logger.info('Memory loaded', { userId: req.userId, memorySize: memory.length });

    // 3. Classify
    const { category, confidence } = await classify(req.text);
    logger.info('Classified', { userId: req.userId, category, confidence });

    // 4. Decompose
    const microTasks = await decomposeIfNeeded(req.text, category);
    logger.info('Decomposed', {
      userId: req.userId,
      taskCount: microTasks.length,
      taskIds: microTasks.map((t) => t.id)
    });

    // 5. Route: select models for each microtask
    const plan = microTasks.map((task) => {
      const { model, module } = selectModel(category);
      return { taskId: task.id, taskText: task.text, model, module, category };
    });

    const modelPlan = plan.map((p) => p.model);
    logger.info('Model plan', { userId: req.userId, modelPlan });

    // 6. Execute in parallel with timeouts (30s per request)
    const promises = plan.map((p) =>
      timeoutPromise(
        p.module.callModel({
          prompt: p.taskText,
          maxTokens: 512,
          temperature: selectModel(p.category).temperature,
          model: p.model
        }),
        30000,
        () => {
          logger.warn('Model timeout', { taskId: p.taskId, model: p.model });
          errors.push(`timeout:${p.model}`);
        }
      )
    );

    const results = await Promise.allSettled(promises);
    logger.info('Model calls completed', {
      userId: req.userId,
      settled: results.map((r) => r.status),
      errors
    });

    // 7. Assemble
    const merged = await assemble(results as any);
    logger.info('Assembled', { userId: req.userId, textLength: merged.text.length });

    // 8. Verify (if technical)
    let finalText = merged.text;
    if (merged.containsTechnical) {
      const verified = await verifier(merged);
      finalText = verified.correctedText;
      if (verified.corrections.length > 0) {
        logger.info('Verifier corrections applied', {
          userId: req.userId,
          corrections: verified.corrections
        });
      }
    }

    // 9. Style wrapper
    const styledText = await styleWrapper({ text: finalText }, { xtreetTone: true });
    logger.info('Style wrapper applied', { userId: req.userId });

    // 10. Update memory (optional, async)
    if (req.userId) {
      upsertMemory(req.userId, 'last_message', { text: req.text, category, at: new Date().toISOString() }).catch(
        (e) => logger.error('Memory update error', { error: String(e) })
      );
    }

    // 11. Calculate metrics
    const totalTokens = results
      .filter((r): r is PromiseFulfilledResult<ModelResponse> => r.status === 'fulfilled' && (r as any).value)
      .reduce((sum, r) => sum + (r.value?.tokensUsed || 0), 0);

    // Rough cost estimate: $0.03/1k input, $0.06/1k output tokens (GPT-4o)
    const estimatedCost = (totalTokens / 1000) * 0.045;

    const elapsedMs = Date.now() - startTime;
    logger.info('Message handled successfully', {
      userId: req.userId,
      category,
      tokensUsed: totalTokens,
      estimatedCost,
      elapsedMs,
      errors: errors.length > 0 ? errors : undefined
    });

    const result: EngineResult = {
      ok: true,
      category,
      modelPlan,
      response: styledText,
      tokensUsed: totalTokens,
      estimatedCost,
      errors: errors.length > 0 ? errors : undefined
    };

    // Cache result
    cache.set(cacheKey, result);

    return result;
  } catch (e) {
    const err = String(e);
    logger.error('handleMessage fatal error', { error: err, userId: req.userId });
    return {
      ok: false,
      category: 'other',
      modelPlan: [],
      response: 'An error occurred. Please try again later.',
      tokensUsed: 0,
      estimatedCost: 0,
      errors: [err]
    };
  }
}

export default { handleMessage, selectModel, checkRateLimit };
