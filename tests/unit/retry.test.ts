import { describe, expect, it } from 'vitest';
import { executeWithFailover } from '@/core/retry';
import type { ModelProvider } from '@/core/models/provider';

const makeProvider = (
  id: string,
  behavior: 'ok' | 'throw' | 'partial',
  text?: string,
  failTimes = 0
): ModelProvider => {
  let failsLeft = failTimes;

  return {
    id,
    async execute(prompt: string) {
      if (failsLeft > 0) {
        failsLeft -= 1;
        throw new Error('transient');
      }

      if (behavior === 'throw') {
        throw new Error('boom');
      }

      if (behavior === 'partial') {
        return {
          text: text ?? prompt.slice(0, 10),
          tokensUsed: 5,
          meta: { partial: true },
        } as any;
      }

      return {
        text: text ?? `resp from ${id}`,
        tokensUsed: 10,
        meta: {},
      } as any;
    },
  } as ModelProvider;
};

describe('executeWithFailover', () => {
  it('succeeds with first provider', async () => {
    const p1 = makeProvider('p1', 'ok');

    const out = await executeWithFailover([p1], 'hi', {}, { backoff: 'constant' });

    expect(out.result?.text).toContain('resp from p1');
    expect(out.partial).toBe(false);
  });

  it('fails over to second provider if first throws', async () => {
    const p1 = makeProvider('p1', 'throw');
    const p2 = makeProvider('p2', 'ok');

    const out = await executeWithFailover(
      [p1, p2],
      'hi',
      {},
      { backoff: 'constant', backoffBaseMs: 1 }
    );

    expect(out.result?.text).toContain('resp from p2');
    expect(out.usedProviders).toEqual(['p1', 'p2']);
  });

  it('merges partial responses when no full provider succeeds', async () => {
    const p1 = makeProvider('p1', 'partial', 'part1');
    const p2 = makeProvider('p2', 'partial', 'part2');

    const out = await executeWithFailover(
      [p1, p2],
      'hi',
      {},
      { allowPartial: true }
    );

    expect(out.partial).toBe(true);
    expect(out.result?.text).toContain('part1');
    expect(out.result?.text).toContain('part2');
  });

  it('recovers from transient provider failures', async () => {
    const p1 = makeProvider('p1', 'ok', undefined, 2);

    const out = await executeWithFailover(
      [p1],
      'hi',
      {},
      { backoff: 'exponential', backoffBaseMs: 1 }
    );

    expect(out.result?.text).toContain('resp from p1');
  });
});
