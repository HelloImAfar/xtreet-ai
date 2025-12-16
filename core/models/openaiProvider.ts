import logger from '../logger';
import { timeoutPromise } from '../../lib/utils';
import { BaseModelProvider, ExecuteConfig, ExecuteResult } from './provider';

const OPENAI_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Very small price table (USD per 1k tokens) for simple cost estimate; configurable per model
const PRICE_PER_1K: Record<string, number> = {
  'gpt-4o-mini': 0.03,
  'gpt-4.1': 0.12,
  'gpt-4': 0.06,
  'gpt-3.5-turbo': 0.002,
};

export class OpenAIProvider extends BaseModelProvider {
  id = 'openai';

  constructor() {
    super();
  }

  protected async _execute(prompt: string, config: ExecuteConfig): Promise<Partial<ExecuteResult>> {
    const apiKey = config.apiKey || OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const model = config.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const max_tokens = config.maxTokens || 512;
    const temperature = typeof config.temperature === 'number' ? config.temperature : 0.7;
    const timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 15_000;

    const body = {
      model,
      messages: [{ role: 'system', content: prompt }],
      max_tokens,
      temperature,
    } as any;

    const fn = async () => {
      const resp = await timeoutPromise(
        fetch(`${OPENAI_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        }),
        timeoutMs,
        () => logger.warn('OpenAI request timed out')
      );

      if (!resp.ok) {
        const t = await resp.text();
        logger.warn('OpenAI non-ok response', { status: resp.status, body: t });
        throw new Error(`OpenAI error: ${resp.status} ${t}`);
      }

      const json = await resp.json();
      const text = json.choices?.map((c: any) => c.message?.content || c.text).join('\n') || '';
      const usage = json.usage || {};
      const tokens = usage.total_tokens || estimateTokens(prompt);

      const costEstimate = estimateCost(tokens, model);

      return { text, tokensUsed: tokens, meta: { raw: json, costEstimate } } as Partial<ExecuteResult>;
    };

    // Let BaseModelProvider handle retry; simply return the call result
    return fn();
  }
}

function estimateTokens(text: string) {
  const words = (text || '').split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

function estimateCost(tokens: number, model: string) {
  const per1k = PRICE_PER_1K[model] ?? PRICE_PER_1K['gpt-4o-mini'];
  const cost = (tokens / 1000) * per1k;
  return { tokens, per1k, estimatedCostUSD: Number(cost.toFixed(6)) };
}

export default OpenAIProvider;
