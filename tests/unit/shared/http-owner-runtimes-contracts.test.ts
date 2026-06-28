import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  OWNER_RUNTIME_TYPES,
  ownerRuntimeSchema,
  ownerRuntimesResponseSchema,
} from '../../../shared/contracts/http/owner-runtimes/protocol.js';
import type {
  OwnerRuntime,
  OwnerRuntimeType,
  OwnerRuntimesResponse,
} from '../../../shared/contracts/http/owner-runtimes/types.js';
import type { z } from 'zod';

const RUNTIME_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';

describe('owner-runtimes HTTP contracts — type parity', () => {
  it('runtime schema matches interface', () => {
    expectTypeOf<z.infer<typeof ownerRuntimeSchema>>().toEqualTypeOf<OwnerRuntime>();
  });

  it('response schema matches interface', () => {
    expectTypeOf<z.infer<typeof ownerRuntimesResponseSchema>>().toEqualTypeOf<OwnerRuntimesResponse>();
  });
});

describe('owner-runtimes HTTP schemas', () => {
  it('accepts the fixed Wave 10 runtime type set', () => {
    expect(OWNER_RUNTIME_TYPES satisfies readonly OwnerRuntimeType[]).toEqual([
      'openclaw',
      'claude',
      'cursor',
      'codex',
    ]);
  });

  it('accepts runtime slots with install hints and default agents', () => {
    const parsed = ownerRuntimesResponseSchema.parse({
      data: [
        {
          id: RUNTIME_ID,
          runtime_type: 'claude',
          display_name: 'Claude Code',
          runtime_status: 'online',
          status_reason: null,
          version: '1.2.3',
          capabilities: { streaming: true, full_access: true },
          last_seen_at: '2026-04-28T00:00:00.000Z',
          install_hint: {
            label: 'Claude Code',
            command: 'npm install -g @anthropic-ai/claude-code',
            docs_url: 'https://docs.anthropic.com/',
          },
          default_agent: {
            id: AGENT_ID,
            name: 'Claude Code',
            avatar_url: null,
            status: 'active',
            is_default: true,
            source: 'system_default',
          },
        },
      ],
      meta: { total: 1, online_count: 1 },
    });

    expect(parsed.data[0]?.runtime_type).toBe('claude');
  });

  it('rejects unknown runtime types and unknown fields', () => {
    expect(() =>
      ownerRuntimeSchema.parse({
        id: null,
        runtime_type: 'gemini',
        display_name: 'Gemini',
        runtime_status: 'not_installed',
        status_reason: null,
        version: null,
        capabilities: {},
        last_seen_at: null,
        install_hint: {
          label: 'Gemini',
          command: 'install gemini',
          docs_url: 'https://example.com',
        },
        default_agent: null,
      })
    ).toThrow();

    expect(() =>
      ownerRuntimeSchema.parse({
        id: null,
        runtime_type: 'codex',
        display_name: 'Codex',
        runtime_status: 'not_installed',
        status_reason: null,
        version: null,
        capabilities: {},
        last_seen_at: null,
        install_hint: {
          label: 'Codex',
          command: 'npm install -g @openai/codex',
          docs_url: 'https://developers.openai.com/codex',
        },
        default_agent: null,
        secret_path: '/Users/example/.codex',
      })
    ).toThrow();
  });
});
