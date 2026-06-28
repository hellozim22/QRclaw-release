import type { APIRequestContext } from '@playwright/test';
// Inline type mirror of shared/contracts/http/owner-agent-chat/types.ts —
// tsconfig rootDir keeps us from importing across the workspace. Keep in
// sync if the contract changes.
type OwnerAgentProvider = 'openclaw' | 'claude' | 'cursor' | 'codex';
interface HostTokenScope {
  owner_id: string;
  allowed_provider_set: OwnerAgentProvider[];
  can_register_local: boolean;
  can_receive_private_runs: boolean;
}
interface OwnerAgentCreateHostTokenRequest {
  label?: string;
  host_id?: string;
  scope: HostTokenScope;
  expires_at?: string;
}
interface OwnerAgentCreateHostTokenResponse {
  token_id: string;
  token: string;
  scope: HostTokenScope;
  expires_at: string | null;
  created_at: string;
}

/**
 * Mint a one-time host token via `POST /api/owner/host-tokens`.
 *
 * Gateway contract: gateway/src/routes/owner-host-tokens.ts
 *   - auth: Bearer <ownerJWT>
 *   - body: { label?, host_id?, scope, expires_at? }
 *   - response (201): { token_id, token, scope, expires_at, created_at }
 *
 * The token plaintext is only returned once — callers must pipe it to
 * `startGoHost` immediately and never write it to disk.
 */
export async function generateHostToken(
  request: APIRequestContext,
  ownerJWT: string,
  opts: {
    ownerId: string;
    label?: string;
    hostId?: string;
    allowedProviders?: OwnerAgentProvider[];
    apiBase?: string;
  },
): Promise<string> {
  const scope: HostTokenScope = {
    owner_id: opts.ownerId,
    allowed_provider_set: opts.allowedProviders ?? ['openclaw'],
    can_register_local: true,
    can_receive_private_runs: true,
  };
  const body: OwnerAgentCreateHostTokenRequest = {
    label: opts.label ?? `e2e-${Date.now()}`,
    host_id: opts.hostId,
    scope,
  };
  const url = `${opts.apiBase ?? ''}/api/owner/host-tokens`;
  const res = await request.post(url, {
    headers: {
      Authorization: `Bearer ${ownerJWT}`,
      'Content-Type': 'application/json',
    },
    data: body,
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(
      `generateHostToken failed: ${res.status()} ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as OwnerAgentCreateHostTokenResponse;
  if (!json.token) {
    throw new Error('generateHostToken: response missing token');
  }
  return json.token;
}
