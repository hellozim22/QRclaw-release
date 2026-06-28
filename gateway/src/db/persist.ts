/**
 * Message persistence to Supabase.
 * Stores encrypted messages and encryption keys.
 *
 * Flow: encrypt content → upsert encryption_key → insert message
 */
import { supabase, isSupabaseConfigured } from './supabase.js';
import type { EncryptedEnvelope } from '../crypto/envelope.js';
import type { DEKInfo } from '../crypto/key-manager.js';

// Cache: conversationId → encryption_keys.key_id (UUID) in DB
const encKeyDbCache = new Map<string, string>();

/**
 * Ensure an encryption_key record exists for this conversation.
 * Returns the DB key_id (UUID) for use as FK in messages table.
 */
export const upsertEncryptionKey = async (
  conversationId: string,
  info: DEKInfo
): Promise<string> => {
  // Check local cache first
  const cached = encKeyDbCache.get(conversationId);
  if (cached) return cached;

  // Check DB for existing active key
  const { data: existing } = await supabase
    .from('encryption_keys')
    .select('key_id')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (existing) {
    encKeyDbCache.set(conversationId, existing.key_id);
    return existing.key_id;
  }

  // Guard: if encryptedDek is empty (DEK came from in-memory cache after restart),
  // we cannot insert a new key — this should not happen in practice since
  // getDEK always populates encryptedDek on first generation
  if (!info.encryptedDek) {
    throw new Error(`No encrypted DEK available for conversation ${conversationId}`);
  }

  // Encode encrypted DEK as BYTEA hex
  const keyDataHex = `\\x${Buffer.from(info.encryptedDek).toString('hex')}`;

  const { data: inserted, error } = await supabase
    .from('encryption_keys')
    .insert({
      conversation_id: conversationId,
      key_data_encrypted: keyDataHex,
      algorithm: 'aes-256-gcm',
      status: 'active',
      kek_version: 1,
    })
    .select('key_id')
    .single();

  if (error) {
    // M3-C1 DB-H1: the partial unique index added in 20260420_m3_c1_fixes.sql
    // guarantees at most one active encryption_keys row per conversation.
    // When two gateway workers race on a fresh conversation the loser sees a
    // Postgres 23505 unique violation here; instead of surfacing it as an
    // error we re-read the winner's row, populate the cache, and return its
    // id so the caller can proceed without a retry loop.
    if (error.code === '23505') {
      const { data: winner, error: rereadErr } = await supabase
        .from('encryption_keys')
        .select('key_id')
        .eq('conversation_id', conversationId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (!rereadErr && winner?.key_id) {
        encKeyDbCache.set(conversationId, winner.key_id);
        return winner.key_id;
      }
    }
    throw new Error(`Upsert encryption key failed: ${error.message}`);
  }

  encKeyDbCache.set(conversationId, inserted.key_id);
  return inserted.key_id;
};

/**
 * Insert an encrypted message into the messages table.
 */
export const insertMessage = async (params: {
  conversationId: string;
  envelope: EncryptedEnvelope;
  encryptionKeyId: string;
  role: 'visitor' | 'agent';
  messageId: string;
  sentAt: string;
}): Promise<void> => {
  // Encode ciphertext as BYTEA hex
  const contentHex = `\\x${Buffer.from(params.envelope.ciphertext, 'base64').toString('hex')}`;

  const { error } = await supabase.from('messages').insert({
    conversation_id: params.conversationId,
    content_encrypted: contentHex,
    encryption_key_id: params.encryptionKeyId,
    encryption_meta: {
      iv: params.envelope.iv,
      tag: params.envelope.tag,
      algorithm: params.envelope.algorithm,
    },
    role: params.role,
    idempotency_key: params.messageId,
    message_id: params.messageId,
    sent_at: params.sentAt,
  });

  if (error) {
    // Duplicate idempotency_key is expected for dedup — not a real error
    if (error.code === '23505') {
      console.log(`[Persist] Duplicate message ${params.messageId} — already stored`);
      return;
    }
    throw new Error(`Insert message failed: ${error.message}`);
  }
};

// Cache: qrCodeId+sessionToken → conversation UUID
const convIdCache = new Map<string, string>();

/**
 * Resolve the actual conversation UUID from qrCodeId and optional sessionToken.
 * The WS protocol routes by qrCodeId, but the DB stores messages by conversation.id.
 */
export const resolveConversationId = async (
  qrCodeId: string,
  sessionToken?: string
): Promise<string | null> => {
  const cacheKey = `${qrCodeId}:${sessionToken || ''}`;
  const cached = convIdCache.get(cacheKey);
  if (cached) return cached;

  // Try to find by qrcode_id + session_token (most specific)
  if (sessionToken) {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('qrcode_id', qrCodeId)
      .eq('session_token', sessionToken)
      .limit(1)
      .maybeSingle();

    if (data) {
      convIdCache.set(cacheKey, data.id);
      return data.id;
    }
  }

  // No conversation found for this session_token — auto-create a new one.
  // Do NOT fallback to an existing conversation with a different session_token,
  // as that would mix messages from different visitors (privacy leak).

  // Auto-create conversation on first message for this qrCode + sessionToken
  if (sessionToken) {
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({ qrcode_id: qrCodeId, session_token: sessionToken })
      .select('id')
      .single();

    if (created && !error) {
      convIdCache.set(cacheKey, created.id);
      console.log(`[Persist] Auto-created conversation ${created.id} for qrCode=${qrCodeId}`);
      return created.id;
    }
    console.error('[Persist] Failed to auto-create conversation:', error?.message);
  }

  return null;
};

/**
 * Full persist pipeline: resolve conversation → encrypt → upsert key → insert message.
 */
export const persistEncryptedMessage = async (params: {
  messageId: string;
  conversationId: string;
  qrCodeId?: string;
  sessionToken?: string;
  envelope: EncryptedEnvelope;
  dekInfo: DEKInfo;
  role: 'visitor' | 'agent';
  sentAt: string;
}): Promise<void> => {
  if (!isSupabaseConfigured()) {
    console.log(`[Persist] Supabase not configured — skipping persist for ${params.messageId}`);
    return;
  }

  // Resolve the actual DB conversation ID
  let dbConversationId = params.conversationId;

  // If the conversationId looks like a qrCodeId (not a conversation UUID in DB),
  // try to resolve it to a real conversation record
  if (params.qrCodeId) {
    const resolved = await resolveConversationId(params.qrCodeId, params.sessionToken);
    if (resolved) {
      dbConversationId = resolved;
    }
  }

  // Step 1: Ensure encryption key record exists
  const encKeyId = await upsertEncryptionKey(dbConversationId, params.dekInfo);

  // Step 2: Insert encrypted message
  await insertMessage({
    conversationId: dbConversationId,
    envelope: params.envelope,
    encryptionKeyId: encKeyId,
    role: params.role,
    messageId: params.messageId,
    sentAt: params.sentAt,
  });

  console.log(
    `[Persist] Stored ${params.messageId} (${params.role}) in conversation ${dbConversationId}`
  );
};
