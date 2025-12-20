import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callQwen } from './qwenClient';

export class QwenProvider extends BaseModelProvider {
  id = 'qwen';

  constructor() {
    super();
  }

  protected async _execute(prompt: string, config: ExecuteConfig): Promise<Partial<ExecuteResult>> {
    const model = config.model || process.env.QWEN_MODEL || 'qwen-default';
    const maxTokens = config.maxTokens || 512;
    const temperature = typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 15_000;

    const payload = { prompt, model, maxTokens, temperature } as any;

    try {
      const resp = await timeoutPromise(callQwen(payload), timeoutMs, () => logger.warn('Qwen request timed out'));
      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta } as Partial<ExecuteResult>;
    } catch (err: any) {
      logger.warn('Qwen provider error', { error: String(err) });
      throw new Error(`Qwen provider error: ${String(err)}`);
    }
  }
}

export default QwenProvider;