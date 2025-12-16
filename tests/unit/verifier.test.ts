import { describe, expect, it } from 'vitest';
import { verifyAgentResult, verifyTaskResults } from '@/core/verifier';
import type { AgentResult } from '@/types/rex';

describe('Verifier heuristics', () => {
  it('flags instruction violations based on request', () => {
    const ctx: any = { request: { text: "Do X. Don't mention Y." } };
    const r: AgentResult = { taskId: 't1', provider: 'mock', model: 'm', text: "We will do Y.", status: 'fulfilled' };
    const v = verifyAgentResult(r, ctx);
    expect(v.verified).toBe(false);
    expect(v.issues?.some((i) => i.type === 'instruction-violation')).toBeTruthy();
  });

  it('detects simple hallucination (facts without citation)', () => {
    const r: AgentResult = { taskId: 't2', provider: 'mock', model: 'm', text: 'The population of Atlantis is 1,234,567.', status: 'fulfilled' };
    const v = verifyAgentResult(r);
    expect(v.verified).toBe(false);
    expect(v.issues?.some((i) => i.type === 'hallucination')).toBeTruthy();
  });

  it('detects contradictions across multiple results', () => {
    const r1: AgentResult = { taskId: 't3', provider: 'a', model: 'm1', text: 'Yes, that is true.', status: 'fulfilled' };
    const r2: AgentResult = { taskId: 't3', provider: 'b', model: 'm2', text: 'No, that is false.', status: 'fulfilled' };
    const v = verifyTaskResults('t3', [r1, r2]);
    expect(v.verified).toBe(false);
    expect(v.issues?.some((i) => i.type === 'logical')).toBeTruthy();
  });

  it('passes clean output', () => {
    const r: AgentResult = { taskId: 't4', provider: 'mock', model: 'm', text: 'Perform X and then Y.', status: 'fulfilled' };
    const v = verifyAgentResult(r);
    expect(v.verified).toBe(true);
  });
});
