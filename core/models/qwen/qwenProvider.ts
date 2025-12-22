import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callQwen } from './qwenClient';

function resolveQwenModel(alias?: string): string {
  switch (alias) {
    case 'code':
      return process.env.QWEN_MODEL_CODE!;
    case 'default':
    default:
      return process.env.QWEN_MODEL_DEFAULT!;
  }
}

export class QwenProvider extends BaseModelProvider {
  id = 'qwen';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveQwenModel(config.model);
    const maxTokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    try {
      const resp = await timeoutPromise(
        callQwen({ prompt, model, maxTokens, temperature } as any),
        timeoutMs,
        () => logger.warn('Qwen request timed out')
      );

      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta };
    } catch (err: any) {
      logger.warn('Qwen provider error', { error: String(err) });
      throw new Error(`Qwen provider error: ${String(err)}`);
    }
  }
}

export default QwenProvider;
