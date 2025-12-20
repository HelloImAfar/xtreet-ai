import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callClaude } from './claudeClient';

export class ClaudeProvider extends BaseModelProvider {
  id = 'claude';

  constructor() {
    super();
  }

  protected async _execute(prompt: string, config: ExecuteConfig): Promise<Partial<ExecuteResult>> {
    const model = config.model || process.env.CLAUDE_MODEL || 'claude-v1';
    const maxTokens = config.maxTokens || 512;
    const temperature = typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 15_000;

    const payload = { prompt, model, maxTokens, temperature } as any;

    try {
      const resp = await timeoutPromise(callClaude(payload), timeoutMs, () => logger.warn('Claude request timed out'));
      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta } as Partial<ExecuteResult>;
    } catch (err: any) {
      // Re-throw to allow BaseModelProvider retry logic to engage on transient errors.
      logger.warn('Claude provider error', { error: String(err) });
      throw new Error(`Claude provider error: ${String(err)}`);
    }
  }
}

export default ClaudeProvider;