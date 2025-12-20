import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LlamaProvider } from '@/core/models/llama/llamaProvider';
import * as client from '@/core/models/llama/llamaClient';

describe('LlamaProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns stub text (llama is local stub)', async () => {
    const p = new LlamaProvider();
    const res = await p.execute('hello');
    expect(res.text).toContain('LLAMA-STUB');
  });

  it('respects timeout (rejects on timeout)', async () => {
    vi.spyOn(client, 'callLlama').mockImplementation(() => new Promise(() => {} as any));
    const p = new LlamaProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});