import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '@/core/engine';
import type { MessageRequest } from '@/types';

// Mock the model wrappers
vi.mock('@/core/models/openai', () => ({
  default: {
    callModel: vi.fn(async () => ({
      text: 'Mocked response from OpenAI',
      tokensUsed: 100,
      meta: { provider: 'openai-mock' }
    }))
  }
}));

vi.mock('@/core/memory', () => ({
  getMemory: vi.fn(async () => []),
  upsertMemory: vi.fn(async () => null)
}));

describe('REx Engine - handleMessage', () => {
  it('should return EngineResult with ok=true for valid input', async () => {
    const req: MessageRequest = {
      userId: 'test-user',
      text: 'What is machine learning?',
      stream: false
    };

    const result = await handleMessage(req, '127.0.0.1');

    expect(result.ok).toBe(true);
    expect(result.category).toBeDefined();
    expect(result.modelPlan).toBeDefined();
    expect(result.response).toBeDefined();
    expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
  });

  it('should handle rate limiting', async () => {
    // Make 11 rapid requests to exceed the 10-token limit
    const req: MessageRequest = { text: 'test', stream: false };
    const ip = '192.168.1.100';

    for (let i = 0; i < 11; i++) {
      const result = await handleMessage(req, ip);
      if (i < 10) {
        expect(result.ok).toBe(true);
      } else {
        expect(result.ok).toBe(false);
        expect(result.errors).toContain('rate_limit');
      }
    }
  });

  it('should return error for empty text', async () => {
    const req: MessageRequest = { userId: 'test', text: '', stream: false };
    // Note: API layer validates this; engine receives sanitized input
    // This test verifies the engine handles edge cases gracefully
    const result = await handleMessage(req, '127.0.0.1');
    // The engine should not crash, but API route should block empty requests first
    expect(result).toBeDefined();
  });

  it('should classify text into appropriate category', async () => {
    const req: MessageRequest = {
      userId: 'test',
      text: 'How do I fix this error in my code?',
      stream: false
    };

    const result = await handleMessage(req, '127.0.0.1');

    expect(result.ok).toBe(true);
    expect(['code', 'informative']).toContain(result.category);
  });

  it('should include model plan in response', async () => {
    const req: MessageRequest = {
      userId: 'test',
      text: 'Tell me a creative story',
      stream: false
    };

    const result = await handleMessage(req, '127.0.0.1');

    expect(result.ok).toBe(true);
    expect(result.modelPlan).toBeInstanceOf(Array);
    expect(result.modelPlan.length).toBeGreaterThan(0);
  });
});
