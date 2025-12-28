import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callDeepSeek } from './deepseekClient';

/**
 * DeepSeek is OpenAI-compatible.
 * For GEN 1 intent classification we ALWAYS use deepseek-chat.
 */
function resolveDeepSeekModel(): string {
  return 'deepseek-chat';
}

export class DeepSeekProvider extends BaseModelProvider {
  id = 'deepseek';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveDeepSeekModel();
    const maxTokens = config.maxTokens ?? 256;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0;
    const timeoutMs = config.timeoutMs ?? 15_000;

    try {
      const resp = await timeoutPromise(
        callDeepSeek({
          prompt,
          model,
          maxTokens,
          temperature
        } as any),
        timeoutMs,
        () => logger.warn('DeepSeek request timed out')
      );

      return {
        text: resp.text ?? '',
        tokensUsed: resp.tokensUsed,
        meta: resp.meta
      };
    } catch (err: any) {
      logger.error('DeepSeek provider error', {
        error: err instanceof Error ? err.message : String(err)
      });
      throw new Error(
        `DeepSeek provider error: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}

export default DeepSeekProvider;
