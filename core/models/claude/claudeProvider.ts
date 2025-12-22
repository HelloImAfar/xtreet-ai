import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';
import { callClaude } from './claudeClient';

function resolveClaudeModel(alias?: string): string {
  switch (alias) {
    case 'fast':
      return process.env.CLAUDE_MODEL_FAST!;
    case 'strong':
      return process.env.CLAUDE_MODEL_STRONG!;
    case 'default':
    default:
      return process.env.CLAUDE_MODEL_DEFAULT!;
  }
}

export class ClaudeProvider extends BaseModelProvider {
  id = 'claude';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const model = resolveClaudeModel(config.model);
    const maxTokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    try {
      const resp = await timeoutPromise(
        callClaude({ prompt, model, maxTokens, temperature } as any),
        timeoutMs,
        () => logger.warn('Claude request timed out')
      );

      return { text: resp.text ?? '', tokensUsed: resp.tokensUsed, meta: resp.meta };
    } catch (err: any) {
      logger.warn('Claude provider error', { error: String(err) });
      throw new Error(`Claude provider error: ${String(err)}`);
    }
  }
}

export default ClaudeProvider;
