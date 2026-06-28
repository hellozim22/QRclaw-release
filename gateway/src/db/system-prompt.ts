/**
 * QR Code system_prompt resolver with in-memory cache.
 * Fetches system_prompt from Supabase qrcodes table, caches for 5 minutes.
 */
import { supabase, isSupabaseConfigured } from './supabase.js';

interface CachedPrompt {
  systemPrompt: string | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const promptCache = new Map<string, CachedPrompt>();

/**
 * Get the system_prompt for a QR code ID.
 * Returns null if not configured, not found, or Supabase unavailable.
 */
export const getSystemPrompt = async (qrCodeId: string): Promise<string | null> => {
  if (!isSupabaseConfigured() || !qrCodeId) return null;

  const cached = promptCache.get(qrCodeId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.systemPrompt;
  }

  try {
    const { data, error } = await supabase
      .from('qrcodes')
      .select('system_prompt')
      .eq('id', qrCodeId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[SystemPrompt] Lookup failed:', error.message);
      return null;
    }

    const prompt = data?.system_prompt ?? null;
    promptCache.set(qrCodeId, { systemPrompt: prompt, fetchedAt: Date.now() });
    return prompt;
  } catch (err) {
    console.error('[SystemPrompt] Error:', (err as Error).message);
    return null;
  }
};
