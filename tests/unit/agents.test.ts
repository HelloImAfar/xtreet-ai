import { describe, expect, it } from 'vitest';
import { runAgents } from '@/core/agents/agent';
import LogicalAuditorAgent from '@/core/agents/logicalAuditor';
import StyleRefinementAgent from '@/core/agents/styleRefinement';
import CostOptimizationAgent from '@/core/agents/costOptimization';
import SynthesisAgent from '@/core/agents/synthesis';

describe('Agents basic behaviour', () => {
  it('LogicalAuditorAgent detects contradictions', async () => {
    const text = "Do X. Don't do X.";
    const outs = await runAgents([LogicalAuditorAgent], { text });
    expect(outs.length).toBe(1);
    expect(outs[0].issues?.length).toBeGreaterThan(0);
  });

  it('StyleRefinementAgent shortens long sentences and notes passive voice', async () => {
    const long = 'This is a long sentence, with many, many clauses, that could be shorter and clearer, and perhaps split into multiple sentences for readability.';
    const outs = await runAgents([StyleRefinementAgent], { text: long });
    expect(outs[0].notes?.length).toBeGreaterThanOrEqual(1);
    expect(outs[0].text?.length).toBeLessThanOrEqual(long.length);
  });

  it('CostOptimizationAgent returns token estimate and suggestions', async () => {
    const t = 'word '.repeat(400);
    const outs = await runAgents([CostOptimizationAgent], { text: t });
    expect(outs[0].metadata?.approxTokens).toBeGreaterThan(0);
    expect(outs[0].notes?.length).toBeGreaterThan(0);
  });

  it('SynthesisAgent produces short synthesis', async () => {
    const t = 'First do this. Then do that. Finally conclude.';
    const outs = await runAgents([SynthesisAgent], { text: t });
    expect(outs[0].text).toContain('First do this');
    expect(outs[0].notes?.length).toBeGreaterThan(0);
  });

  it('Agents are removable (empty list)', async () => {
    const outs = await runAgents([], { text: 'nothing' });
    expect(outs).toEqual([]);
  });
});
