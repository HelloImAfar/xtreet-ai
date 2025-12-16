import { describe, it, expect } from 'vitest';
import { decompose } from '@/core/decomposer';

describe('Decomposer', () => {
  it('splits a simple sentence into a single task', () => {
    const res = decompose('Tell me a joke');
    expect(res.length).toBe(1);
    expect(res[0].text).toBe('Tell me a joke');
  });

  it('splits a list into tasks', () => {
    const text = `1. Buy milk\n2. Buy eggs\n3. Go home`;
    const res = decompose(text);
    expect(res.length).toBe(3);
    expect(res[0].text).toBe('Buy milk');
    expect(res[1].text).toBe('Buy eggs');
    expect(res[2].text).toBe('Go home');
  });

  it('splits sentence with and into parallel tasks', () => {
    const res = decompose('Summarize the article and draft an email');
    expect(res.length).toBeGreaterThan(1);
    // No dependencies by default
    expect(res.some((t) => t.dependencies)).toBe(false);
  });

  it('creates dependencies when sequence markers present', () => {
    const res = decompose('First collect data, then run the analysis, and finally write the report.');
    expect(res.length).toBeGreaterThan(1);
    // tasks after first should depend on previous
    expect(res[1].dependencies).toEqual([res[0].id]);
    expect(res[2].dependencies).toEqual([res[1].id]);
  });

  it('handles semicolon separated tasks', () => {
    const res = decompose('Train the model; evaluate on test set; deploy if ok.');
    expect(res.length).toBe(3);
    expect(res[0].text).toContain('Train the model');
  });
});
