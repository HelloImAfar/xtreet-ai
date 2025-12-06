import { createClient } from '@supabase/supabase-js';
import logger from './logger';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  logger.warn('Supabase not configured. Memory operations will be no-ops.');
}

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export async function getMemory(userId?: string) {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('user_memory')
      .select('id,key,value,updated_at')
      .eq('user_id', userId)
      .limit(100);
    if (error) {
      logger.error('Supabase getMemory error', { error });
      return [];
    }
    return data || [];
  } catch (e) {
    logger.error('getMemory exception', { error: String(e) });
    return [];
  }
}

export async function upsertMemory(userId: string, key: string, value: any) {
  if (!supabase) return null;
  try {
    const payload = { user_id: userId, key, value };
    const { data, error } = await supabase
      .from('user_memory')
      .upsert(payload, { onConflict: 'user_id,key' })
      .select();
    if (error) {
      logger.error('Supabase upsertMemory error', { error });
      return null;
    }
    return data;
  } catch (e) {
    logger.error('upsertMemory exception', { error: String(e) });
    return null;
  }
}

export default { getMemory, upsertMemory };
