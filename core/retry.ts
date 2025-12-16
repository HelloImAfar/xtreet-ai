import type { ModelProvider } from '@/core/models/provider';
import type { ExecuteConfig, ExecuteResult } from '@/core/models/provider';

export type BackoffStrategy = 'exponential' | 'linear' | 'constant';

export type FailoverOptions = {
  backoff?: BackoffStrategy;
  backoffBaseMs?: number;
  maxBackoffMs?: number;
  partialThresholdChars?: number; // min chars to consider full
  allowPartial?: boolean; // accept partial if no full available
  perProviderTimeoutMs?: number; // reserved for provider-level timeout handling
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

  const strategy = opts.backoff ?? 'exponential';
  const base = opts.backoffBaseMs ?? 200;
  const maxMs = opts.maxBackoffMs ?? 5000;
  const partialThreshold = opts.partialThresholdChars ?? 20;
  const allowPartial = opts.allowPartial ?? false;

  const errors: any[] = [];
  const usedProviders: string[] = [];
  const partialResults: { provider: string; res: ExecuteResult }[] = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    usedProviders.push(provider.id);

    try {
      const res = await provider.execute(prompt, config);

      const text = res.text ?? '';
      const isPartial =
        Boolean(res.meta?.partial) || text.length < partialThreshold;

      if (isPartial) {
        partialResults.push({ provider: provider.id, res });

        // Accept partial only if explicitly allowed and no more providers remain
        if (allowPartial && i === providers.length - 1) {
          return {
            result: res,
            providerId: provider.id,
            usedProviders,
            partial: true,
            errors,
          };
        }

        // Otherwise try next provider
        continue;
      }

      // Full successful response
      return {
        result: res,
        providerId: provider.id,
        usedProviders,
        partial: false,
        errors,
      };
    } catch (err) {
      errors.push({ provider: provider.id, error: err });

      // Backoff before next provider
      const delay = computeDelay(i + 1, strategy, base, maxMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // No full responses returned — attempt partial merge
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

  // All providers failed
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
