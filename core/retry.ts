import type { ModelProvider } from '@/core/models/provider';
import type { ExecuteConfig, ExecuteResult } from '@/core/models/provider';
import logger from './logger';

export type BackoffStrategy = 'exponential' | 'linear' | 'constant';
export type ExecutionDepth = 'fast' | 'normal' | 'deep';

export type FailoverOptions = {
  depth?: ExecutionDepth;

  backoff?: BackoffStrategy;
  backoffBaseMs?: number;
  maxBackoffMs?: number;

  partialThresholdChars?: number;
  allowPartial?: boolean;

  perProviderTimeoutMs?: number;
};

const RETRIES_BY_DEPTH: Record<ExecutionDepth, number> = {
  fast: 0,
  normal: 1,
  deep: 3,
};

function computeDelay(
  attempt: number,
  strategy: BackoffStrategy,
  base: number,
  maxMs: number
) {
  let delay = base;

  if (strategy === 'exponential') delay = base * Math.pow(2, attempt);
  else if (strategy === 'linear') delay = base * attempt;

  return Math.min(delay, maxMs);
}

export async function executeWithFailover(
  providers: ModelProvider[],
  prompt: string,
  config: ExecuteConfig = {},
  opts: FailoverOptions = {}
): Promise<{
  result: ExecuteResult | null;
  providerId?: string;
  usedProviders: string[];
  partial: boolean;
  errors: any[];
}> {
  if (!providers || providers.length === 0) {
    throw new Error('No providers available for failover execution');
  }

  const depth: ExecutionDepth = opts.depth ?? 'normal';
  const maxRetries = RETRIES_BY_DEPTH[depth];

  /* 🔹 GEN 1 DEBUG — DEPTH RESOLUTION */
  logger.info({
    event: 'failover_depth_resolved',
    depth,
    maxRetries,
    providersCount: providers.length,
  });

  const strategy = opts.backoff ?? 'exponential';
  const base = opts.backoffBaseMs ?? 200;
  const maxMs = opts.maxBackoffMs ?? 5000;

  const partialThreshold = opts.partialThresholdChars ?? 20;
  const allowPartial = opts.allowPartial ?? false;

  const errors: any[] = [];
  const usedProviders: string[] = [];
  const partialResults: { provider: string; res: ExecuteResult }[] = [];

  for (const provider of providers) {
    usedProviders.push(provider.id);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        /* 🔹 GEN 1 DEBUG — ATTEMPT */
        logger.info({
          event: 'failover_attempt',
          provider: provider.id,
          attempt,
          maxRetries,
          depth,
        });

        const res = await provider.execute(prompt, config);

        const text = res.text ?? '';
        const isPartial =
          Boolean(res.meta?.partial) || text.length < partialThreshold;

        if (isPartial) {
          if (!partialResults.find((p) => p.provider === provider.id)) {
            partialResults.push({ provider: provider.id, res });
          }

          if (allowPartial && attempt === maxRetries) {
            return {
              result: res,
              providerId: provider.id,
              usedProviders,
              partial: true,
              errors,
            };
          }

          continue;
        }

        return {
          result: res,
          providerId: provider.id,
          usedProviders,
          partial: false,
          errors,
        };
      } catch (err) {
        errors.push({
          provider: provider.id,
          attempt,
          error: err,
        });

        if (attempt < maxRetries) {
          const delay = computeDelay(
            attempt + 1,
            strategy,
            base,
            maxMs
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  /* 🔹 Partial merge fallback */
  if (partialResults.length > 0) {
    const mergedText = partialResults
      .map((p) => p.res.text)
      .filter(Boolean)
      .join('\n\n---\n\n');

    const mergedTokens = partialResults.reduce(
      (sum, p) => sum + (p.res.tokensUsed ?? 0),
      0
    );

    const mergedMeta = {
      partial: true,
      sources: partialResults.map((p) => ({
        provider: p.provider,
        meta: p.res.meta,
      })),
    };

    const mergedResult: ExecuteResult = {
      text: mergedText,
      tokensUsed: mergedTokens,
      meta: mergedMeta,
    };

    return {
      result: mergedResult,
      providerId: partialResults[0].provider,
      usedProviders,
      partial: true,
      errors,
    };
  }

  return {
    result: null,
    usedProviders,
    partial: false,
    errors,
  };
}

export default {
  executeWithFailover,
};
