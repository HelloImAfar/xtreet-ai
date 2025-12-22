import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callLlama } from './llamaClient';

function resolveLlamaModel(alias?: string): string {
  switch (alias) {
    case 'fast':
      return process.env.LLAMA_MODEL_FAST!;
    case 'default':
    default:
      return process.env.LLAMA_MODEL_DEFAULT!;
  }
}

export class LlamaProvider extends BaseModelProvider {
  id = 'llama';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveLlamaModel(config.model);
    const maxTokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    try {
      const resp = await timeoutPromise(
        callLlama({ prompt, model, maxTokens, temperature } as any),
        timeoutMs,
        () => logger.warn('Llama request timed out')
      );

      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta };
    } catch (err: any) {
      logger.warn('Llama provider error', { error: String(err) });
      throw new Error(`Llama provider error: ${String(err)}`);
    }
  }
}

export default LlamaProvider;
