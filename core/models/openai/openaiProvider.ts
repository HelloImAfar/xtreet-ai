import logger from '../../logger';
import { timeoutPromise } from '../../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from '../provider';

const OPENAI_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function resolveOpenAIModel(alias?: string): string {
  switch (alias) {
    case 'fast':
      return process.env.OPENAI_MODEL_FAST!;
    case 'strong':
      return process.env.OPENAI_MODEL_STRONG!;
    case 'default':
    default:
      return process.env.OPENAI_MODEL_DEFAULT!;
  }
}

export class OpenAIProvider extends BaseModelProvider {
  id = 'openai';

  protected async _execute(
    prompt: string,
    config: ExecuteConfig
  ): Promise<Partial<ExecuteResult>> {
    const apiKey = config.apiKey || OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const model = resolveOpenAIModel(config.model);
    const max_tokens = config.maxTokens ?? 512;
    const temperature =
      typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = config.timeoutMs ?? 15_000;

    const body = {
      model,
      messages: [{ role: 'system', content: prompt }],
      max_tokens,
      temperature
    };

    const resp = await timeoutPromise(
      fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }),
      timeoutMs,
      () => logger.warn('OpenAI request timed out')
    );

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`OpenAI error ${resp.status}: ${t}`);
    }

    const json = await resp.json();
    const text =
      json.choices?.map((c: any) => c.message?.content || c.text).join('\n') || '';

    return {
      text,
      tokensUsed: json.usage?.total_tokens,
      meta: { raw: json }
    };
  }
}

export default OpenAIProvider;
