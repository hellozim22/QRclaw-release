/**
 * Fallback when Gateway HTTPS is unreachable: create QR via Supabase (RLS `qrcodes_insert_own`).
 * Mirrors gateway `create-qrcode` field rules without Storage avatar upload (bucket write is service_role only).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const SLUG_LENGTH = 12;
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const VALID_QR_TEMPLATES = new Set(['default', 'minimal', 'showcase', 'custom']);

export function generateQrcodeSlug(): string {
  const result: string[] = [];
  while (result.length < SLUG_LENGTH) {
    const batch = new Uint8Array(SLUG_LENGTH * 2);
    crypto.getRandomValues(batch);
    for (let i = 0; i < batch.length && result.length < SLUG_LENGTH; i += 1) {
      const b = batch[i]!;
      if (b < 252) {
        result.push(SLUG_CHARS[b % SLUG_CHARS.length]!);
      }
    }
  }
  return result.join('');
}

export interface CreateQrDirectInput {
  agentId: string;
  name: string;
  greeting?: string;
  template?: string;
  systemPrompt?: string;
  /** If set, avatar is not persisted in this path (no client Storage write policy); triggers a user-facing warning. */
  hadProfileAvatar?: boolean;
}

export interface CreateQrDirectSuccess {
  id: string;
  slug: string;
  status: string;
  agent_id: string;
  config_version: number;
  created_at: string;
  warnings?: string[];
}

/**
 * @returns Same `data` shape as Gateway POST /api/create-qrcode (201) for `resolveCreateQrDisplayUrls`.
 */
export async function createQrcodeViaSupabase(
  supabase: SupabaseClient,
  input: CreateQrDirectInput
): Promise<{ ok: true; data: CreateQrDirectSuccess } | { ok: false; message: string }> {
  const name = input.name.trim();
  if (!input.agentId || !name) {
    return { ok: false, message: 'agent_id and name are required' };
  }

  const profile: Record<string, unknown> = { name };
  if (input.greeting && input.greeting.trim().length > 0) {
    profile.greeting = input.greeting.trim();
  }
  if (
    input.template !== undefined &&
    input.template !== null &&
    String(input.template).trim().length > 0
  ) {
    const t = String(input.template).trim();
    if (!VALID_QR_TEMPLATES.has(t)) {
      return { ok: false, message: 'invalid template' };
    }
    profile.template = t;
  }

  const warnings: string[] = ['gateway_bypass'];
  let systemPromptTruncated = false;
  if (input.systemPrompt && input.systemPrompt.trim().length > 0) {
    const trimmed = input.systemPrompt.trim();
    if (trimmed.length > 1000) {
      systemPromptTruncated = true;
    }
    profile.system_prompt = trimmed.slice(0, 1000);
  }
  if (systemPromptTruncated) {
    warnings.push('system_prompt_truncated');
  }
  if (input.hadProfileAvatar) {
    warnings.push('profile_avatar_skipped');
  }

  const maxAttempts = 10;
  let lastMessage = 'Failed to create QR code';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slug = generateQrcodeSlug();
    const { data, error } = await supabase
      .from('qrcodes')
      .insert({
        agent_id: input.agentId,
        slug,
        status: 'active',
        profile,
        locale: 'en',
      })
      .select('id, slug, status, agent_id, config_version, created_at')
      .single();

    if (!error && data) {
      return {
        ok: true,
        data: {
          id: data.id,
          slug: data.slug,
          status: data.status,
          agent_id: data.agent_id,
          config_version: data.config_version,
          created_at: data.created_at,
          warnings,
        },
      };
    }

    const code = error?.code;
    const msg = error?.message ?? 'insert failed';
    lastMessage = msg;
    if (code === '23505') {
      continue;
    }
    return { ok: false, message: msg };
  }

  return { ok: false, message: lastMessage };
}
