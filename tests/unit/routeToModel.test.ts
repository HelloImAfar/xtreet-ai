import { describe, it, expect } from 'vitest';
import { selectModel } from '@/core/engine';
import type { Category } from '@/types';

describe('Model Selection', () => {
  const categories: Category[] = [
    'creative',
    'emotional',
    'code',
    'vision',
    'current',
    'math',
    'branding',
    'efficiency',
    'informative',
    'other'
  ];

  categories.forEach((category) => {
    it(`should select a model for category ${category}`, () => {
      const selection = selectModel(category);
      expect(selection.model).toBeDefined();
      expect(selection.module).toBeDefined();
      expect(selection.temperature).toBeGreaterThanOrEqual(0);
      expect(selection.temperature).toBeLessThanOrEqual(1);
    });
  });

  it('creative should have high temperature', () => {
    const { temperature } = selectModel('creative');
    expect(temperature).toBeGreaterThan(0.7);
  });

  it('code should have low temperature', () => {
    const { temperature } = selectModel('code');
    expect(temperature).toBeLessThan(0.3);
  });

  it('math should have low temperature', () => {
    const { temperature } = selectModel('math');
    expect(temperature).toBeLessThan(0.3);
  });

  it('all selections should use openai module by default', () => {
    for (const cat of categories) {
      const { module } = selectModel(cat);
      expect(module.callModel).toBeDefined();
    }
  });
});
