import { describe, expect, it } from 'vitest';
import { MockProvider } from '@/core/models/mockProvider';

describe('ModelProvider interface and BaseModelProvider behaviour', () => {
  it('execute returns text, tokensUsed and latencyMs', async () => {
    const p = new MockProvider();
    const res = await p.execute('hello world');
    expect(res.text).toBe('hello world');
    expect(typeof res.tokensUsed).toBe('number');
    expect(typeof res.latencyMs).toBe('number');
    expect(res.latencyMs! >= 0).toBeTruthy();
  });

  it('respects retries and succeeds after transient failures', async () => {
    const p = new MockProvider({ failTimes: 2 });
    // default retries is 3 -> should succeed
    const res = await p.execute('retry me');
    expect(res.text).toBe('retry me');
  });

  it('throws if retries are insufficient', async () => {
    const p = new MockProvider({ failTimes: 3 });
    await expect(p.execute('nope', { retries: 2 })).rejects.toThrow();
  });
});
