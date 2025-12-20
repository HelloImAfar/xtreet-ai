import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GrokProvider } from '@/core/models/grok/grokProvider';
import * as client from '@/core/models/grok/grokClient';

describe('GrokProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GROK_API_KEY;
  });

  it('returns stub text when API key not configured', async () => {
    const p = new GrokProvider();
    const res = await p.execute('hello');
    expect(res.text).toContain('stub');
  });

  it('respects timeout (rejects on timeout)', async () => {
    vi.spyOn(client, 'callGrok').mockImplementation(() => new Promise(() => {} as any));
    const p = new GrokProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});