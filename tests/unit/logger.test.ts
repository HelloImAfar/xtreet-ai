import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import logger from '@/core/logger';

describe('Structured logger', () => {
  let logSpy: any;
  let warnSpy: any;
  let errSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('logs info as JSON', () => {
    logger.info('hello', { a: 1 });
    expect(logSpy).toHaveBeenCalled();
    const arg = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(arg);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello');
    expect(parsed.meta.a).toBe(1);
  });

  it('startSpan returns elapsed and logs span end', async () => {
    const end = logger.startSpan('test-span', { requestId: 'r1', step: 'do' });
    const ms = end({ extra: 1 });
    expect(typeof ms).toBe('number');
    expect(logSpy).toHaveBeenCalled();
    const arg = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(arg);
    expect(parsed.event).toBe('span');
    expect(parsed.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('logs pipeline steps', () => {
    logger.logPipelineStep('r2', 'decompose', 'start', { x: 1 });
    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('pipeline_step');
    expect(parsed.step).toBe('decompose');
    expect(parsed.message).toContain('pipeline decompose start');
  });

  it('logs provider errors', () => {
    logger.logProviderError('r3', 'openai', 'gpt', new Error('boom'), { attempt: 1 });
    expect(errSpy).toHaveBeenCalled();
    const parsed = JSON.parse(errSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('provider_error');
    expect(parsed.provider).toBe('openai');
    expect(parsed.meta.error).toContain('boom');
  });

  it('logs cost reports', () => {
    const cr = { totalTokens: 10, estimatedCost: 0.01 };
    logger.logCostReport('r4', cr, { note: 'test' });
    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('cost_report');
    expect(parsed.cost.totalTokens).toBe(10);
  });
});
