/**
 * POST /api/create-qrcode — Create a new QR code for an agent.
 * Replaces the Supabase Edge Function create-qrcode.
 * Owner-only endpoint: requires valid Supabase JWT.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';
import type { AuthUser } from '../types/index.js';
import { buildQrAvatarObjectPath, tryDecodeProfileAvatarDataUrl } from './create-qrcode-avatar.js';
import type { CreateQrcodeRequest } from '../../../shared/contracts/http/qrcodes/types.js';
import { SYSTEM_PROMPT_MAX_LENGTH } from '../../../shared/contracts/http/qrcodes/types.js';
import { createQrcodeRequestSchema } from '../../../shared/contracts/http/qrcodes/protocol.js';

const QR_AVATARS_BUCKET = 'qr-avatars';

const SLUG_LENGTH = 12;
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Wave 1 feature gate for strict system_prompt validation.
 * When flipped to `true`, extend `createQrcodeRequestSchema` with
 * `.max(SYSTEM_PROMPT_MAX_LENGTH)` on the `system_prompt` field.
 * Tracked: docs/refactor/execution-log.md — Drift F follow-up.
 */
const PHASE2_STRICT_SYSTEM_PROMPT = false;

function generateSlug(length: number = SLUG_LENGTH): string {
  const bytes = randomBytes(length * 2);
  const result: string[] = [];
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    if (bytes[i] < 252) {
      result.push(SLUG_CHARS[bytes[i] % SLUG_CHARS.length]);
    }
  }
  return result.join('');
}

const handleCreateQrcode = async (req: Request, res: Response): Promise<void> => {
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Database not configured' } });
    return;
  }

  const user = (req as Request & { user: AuthUser }).user;
  const { agent_id, name, greeting, template, system_prompt, profile_avatar } =
    req.body as CreateQrcodeRequest;

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, owner_id, owners!inner(user_id)')
    .eq('id', agent_id)
    .single();

  if (agentError || !agent) {
    res.status(404).json({ error: { code: 'not_found', message: 'Agent not found' } });
    return;
  }

  const owners = agent.owners as unknown as Record<string, unknown>;
  if (owners.user_id !== user.id) {
    res.status(403).json({ error: { code: 'forbidden', message: 'You do not own this agent' } });
    return;
  }

  let slug = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    slug = generateSlug();
    const { data: existing } = await supabase
      .from('qrcodes')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
  }

  const profile: Record<string, unknown> = { name };
  if (greeting && greeting.trim().length > 0) {
    profile.greeting = greeting.trim();
  }
  if (template) {
    profile.template = template;
  }
  let systemPromptTruncated = false;
  if (system_prompt && system_prompt.trim().length > 0) {
    const trimmed = system_prompt.trim();
    if (trimmed.length > SYSTEM_PROMPT_MAX_LENGTH) {
      systemPromptTruncated = true;
    }
    profile.system_prompt = trimmed.slice(0, SYSTEM_PROMPT_MAX_LENGTH);
  }

  const { data: qrCode, error: insertError } = await supabase
    .from('qrcodes')
    .insert({
      agent_id,
      slug,
      status: 'active',
      profile,
      locale: 'en',
    })
    .select('id, slug, status, agent_id, profile, config_version, created_at')
    .single();

  if (insertError) {
    console.error('[CreateQR] Failed:', insertError.message);
    res
      .status(500)
      .json({ error: { code: 'internal_error', message: 'Failed to create QR code' } });
    return;
  }

  const warnings: string[] = [];
  if (systemPromptTruncated) {
    warnings.push('system_prompt_truncated');
  }

  let profileUrlForResponse: string | undefined;

  let profileAvatarRejected = false;
  const avatarRaw =
    profile_avatar !== undefined && profile_avatar !== null ? String(profile_avatar).trim() : '';
  if (avatarRaw.length > 0) {
    if (typeof profile_avatar !== 'string') {
      profileAvatarRejected = true;
    } else {
      const decoded = tryDecodeProfileAvatarDataUrl(profile_avatar);
      if (!decoded) {
        profileAvatarRejected = true;
      } else {
        const objectPath = buildQrAvatarObjectPath(user.id, qrCode.slug, decoded.fileExt);
        const { error: uploadError } = await supabase.storage
          .from(QR_AVATARS_BUCKET)
          .upload(objectPath, decoded.buffer, {
            contentType: decoded.contentType,
            upsert: false,
          });
        if (uploadError) {
          console.error('[CreateQR] Avatar upload failed:', uploadError.message);
          profileAvatarRejected = true;
          warnings.push('avatar_upload_failed');
        } else {
          const { data: pub } = supabase.storage.from(QR_AVATARS_BUCKET).getPublicUrl(objectPath);
          const publicUrl = pub?.publicUrl;
          if (publicUrl) {
            const mergedProfile = {
              ...(qrCode.profile as Record<string, unknown>),
              avatar_url: publicUrl,
            };
            const { error: profileUpdateError } = await supabase
              .from('qrcodes')
              .update({ profile: mergedProfile })
              .eq('id', qrCode.id);
            if (profileUpdateError) {
              console.error(
                '[CreateQR] Profile avatar URL update failed:',
                profileUpdateError.message
              );
              warnings.push('avatar_profile_update_failed');
            } else {
              profileUrlForResponse = publicUrl;
            }
          } else {
            profileAvatarRejected = true;
            warnings.push('avatar_public_url_missing');
          }
        }
      }
    }
  }

  if (profileAvatarRejected) {
    warnings.push('profile_avatar_rejected');
  }

  res.status(201).json({
    data: {
      id: qrCode.id,
      slug: qrCode.slug,
      status: qrCode.status,
      agent_id: qrCode.agent_id,
      config_version: qrCode.config_version,
      created_at: qrCode.created_at,
      ...(profileUrlForResponse ? { profile_url: profileUrlForResponse } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  });
};

export const createQrcodeRouter = Router();
createQrcodeRouter.post(
  '/api/create-qrcode',
  jwtAuthMiddleware,
  validateRequest(createQrcodeRequestSchema),
  handleCreateQrcode
);
