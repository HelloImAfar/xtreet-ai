import { describe, expect, it } from 'vitest';
import { applyUpdateStrategy, applyDecay, createSupabaseAdapter } from '@/core/memoryEngine';

describe('Memory Engine', () => {
  it('creates new memory with replace strategy', () => {
    const m = applyUpdateStrategy(null, 'note1', 'hello', { strategy: 'replace', tags: ['a'] }, 'user1');
    expect(m.key).toBe('note1');
    expect(m.value).toBe('hello');
    expect(m.tags).toContain('a');
    expect(m.score).toBeGreaterThan(0);
  });

  it('merges object when strategy is merge', () => {
    const existing = applyUpdateStrategy(null, 'profile', { name: 'A' }, { strategy: 'replace' }, 'u1');
    const updated = applyUpdateStrategy(existing, 'profile', { email: 'a@x' }, { strategy: 'merge' }, 'u1');
    expect(updated.value.name).toBe('A');
    expect(updated.value.email).toBe('a@x');
  });

  it('appends text when strategy is append', () => {
    const existing = applyUpdateStrategy(null, 'notes', 'first', { strategy: 'replace' }, 'u1');
    const appended = applyUpdateStrategy(existing, 'notes', 'second', { strategy: 'append' }, 'u1');
    expect(String(appended.value)).toContain('first');
    expect(String(appended.value)).toContain('second');
  });

  it('applies decay and TTL', () => {
    const base = new Date('2025-01-01T00:00:00Z');
    const old = { id: '1', userId: 'u', value: 'x', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', score: 5 };
    const recent = { id: '2', userId: 'u', value: 'y', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', score: 5 };
    const { updated, removeIds } = applyDecay([old as any, recent as any], { halfLifeHours: 24 * 365, ttlHours: 365 * 24 }, base);
    // old updated at is 2024-01-01 so it should be older than TTL=1 year and removed
    expect(removeIds.length).toBeGreaterThanOrEqual(1);
    expect(updated.length).toBeGreaterThanOrEqual(0);
  });

  it('creates a supabase adapter and performs basic ops (mocked client)', async () => {
    // simple in-memory mock of supabase client
    const rows: any[] = [];
    const client = {
      from(table: string) {
        return {
          select: () => ({ data: rows, error: null }),
          eq: function (k: string, v: any) {
            // return chained object
            return this;
          },
          in: function (k: string, v: any[]) {
            return this;
          },
          order: function () {
            return this;
          },
          limit: function () {
            return this;
          },
          maybeSingle: async function () {
            return { data: rows[0] || null, error: null };
          },
          insert: async function (payload: any) {
            const row = { id: String(rows.length + 1), ...payload };
            rows.push(row);
            return { data: row, error: null };
          },
          update: async function (payload: any) {
            if (!rows[0]) return { data: null, error: null };
            Object.assign(rows[0], payload);
            return { data: rows[0], error: null };
          },
          delete: async function () {
            rows.length = 0;
            return { data: null, error: null };
          },
        };
      },
    } as any;

    const adapter = createSupabaseAdapter(client, 'memories');
    const created = await adapter.upsert('u1', 'k1', { hello: 'world' }, { strategy: 'replace' });
    expect(created.key).toBe('k1');
    const found = await adapter.getById('u1', created.id);
    // our mock getById returns first row only
    expect(found).not.toBeNull();
    const list = await adapter.listForUser('u1');
    expect(Array.isArray(list)).toBeTruthy();
    const deleted = await adapter.delete('u1', created.id);
    expect(deleted).toBe(true);
  });
});
