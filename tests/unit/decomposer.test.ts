import { describe, it, expect } from 'vitest';
import { decomposeRequest, decomposeIfNeeded } from '@/core/decomposer';

describe('decomposer', () => {
  it('returns empty array for empty input', () => {
    expect(decomposeRequest('')).toEqual([]);
  });

  it('keeps single sentence as one task', () => {
    const tasks = decomposeRequest('Write a short summary of the article.');
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe('t0');
    expect(tasks[0].text).toContain('Write a short summary');
    expect(tasks[0].meta?.parallelizable).toBe(false);
  });

  it('splits multiple sentences into tasks', () => {
    const tasks = decomposeRequest('Analyze sales for Q1. Generate charts to visualize trends.');
    expect(tasks.length).toBe(2);
    expect(tasks[0].id).toBe('t0');
    expect(tasks[1].id).toBe('t1');
  });

  it('splits conjunctions and marks as parallel when appropriate', () => {
    const tasks = decomposeRequest('Find relevant papers and summarize them.');
    expect(tasks.length).toBeGreaterThan(1);
    expect(tasks[0].meta?.parallelizable).toBe(true);
  });

  it('handles sequencing keywords and creates dependencies', () => {
    const tasks = decomposeRequest('First collect data, then analyze it.');
    expect(tasks.length).toBeGreaterThan(1);
    // the second task should depend on the first
    expect(tasks[1].dependencies).toEqual(['t0']);
    expect(tasks[1].meta?.parallelizable).toBe(false);
  });

  it('decomposeIfNeeded falls back to single task when empty result', async () => {
    const res = await decomposeIfNeeded('', 'general');
    expect(res).toEqual([{ id: 't0', text: '' }]);
  });
});
