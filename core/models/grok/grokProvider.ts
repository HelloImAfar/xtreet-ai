import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callGrok } from './grokClient';

function resolveGrokModel(alias?: string): string {
  return process.env.GROK_MODEL_DEFAULT!;
}

export class GrokProvider extends BaseModelProvider {
  id = 'grok';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveGrokModel(config.model);
    const maxTokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    try {
      const resp = await timeoutPromise(
        callGrok({ prompt, model, maxTokens, temperature } as any),
        timeoutMs,
        () => logger.warn('Grok request timed out')
      );

      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta };
    } catch (err: any) {
      logger.warn('Grok provider error', { error: String(err) });
      throw new Error(`Grok provider error: ${String(err)}`);
    }
  }
}

export default GrokProvider;
