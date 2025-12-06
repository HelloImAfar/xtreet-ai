import { describe, it, expect } from 'vitest';
import { classify } from '@/core/classifier';
import type { Category } from '@/types';

describe('Classifier', () => {
  const testCases: Array<{ text: string; expectedCategory: Category; description: string }> = [
    // Creative
    { text: 'Write a poem about love', expectedCategory: 'creative', description: 'poem request' },
    { text: 'Help me write a short story', expectedCategory: 'creative', description: 'story request' },
    { text: 'Create a creative title for my project', expectedCategory: 'creative', description: 'creative content' },
    { text: 'Write a song about freedom', expectedCategory: 'creative', description: 'song request' },

    // Emotional
    { text: 'I feel sad today', expectedCategory: 'emotional', description: 'emotional expression' },
    { text: 'Help me with anxiety', expectedCategory: 'emotional', description: 'mental health' },
    { text: 'I am anxious about my presentation', expectedCategory: 'emotional', description: 'anxiety' },

    // Code
    { text: 'Fix my JavaScript function', expectedCategory: 'code', description: 'code error' },
    { text: 'TypeError: undefined is not a function', expectedCategory: 'code', description: 'stack trace' },
    { text: 'How do I define a class in TypeScript?', expectedCategory: 'code', description: 'class question' },
    { text: 'Why is this function throwing an error?', expectedCategory: 'code', description: 'bug' },
    { text: 'Does my code compile?', expectedCategory: 'code', description: 'compilation' },

    // Vision
    { text: 'Describe this image', expectedCategory: 'vision', description: 'image description' },
    { text: 'Analyze the photo', expectedCategory: 'vision', description: 'photo analysis' },
    { text: 'What do you see in this vision?', expectedCategory: 'vision', description: 'vision query' },

    // Current
    { text: 'What is the latest news today?', expectedCategory: 'current', description: 'current news' },
    { text: 'Tell me the current weather', expectedCategory: 'current', description: 'current info' },
    { text: 'What is happening in the news?', expectedCategory: 'current', description: 'news question' },

    // Math
    { text: 'Solve this integral for me', expectedCategory: 'math', description: 'integral' },
    { text: 'Calculate 2+2', expectedCategory: 'math', description: 'simple math' },
    { text: 'How do I solve this equation?', expectedCategory: 'math', description: 'equation' },

    // Informative
    { text: 'What is machine learning?', expectedCategory: 'informative', description: 'what is' },
    { text: 'Explain quantum computing', expectedCategory: 'informative', description: 'explain' }
  ];

  testCases.forEach((tc) => {
    it(`should classify "${tc.description}" correctly`, async () => {
      const result = await classify(tc.text);
      expect(result.category).toBe(tc.expectedCategory);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('should have confidence > 0 and <= 1 for all inputs', async () => {
    const texts = [
      'random text that does not match any keyword',
      'hello world',
      'what is this'
    ];

    for (const text of texts) {
      const result = await classify(text);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
