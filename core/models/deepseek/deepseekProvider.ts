import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callDeepSeek } from './deepseekClient';

function resolveDeepSeekModel(alias?: string): string {
  switch (alias) {
    case 'math':
      return process.env.DEEPSEEK_MODEL_MATH!;
    case 'code':
      return process.env.DEEPSEEK_MODEL_CODE!;
    case 'default':
    default:
      return process.env.DEEPSEEK_MODEL_DEFAULT!;
  }
}

export class DeepSeekProvider extends BaseModelProvider {
  id = 'deepseek';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveDeepSeekModel(config.model);
    const maxTokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    try {
      const resp = await timeoutPromise(
        callDeepSeek({ prompt, model, maxTokens, temperature } as any),
        timeoutMs,
        () => logger.warn('DeepSeek request timed out')
      );

      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta };
    } catch (err: any) {
      logger.warn('DeepSeek provider error', { error: String(err) });
      throw new Error(`DeepSeek provider error: ${String(err)}`);
    }
  }
}

export default DeepSeekProvider;
