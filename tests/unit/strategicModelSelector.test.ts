import { describe, it, expect } from 'vitest';
import { selectStrategicModel } from '../../core/strategicModelSelector';

describe('selectStrategicModel', () => {
  it('returns a deterministic OpenAI selection for a creative high-complexity task', () => {
    const res = selectStrategicModel('creative', 0.5, 'high');
    expect(res.provider).toBe('openai');
    expect(res.model).toBeDefined();
    expect(res.temperature).toBeGreaterThan(0);
    expect(res.reason).toContain('Category: creative');
  });

  it('low confidence favors more exploratory temperature', () => {
    const low = selectStrategicModel('code', 0.2, 'medium');
    const high = selectStrategicModel('code', 0.95, 'medium');
    expect(low.temperature).toBeGreaterThanOrEqual(high.temperature);
  });
});