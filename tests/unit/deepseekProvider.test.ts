import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DeepSeekProvider } from '@/core/models/deepseek/deepseekProvider';
import * as client from '@/core/models/deepseek/deepseekClient';

describe('DeepSeekProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('returns stub text when API key not configured', async () => {
    const p = new DeepSeekProvider();
    const res = await p.execute('hello');
    expect(res.text).toContain('stub');
  });

  it('respects timeout (rejects on timeout)', async () => {
    vi.spyOn(client, 'callDeepSeek').mockImplementation(() => new Promise(() => {} as any));
    const p = new DeepSeekProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});