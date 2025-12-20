import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QwenProvider } from '@/core/models/qwen/qwenProvider';
import * as client from '@/core/models/qwen/qwenClient';

describe('QwenProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.QWEN_API_KEY;
  });

  it('returns stub text when API key not configured', async () => {
    const p = new QwenProvider();
    const res = await p.execute('hello');
    expect(res.text).toContain('stub');
  });

  it('respects timeout (rejects on timeout)', async () => {
    vi.spyOn(client, 'callQwen').mockImplementation(() => new Promise(() => {} as any));
    const p = new QwenProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});