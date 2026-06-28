/**
 * Owner Agent Chat DEK resolution — cache + DB reload + generation.
 *
 * Without DB reload, gateway restart generates a fresh in-memory DEK while
 * owner_agent_conversation_keys still wraps the old one, breaking decrypt.
 */
import type { DEKInfo } from './key-manager.js';
import { getDEK } from './key-manager.js';
import { byteaToUtf8String, unwrapDEK } from './dek-unwrap.js';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';

const resolveKek = (): string =>
  (process.env.QRCLAW_KEK_V1 ?? process.env.ENCRYPTION_KEK ?? '').trim();

const DEK_TTL_MS = 24 * 60 * 60 * 1000;

type CachedDek = { rawDek: Buffer; dekId: string; cachedAt: number };

// Shared with getDEK via the same module-level map in key-manager — re-export
// a dedicated owner-agent loader that writes into getDEK's cache by calling
// getDEK's internal path after priming from DB.

const ownerAgentDekCache = new Map<string, CachedDek>();

const loadPersistedOwnerAgentDek = async (
  conversationId: string,
): Promise<{ rawDek: Buffer; dekId: string; encryptedDek: string } | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('owner_agent_conversation_keys')
    .select('key_id, key_data_encrypted')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error || !data?.key_id || !data.key_data_encrypted) {
    return null;
  }

  const kek = resolveKek();
  if (!kek) {
    return null;
  }

  try {
    const encryptedDek = byteaToUtf8String(data.key_data_encrypted);
    const rawDek = unwrapDEK(encryptedDek, kek);
    return { rawDek, dekId: data.key_id, encryptedDek };
  } catch (err) {
    console.error(
      '[owner-agent-dek] Failed to unwrap persisted DEK:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
};

export const getOwnerAgentDEK = async (
  conversationId: string,
): Promise<{ rawDek: Buffer; dekId: string; info: DEKInfo }> => {
  const cached = ownerAgentDekCache.get(conversationId);
  if (cached && Date.now() - cached.cachedAt < DEK_TTL_MS) {
    return {
      rawDek: cached.rawDek,
      dekId: cached.dekId,
      info: {
        dekId: cached.dekId,
        encryptedDek: '',
        createdAt: '',
        expiresAt: '',
      },
    };
  }

  if (cached) {
    ownerAgentDekCache.delete(conversationId);
  }

  const persisted = await loadPersistedOwnerAgentDek(conversationId);
  if (persisted) {
    ownerAgentDekCache.set(conversationId, {
      rawDek: persisted.rawDek,
      dekId: persisted.dekId,
      cachedAt: Date.now(),
    });
    const now = new Date();
    return {
      rawDek: persisted.rawDek,
      dekId: persisted.dekId,
      info: {
        dekId: persisted.dekId,
        encryptedDek: persisted.encryptedDek,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + DEK_TTL_MS).toISOString(),
      },
    };
  }

  const generated = await getDEK(conversationId);
  ownerAgentDekCache.set(conversationId, {
    rawDek: generated.rawDek,
    dekId: generated.dekId,
    cachedAt: Date.now(),
  });
  return generated;
};
