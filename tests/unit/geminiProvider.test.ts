import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '@/core/models/gemini/geminiProvider';
import * as client from '@/core/models/gemini/geminiClient';

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it('returns stub text when API key not configured', async () => {
    const p = new GeminiProvider();
    const res = await p.execute('hello');
    expect(res.text).toContain('stub');
  });

  it('respects timeout (rejects on timeout)', async () => {
    vi.spyOn(client, 'callGemini').mockImplementation(() => new Promise(() => {} as any));
    const p = new GeminiProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});