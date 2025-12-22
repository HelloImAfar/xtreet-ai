import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callMistral } from './mistralClient';

function resolveMistralModel(alias?: string): string {
  switch (alias) {
    case 'fast':
      return process.env.MISTRAL_MODEL_FAST!;
    case 'default':
    default:
      return process.env.MISTRAL_MODEL_DEFAULT!;
  }
}

export class MistralProvider extends BaseModelProvider {
  id = 'mistral';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveMistralModel(config.model);
    const maxTokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    try {
      const resp = await timeoutPromise(
        callMistral({ prompt, model, maxTokens, temperature } as any),
        timeoutMs,
        () => logger.warn('Mistral request timed out')
      );

      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta };
    } catch (err: any) {
      logger.warn('Mistral provider error', { error: String(err) });
      throw new Error(`Mistral provider error: ${String(err)}`);
    }
  }
}

export default MistralProvider;
