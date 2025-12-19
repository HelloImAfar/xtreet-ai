import { retry } from '../../lib/utils';

export type ExecuteConfig = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  retries?: number; // number of retry attempts
  timeoutMs?: number;
  // provider-specific overrides
  [key: string]: any;
};

export type ExecuteResult = {
  text: string;
  tokensUsed?: number;
  latencyMs?: number;
  meta?: any;
};

export interface ModelProvider {
  /** unique provider id */
  id: string;
  execute(prompt: string, config?: ExecuteConfig): Promise<ExecuteResult>;
}

/**
 * BaseModelProvider implements retry & timing around a provider implementation.
 * Concrete providers should implement `_execute` which performs the actual call and
 * returns a partial ExecuteResult (text/tokens/meta). The base class will add
 * latency measurement and retry semantics.
 */
export abstract class BaseModelProvider implements ModelProvider {
  abstract id: string;
  protected defaultRetries = 3;

  async execute(prompt: string, config: ExecuteConfig = {}): Promise<ExecuteResult> {
    const retries = typeof config.retries === 'number' ? config.retries : this.defaultRetries;

    const start = Date.now();
    const fn = async () => this._execute(prompt, config);
    const res = await retry(fn, retries, 200);
    const latency = Date.now() - start;

    return {
      text: res.text ?? '',
      tokensUsed: res.tokensUsed,
      meta: res.meta,
      latencyMs: latency,
    };
  }

  protected abstract _execute(prompt: string, config: ExecuteConfig): Promise<Partial<ExecuteResult>>;
}

export default { BaseModelProvider };
