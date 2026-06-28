/**
 * Unit tests for web/src/lib/api/agents.ts — the dashboard API client for the
 * claim-agent and manage-agents Edge Functions.
 *
 * Covers:
 *   - Success paths for createAgent / updateAgent / regenerateAgentKey / archiveAgent
 *   - Error paths where the Edge Function returns `{ error: { code, message } }`
 *   - Missing-session path (supabase.auth.getSession → { data: { session: null } })
 *   - friendlyAgentError code → user-readable mapping
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Supabase browser client ─────────────────────────────────────

const mockGetSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    auth: { getSession: mockGetSession, getUser: mockGetUser },
  }),
}));

import {
  ApiError,
  createAgent,
  updateAgent,
  regenerateAgentKey,
  archiveAgent,
  friendlyAgentError,
} from '@/lib/api/agents';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('agents API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'u@example.com' } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-jwt-token' } },
      error: null,
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });

  describe('createAgent', () => {
    it('POSTs to claim-agent with bearer token and returns data', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse(201, {
          data: {
            agent_id: 'agent-1',
            api_key: 'sk_live_abcdef',
            api_key_prefix: 'sk_live_abcd',
            name: 'My Bot',
            status: 'active',
            created_at: '2026-04-20T00:00:00Z',
          },
        })
      );

      const result = await createAgent('My Bot');

      expect(result.agent_id).toBe('agent-1');
      expect(result.api_key).toBe('sk_live_abcdef');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/functions/v1/claim-agent');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-jwt-token');
      expect(JSON.parse(init.body as string)).toEqual({ name: 'My Bot' });
      fetchMock.mockRestore();
    });

    it('throws ApiError with backend code on non-2xx response', async () => {
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse(400, { error: { code: 'invalid_request', message: 'name is required' } })
        );

      await expect(createAgent('')).rejects.toMatchObject({
        code: 'invalid_request',
        message: 'name is required',
      });
      fetchMock.mockRestore();
    });

    it('throws unauthenticated when no session', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      await expect(createAgent('X')).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    });

    it('throws unauthenticated when getUser() returns an error (revoked token)', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      await expect(createAgent('X')).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    });
  });

  describe('updateAgent', () => {
    it('sends action=update with patch body', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse(200, {
          data: {
            id: 'agent-1',
            name: 'Renamed',
            description: 'new',
            account_label: null,
            status: 'active',
            updated_at: '2026-04-20T01:00:00Z',
          },
        })
      );

      const result = await updateAgent('agent-1', {
        name: 'Renamed',
        description: 'new',
        account_label: null,
      });

      expect(result.name).toBe('Renamed');
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        action: 'update',
        agent_id: 'agent-1',
        name: 'Renamed',
        description: 'new',
        account_label: null,
      });
      fetchMock.mockRestore();
    });

    it('surfaces 409 invalid_state for archived agent edit', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse(409, {
          error: { code: 'invalid_state', message: 'Archived agents cannot be updated' },
        })
      );

      await expect(updateAgent('a', { name: 'x' })).rejects.toMatchObject({
        code: 'invalid_state',
      });
      fetchMock.mockRestore();
    });

    it('throws unauthenticated when session missing', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(updateAgent('a', { name: 'x' })).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    });
  });

  describe('regenerateAgentKey', () => {
    it('returns new api_key on success', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse(200, {
          data: {
            agent_id: 'agent-1',
            api_key: 'sk_live_newkey',
            api_key_prefix: 'sk_live_newk',
            regenerated_at: '2026-04-20T02:00:00Z',
          },
        })
      );

      const result = await regenerateAgentKey('agent-1');
      expect(result.api_key).toBe('sk_live_newkey');
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        action: 'regenerate_key',
        agent_id: 'agent-1',
      });
      fetchMock.mockRestore();
    });

    it('rejects with code=not_found when agent missing', async () => {
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse(404, { error: { code: 'not_found', message: 'Agent not found' } })
        );

      await expect(regenerateAgentKey('agent-x')).rejects.toMatchObject({
        code: 'not_found',
      });
      fetchMock.mockRestore();
    });

    it('throws unauthenticated when session missing', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(regenerateAgentKey('a')).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('archiveAgent', () => {
    it('returns archived payload on success', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse(200, {
          data: {
            agent_id: 'agent-1',
            status: 'archived',
            archived_at: '2026-04-20T03:00:00Z',
          },
        })
      );

      const result = await archiveAgent('agent-1');
      expect(result.status).toBe('archived');
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        action: 'delete',
        agent_id: 'agent-1',
      });
      fetchMock.mockRestore();
    });

    it('maps 401 unauthorized', async () => {
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse(401, { error: { code: 'unauthorized', message: 'Expired' } })
        );
      await expect(archiveAgent('a')).rejects.toMatchObject({ code: 'unauthorized' });
      fetchMock.mockRestore();
    });

    it('maps fetch throw to network_error', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('failed'));
      await expect(archiveAgent('a')).rejects.toMatchObject({ code: 'network_error' });
      fetchMock.mockRestore();
    });

    it('throws unauthenticated when session missing', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(archiveAgent('a')).rejects.toMatchObject({ code: 'unauthenticated' });
    });
  });

  describe('friendlyAgentError', () => {
    it('maps known codes to user-readable strings', () => {
      expect(friendlyAgentError(new ApiError('unauthenticated', 'x'))).toMatch(/sign in/i);
      expect(friendlyAgentError(new ApiError('not_found', 'x'))).toMatch(/no longer exists/i);
      expect(friendlyAgentError(new ApiError('timeout', 'x'))).toMatch(/too long/i);
      expect(friendlyAgentError(new ApiError('network_error', 'x'))).toMatch(/network/i);
    });

    it('passes through invalid_request messages as the backend wrote them', () => {
      const e = new ApiError('invalid_request', 'name exceeds maximum length of 255');
      expect(friendlyAgentError(e)).toBe('name exceeds maximum length of 255');
    });

    it('falls back to generic text for non-ApiError throwable', () => {
      expect(friendlyAgentError(new Error('boom'))).toMatch(/something went wrong/i);
    });
  });
});
