import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from '@/core/models/claude/claudeProvider';
import * as client from '@/core/models/claude/claudeClient';

describe('ClaudeProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.CLAUDE_API_KEY;
  });

  it('returns stub text when API key not configured', async () => {
    const p = new ClaudeProvider();
    const res = await p.execute('hello');
    expect(res.text).toContain('stub');
    expect(typeof res.latencyMs).toBe('number');
  });

  it('respects timeout (rejects on timeout)', async () => {
    // mock client to never resolve
    vi.spyOn(client, 'callClaude').mockImplementation(() => new Promise(() => {} as any));
    const p = new ClaudeProvider();
    await expect(p.execute('x', { timeoutMs: 10, retries: 1 })).rejects.toThrow();
  });
});