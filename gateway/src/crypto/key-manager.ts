/**
 * DEK (Data Encryption Key) management — write path only.
 *
 * Per §10.3: KEK → DEK → Data three-layer model. Each conversation gets its
 * own DEK. DEKs are encrypted with the KEK (from env) before storage.
 *
 * M3-T6:
 *   - The read-path `decryptDEK` was retired. Read-side decryption lives
 *     solely in the `decrypted-messages` Supabase Edge Function which reads
 *     the same KEK over Web Crypto. Keeping the gateway encrypt-only tightens
 *     Iron Rule C2 ("Gateway stores but never reads message content").
 *   - The KEK env var is unified on `QRCLAW_KEK_V1`. Legacy `ENCRYPTION_KEK`
 *     is still honoured as a deprecated fallback so stale ops configs don't
 *     immediately break; a one-time warning nudges operators to migrate.
 */
import { randomBytes, createCipheriv } from 'crypto';

export interface DEKInfo {
  dekId: string;
  encryptedDek: string;
  createdAt: string;
  expiresAt: string;
}

const resolveKek = (): string => {
  const preferred = (process.env.QRCLAW_KEK_V1 ?? '').trim();
  if (preferred) return preferred;

  const legacy = (process.env.ENCRYPTION_KEK ?? '').trim();
  if (legacy) {
    // Emit the deprecation warning exactly once per process.
    if (!globalThis.__QRCLAW_KEK_LEGACY_WARNED__) {
      console.warn(
        '[crypto] ENCRYPTION_KEK is deprecated; set QRCLAW_KEK_V1 instead. Falling back to ENCRYPTION_KEK for this process.'
      );
      globalThis.__QRCLAW_KEK_LEGACY_WARNED__ = true;
    }
    return legacy;
  }
  return '';
};

declare global {
  // eslint-disable-next-line no-var
  var __QRCLAW_KEK_LEGACY_WARNED__: boolean | undefined;
}

const KEK = resolveKek();
const DEK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEK_CACHE_MAX_SIZE = 10000;

// In-memory cache: conversationId → { rawDek, dekId, cachedAt }
const dekCache = new Map<string, { rawDek: Buffer; dekId: string; cachedAt: number }>();

// Pending DEK generation promises to prevent race conditions
const pendingDEKs = new Map<string, Promise<{ rawDek: Buffer; dekId: string; info: DEKInfo }>>();

/**
 * Evict expired entries and enforce max cache size.
 * Called on each getDEK to prevent unbounded memory growth.
 */
const evictExpiredEntries = (): void => {
  const now = Date.now();
  for (const [key, entry] of dekCache) {
    if (now - entry.cachedAt > DEK_TTL_MS) {
      dekCache.delete(key);
    }
  }
  // If still over limit after TTL eviction, remove oldest entries
  if (dekCache.size > DEK_CACHE_MAX_SIZE) {
    const excess = dekCache.size - DEK_CACHE_MAX_SIZE;
    const keys = dekCache.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next();
      if (value) dekCache.delete(value);
    }
  }
};

/**
 * Generate a new 256-bit DEK, encrypt it with the KEK, and cache it.
 */
const generateDEK = (conversationId: string): { rawDek: Buffer; dekId: string; info: DEKInfo } => {
  const rawDek = randomBytes(32);
  const dekId = `dek_${randomBytes(8).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEK_TTL_MS);

  let encryptedDek: string;

  if (KEK) {
    const kekBuffer = Buffer.from(KEK, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', kekBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(rawDek), cipher.final()]);
    const tag = cipher.getAuthTag();
    encryptedDek = `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
  } else {
    // Dev mode: store DEK as hex without KEK encryption
    encryptedDek = rawDek.toString('hex');
  }

  const info: DEKInfo = {
    dekId,
    encryptedDek,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  dekCache.set(conversationId, { rawDek, dekId, cachedAt: Date.now() });

  return { rawDek, dekId, info };
};

/**
 * Get or create a DEK for a conversation.
 * Returns the raw DEK bytes and its ID.
 */
export const getDEK = async (
  conversationId: string
): Promise<{ rawDek: Buffer; dekId: string; info: DEKInfo }> => {
  evictExpiredEntries();

  const cached = dekCache.get(conversationId);
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

  // Remove stale entry if expired
  if (cached) {
    dekCache.delete(conversationId);
  }

  // Prevent race: if another caller is already generating a DEK for this conversation,
  // wait for that result instead of creating a duplicate
  const pending = pendingDEKs.get(conversationId);
  if (pending) {
    return pending;
  }

  const promise = Promise.resolve(generateDEK(conversationId));
  pendingDEKs.set(conversationId, promise);

  try {
    return await promise;
  } finally {
    pendingDEKs.delete(conversationId);
  }
};

/*
 * `rotateDEK` was removed in M3-C1 DB-H3.
 *
 * The implementation generated a fresh DEK and overwrote the cached entry, but
 * did nothing at the database layer — any `encryption_keys` row still marked
 * `active` would become unreachable the moment the in-memory cache flipped,
 * orphaning every historical message for that conversation.
 *
 * No production caller invoked this function (verified via repo grep). If DEK
 * rotation is reintroduced it must:
 *   1. Insert a new `encryption_keys` row and transition the prior row to
 *      `status = 'rotated'` in a single transaction.
 *   2. Ensure the `decrypted-messages` Edge Function can still resolve the DEK
 *      for historical messages (i.e. select by message-level DEK id, not the
 *      currently-active row).
 *   3. Update the partial unique index added by 20260420_m3_c1_fixes.sql.
 * Until all three exist, keep this helper absent so no accidental caller can
 * re-introduce the orphaning bug.
 */
