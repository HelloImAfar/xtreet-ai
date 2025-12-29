import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callGemini } from './geminiClient';

/* -------------------------------------------------------------------------- */
/* MODEL RESOLUTION                                                           */
/* -------------------------------------------------------------------------- */

function resolveGeminiModel(alias?: string): string {
  switch (alias) {
    case 'fast':
      return process.env.GEMINI_MODEL_FAST!;
    case 'strong':
      return process.env.GEMINI_MODEL_STRONG!;
    case 'default':
    default:
      return process.env.GEMINI_MODEL_DEFAULT!;
  }
}

/* -------------------------------------------------------------------------- */
/* PROVIDER                                                                   */
/* -------------------------------------------------------------------------- */

export class GeminiProvider extends BaseModelProvider {
  id = 'gemini';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveGeminiModel(config.model);
    const maxTokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    // 🔍 DEBUG CRÍTICO
    logger.info({
      event: 'gemini_execute',
      model,
      maxTokens,
      temperature
    });

    try {
      const resp = await timeoutPromise(
        callGemini({
          prompt,
          model,
          maxTokens,
          temperature
        }),
        timeoutMs,
        () => logger.warn('Gemini request timed out')
      );

      return {
        text: resp.text ?? '',
        tokensUsed: resp.tokensUsed,
        meta: resp.meta
      };
    } catch (err: any) {
      logger.warn('Gemini provider error', {
        model,
        error: err instanceof Error ? err.message : String(err)
      });

      throw new Error(`Gemini provider error: ${String(err)}`);
    }
  }
}

export default GeminiProvider;
