import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callGemini } from './geminiClient';

export class GeminiProvider extends BaseModelProvider {
  id = 'gemini';

  constructor() {
    super();
  }

  protected async _execute(prompt: string, config: ExecuteConfig): Promise<Partial<ExecuteResult>> {
    const model = config.model || process.env.GEMINI_MODEL || 'gemini-default';
    const maxTokens = config.maxTokens || 512;
    const temperature = typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 15_000;

    const payload = { prompt, model, maxTokens, temperature } as any;

    try {
      const resp = await timeoutPromise(callGemini(payload), timeoutMs, () => logger.warn('Gemini request timed out'));
      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta } as Partial<ExecuteResult>;
    } catch (err: any) {
      logger.warn('Gemini provider error', { error: String(err) });
      throw new Error(`Gemini provider error: ${String(err)}`);
    }
  }
}

export default GeminiProvider;