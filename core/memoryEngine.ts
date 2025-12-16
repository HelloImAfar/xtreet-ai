import type { DecomposedTask } from '@/types/rex';

export type MemoryItem = {
  id: string;
  userId: string;
  key?: string;
  value: any;
  tags?: string[];
  score?: number; // importance score
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type MemoryUpdateOptions = {
  strategy?: 'merge' | 'replace' | 'append';
  tags?: string[];
};

export type DecayOptions = {
  halfLifeHours?: number; // for exponential decay of score
  ttlHours?: number; // remove memories older than this
};

export interface MemoryClient {
  getById(userId: string, id: string): Promise<MemoryItem | null>;
  listForUser(userId: string, opts?: { tags?: string[]; limit?: number }): Promise<MemoryItem[]>;
  upsert(userId: string, key: string | undefined, value: any, opts?: MemoryUpdateOptions): Promise<MemoryItem>;
  delete(userId: string, id: string): Promise<boolean>;
}

/**
 * In-memory helper to apply update strategies
 */
export function applyUpdateStrategy(existing: MemoryItem | null, key: string | undefined, value: any, opts?: MemoryUpdateOptions, userId?: string): MemoryItem {
  const now = new Date().toISOString();
  if (!existing) {
    return {
      id: `${userId || 'u'}:${key || Math.random().toString(36).slice(2, 8)}`,
      userId: userId || 'unknown',
      key: key,
      value,
      tags: opts?.tags || [],
      score: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  const updated: MemoryItem = { ...existing };
  if (opts?.strategy === 'replace' || opts?.strategy === undefined) {
    updated.value = value;
  } else if (opts.strategy === 'merge' && typeof existing.value === 'object' && existing.value && typeof value === 'object') {
    updated.value = { ...existing.value, ...value };
  } else if (opts.strategy === 'append' && typeof existing.value === 'string') {
    updated.value = existing.value + '\n' + String(value);
  } else {
    // fallback: replace
    updated.value = value;
  }

  updated.tags = Array.from(new Set([...(existing.tags || []), ...(opts?.tags || [])]));
  updated.score = Math.min(10, (existing.score || 1) + 0.5);
  updated.updatedAt = now;
  return updated;
}

/**
 * Apply decay to a list of memories and return updates + ids to remove
 */
export function applyDecay(memories: MemoryItem[], opts?: DecayOptions, nowDate?: Date): { updated: MemoryItem[]; removeIds: string[] } {
  const now = nowDate || new Date();
  const halfLifeHours = opts?.halfLifeHours ?? 24 * 7; // default 1 week
  const ttlHours = opts?.ttlHours;

  const updated: MemoryItem[] = [];
  const removeIds: string[] = [];

  for (const m of memories) {
    const updatedAt = new Date(m.updatedAt);
    const ageHours = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
    if (ttlHours && ageHours > ttlHours) {
      removeIds.push(m.id);
      continue;
    }

    // exponential decay of score
    const decayFactor = Math.pow(0.5, ageHours / (halfLifeHours || 1));
    const newScore = (m.score || 1) * decayFactor;
    updated.push({ ...m, score: newScore });
  }

  return { updated, removeIds };
}

/**
 * Supabase-compatible adapter helper. Accepts a supabase client instance (not hardcoded) and a table name.
 * The client is expected to follow supabase-js client API (client.from(table).select/insert/update/delete)
 */
export function createSupabaseAdapter(client: any, table = 'memories'): MemoryClient {
  if (!client) throw new Error('Supabase client required');

  const normalize = (row: any): MemoryItem => ({
    id: String(row.id),
    userId: String(row.user_id),
    key: row.key || undefined,
    value: row.value,
    tags: row.tags || [],
    score: row.score ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return {
    async getById(userId: string, id: string) {
      const { data, error } = await client.from(table).select('*').eq('user_id', userId).eq('id', id).limit(1).maybeSingle();
      if (error) throw error;
      return data ? normalize(data) : null;
    },

    async listForUser(userId: string, opts?: { tags?: string[]; limit?: number }) {
      let q = client.from(table).select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (opts?.tags && opts.tags.length) {
        q = q.in('tags', opts.tags);
      }
      if (opts?.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(normalize);
    },

    async upsert(userId: string, key: string | undefined, value: any, opts?: MemoryUpdateOptions) {
      // attempt to find existing by key
      if (key) {
        const { data: existing } = await client.from(table).select('*').eq('user_id', userId).eq('key', key).limit(1).maybeSingle();
        const row = existing ? normalize(existing) : null;
        const merged = applyUpdateStrategy(row, key, value, opts, userId);
        const payload = {
          user_id: userId,
          key: merged.key,
          value: merged.value,
          tags: merged.tags,
          score: merged.score,
          updated_at: merged.updatedAt,
          created_at: merged.createdAt,
        };
        if (row) {
          const { data, error } = await client.from(table).update(payload).eq('id', row.id).select().maybeSingle();
          if (error) throw error;
          return normalize(data);
        }
        const { data, error } = await client.from(table).insert(payload).select().maybeSingle();
        if (error) throw error;
        return normalize(data);
      }

      // no key: create new
      const created = applyUpdateStrategy(null, undefined, value, opts, userId);
      const payload = { user_id: userId, key: created.key, value: created.value, tags: created.tags, score: created.score, created_at: created.createdAt, updated_at: created.updatedAt };
      const { data, error } = await client.from(table).insert(payload).select().maybeSingle();
      if (error) throw error;
      return normalize(data);
    },

    async delete(userId: string, id: string) {
      const { error } = await client.from(table).delete().eq('user_id', userId).eq('id', id);
      if (error) throw error;
      return true;
    },
  };
}

export default { applyUpdateStrategy, applyDecay, createSupabaseAdapter };
