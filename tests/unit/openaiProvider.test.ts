import { describe, expect, it, beforeEach, vi } from 'vitest';
import { OpenAIProvider } from '@/core/models/openaiProvider';

describe('OpenAIProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // @ts-ignore
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
  });

  it('executes and returns tokens and cost estimate when API returns usage', async () => {
    const mockJson = {
      choices: [{ message: { content: 'ok' } }],
      usage: { total_tokens: 123 },
    };
    // @ts-ignore
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => mockJson });

    process.env.OPENAI_API_KEY = 'test';
    const p = new OpenAIProvider();
    const res = await p.execute('hello world', { model: 'gpt-4o-mini', timeoutMs: 2000 });

    expect(res.text).toBe('ok');
    expect(res.tokensUsed).toBe(123);
    expect(res.meta?.costEstimate).toBeDefined();
    expect(typeof res.latencyMs).toBe('number');
  });

  it('respects timeout (rejects on timeout)', async () => {
    // fetch that never resolves
    // @ts-ignore
    globalThis.fetch.mockImplementation(() => new Promise(() => {}));
    process.env.OPENAI_API_KEY = 'test';
    const p = new OpenAIProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});
