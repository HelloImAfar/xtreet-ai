import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MistralProvider } from '@/core/models/mistral/mistralProvider';
import * as client from '@/core/models/mistral/mistralClient';

describe('MistralProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.MISTRAL_API_KEY;
  });

  it('returns stub text when API key not configured', async () => {
    const p = new MistralProvider();
    const res = await p.execute('hello');
    expect(res.text).toContain('stub');
  });

  it('respects timeout (rejects on timeout)', async () => {
    vi.spyOn(client, 'callMistral').mockImplementation(() => new Promise(() => {} as any));
    const p = new MistralProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});