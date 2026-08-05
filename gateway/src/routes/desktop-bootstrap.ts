/**
 * Desktop Bootstrap API — cloud gateway only.
 * Exchanges invite code for scoped desktop token + Supabase session + host token.
 */
import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes, createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createHostTokenRecord, hashHostToken } from '../db/owner-agent-chat.js';
import { env, getRequiredEnv } from '../env.js';
import { isDesktopLocalMode } from '../desktop/mode.js';

const router = Router();

const INVITE_PEPPER = process.env.DESKTOP_INVITE_PEPPER ?? 'qrclaw-desktop-invite-dev';

function hashInviteCode(code: string): string {
  return createHmac('sha256', INVITE_PEPPER).update(code.trim().toLowerCase()).digest('hex');
}

function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateDesktopToken(): string {
  return randomBytes(32).toString('hex');
}

router.post('/api/desktop/bootstrap/exchange', async (req: Request, res: Response) => {
  if (isDesktopLocalMode()) {
    res.status(403).json({
      error: { code: 'local_gateway', message: 'Bootstrap must be called on cloud gateway' },
    });
    return;
  }

  const { inviteCode, deviceName, appVersion, email, magicLinkToken } = req.body ?? {};

  if (!inviteCode && !email && !magicLinkToken) {
    res.status(400).json({
      error: { code: 'invalid_request', message: 'inviteCode, email, or magicLinkToken required' },
    });
    return;
  }

  if (!deviceName || !appVersion) {
    res.status(400).json({
      error: { code: 'invalid_request', message: 'deviceName and appVersion required' },
    });
    return;
  }

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let ownerEmail = email as string | undefined;

    if (inviteCode) {
      const codeHash = hashInviteCode(String(inviteCode));
      const { data: invite, error: inviteErr } = await supabase
        .from('desktop_invites')
        .select('*')
        .eq('code_hash', codeHash)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (inviteErr || !invite) {
        res
          .status(401)
          .json({ error: { code: 'invalid_invite', message: 'Invalid or expired invite code' } });
        return;
      }

      if (invite.used_count >= invite.max_uses) {
        res
          .status(401)
          .json({ error: { code: 'expired_invite', message: 'Invite code has been fully used' } });
        return;
      }

      ownerEmail = invite.owner_email ?? ownerEmail;

      await supabase
        .from('desktop_invites')
        .update({ used_count: invite.used_count + 1 })
        .eq('id', invite.id);
    }

    if (!ownerEmail) {
      res
        .status(400)
        .json({ error: { code: 'invalid_request', message: 'Could not resolve owner email' } });
      return;
    }

    // Find or create owner user
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    let userId = existingUsers?.users.find((u) => u.email === ownerEmail)?.id;

    if (!userId) {
      const tempPassword = randomBytes(16).toString('hex');
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: ownerEmail,
        password: tempPassword,
        email_confirm: true,
      });
      if (createErr || !created.user) {
        res
          .status(500)
          .json({ error: { code: 'owner_create_failed', message: 'Could not create owner' } });
        return;
      }
      userId = created.user.id;
    }

    const { data: ownerRow } = await supabase
      .from('owners')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    let ownerId = ownerRow?.id;
    if (!ownerId) {
      const { data: inserted, error: ownerErr } = await supabase
        .from('owners')
        .insert({ user_id: userId })
        .select('id')
        .single();
      if (ownerErr || !inserted) {
        res.status(500).json({
          error: { code: 'owner_create_failed', message: 'Could not create owner record' },
        });
        return;
      }
      ownerId = inserted.id;
    }

    const desktopRuntimeToken = generateDesktopToken();
    const tokenHash = hashDeviceToken(desktopRuntimeToken);

    const { data: device, error: deviceErr } = await supabase
      .from('desktop_devices')
      .insert({
        owner_id: ownerId,
        device_name: String(deviceName),
        app_version: String(appVersion),
        token_hash: tokenHash,
        last_seen_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (deviceErr || !device) {
      res
        .status(500)
        .json({ error: { code: 'device_register_failed', message: 'Could not register device' } });
      return;
    }

    // Generate session via admin API
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: ownerEmail,
    });

    if (linkErr || !linkData) {
      res
        .status(500)
        .json({ error: { code: 'session_failed', message: 'Could not generate session' } });
      return;
    }

    // Sign in to get tokens
    const { data: sessionData, error: sessionErr } = await supabase.auth
      .signInWithPassword({
        email: ownerEmail,
        password: linkData.properties?.hashed_token ?? '',
      })
      .catch(() => ({ data: null, error: { message: 'fallback' } }));

    // Fallback: use OTP verification
    let accessToken = sessionData?.session?.access_token;
    let refreshToken = sessionData?.session?.refresh_token;
    let expiresAt = sessionData?.session?.expires_at ?? 0;

    if (!accessToken) {
      const { data: otpSession } = await supabase.auth.verifyOtp({
        token_hash: linkData.properties?.hashed_token ?? '',
        type: 'magiclink',
      });
      accessToken = otpSession?.session?.access_token;
      refreshToken = otpSession?.session?.refresh_token;
      expiresAt = otpSession?.session?.expires_at ?? 0;
    }

    if (!accessToken || !refreshToken) {
      res.status(500).json({
        error: { code: 'session_failed', message: 'Could not establish Supabase session' },
      });
      return;
    }

    // Host token — mint + persist so local gateway can verify qrclaw_host_* tickets.
    const hostTokenSuffix = randomBytes(32).toString('base64url').replace(/=/g, '');
    const hostToken = `qrclaw_host_${hostTokenSuffix}`;
    await createHostTokenRecord({
      ownerId,
      tokenHash: hashHostToken(hostToken),
      label: String(deviceName),
      scope: {
        owner_id: ownerId,
        can_register_local: true,
        allowed_provider_set: ['openclaw', 'claude', 'cursor', 'codex', 'pi'],
      },
    });

    const cloudGatewayUrl =
      env.GATEWAY_BASE_URL || `https://${req.get('host') ?? 'gateway-test.qrclaw.ai'}`;

    res.json({
      ownerId,
      supabaseSession: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
      },
      desktopRuntimeToken,
      hostToken,
      cloudGatewayUrl,
    });
  } catch (err) {
    console.error('[DesktopBootstrap] error:', (err as Error).message);
    res.status(500).json({ error: { code: 'internal_error', message: 'Bootstrap failed' } });
  }
});

export { router as desktopBootstrapRouter };
