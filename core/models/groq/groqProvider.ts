import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callGroq } from './groqClient';

export class GroqProvider extends BaseModelProvider {
  id = 'groq';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model =
      config.model || process.env.GROQ_MODEL || 'llama-3.1-70b';

    const maxTokens = config.maxTokens || 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;

    const timeoutMs =
      typeof config.timeoutMs === 'number' ? config.timeoutMs : 15_000;

    try {
      const resp = await timeoutPromise(
        callGroq({ prompt, model, maxTokens, temperature } as any),
        timeoutMs,
        () => logger.warn('Groq request timed out')
      );

      return {
        text: resp.text ?? '',
        tokensUsed: resp.tokensUsed,
        meta: resp.meta
      };
    } catch (err: any) {
      logger.warn('Groq provider error', { error: String(err) });
      throw new Error(`Groq provider error: ${String(err)}`);
    }
  }
}

export default GroqProvider;
