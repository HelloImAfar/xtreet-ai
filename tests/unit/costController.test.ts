import { describe, expect, it } from 'vitest';
import { CostController } from '@/core/costController';

describe('CostController', () => {
  it('calculates tokens and estimates cost', () => {
    const c = new CostController({ userId: 'u1' });
    c.addUsage({ provider: 'openai', model: 'gpt-3.5-turbo', tokensOutput: 1000 });
    const r = c.getReport();
    expect(r.totalTokens).toBe(1000);
    expect(r.estimatedCost).toBeGreaterThan(0);
    expect(r.breakdown.length).toBe(1);
  });

  it('enforces request and user limits', () => {
    const c = new CostController({ userId: 'u2', requestTokenLimit: 50, requestCostLimit: 0.0001, userTokenLimit: 500, userCostLimit: 0.1 });
    c.addUsage({ provider: 'openai', model: 'gpt-3.5-turbo', tokensOutput: 100 });
    const issues = c.checkLimits();
    expect(issues.length).toBeGreaterThan(0);
    // user accumulators persist, so a second controller will see existing accum
    const c2 = new CostController({ userId: 'u2', requestTokenLimit: 1000 });
    c2.addUsage({ provider: 'openai', model: 'gpt-3.5-turbo', tokensOutput: 200 });
    const issues2 = c2.checkLimits();
    expect(issues2.some((s) => s.includes('user token limit'))).toBeTruthy();
  });

  it('allows resetting user accum', () => {
    const c = new CostController({ userId: 'reset-me' });
    c.addUsage({ provider: 'openai', model: 'gpt-3.5-turbo', tokensOutput: 1000 });
    CostController.resetUserAccum('reset-me');
    const c2 = new CostController({ userId: 'reset-me', userTokenLimit: 10 });
    c2.addUsage({ provider: 'openai', model: 'gpt-3.5-turbo', tokensOutput: 1 });
    const issues = c2.checkLimits();
    expect(issues.length).toBe(0);
  });
});
