import { describe, it, expect, expectTypeOf } from 'vitest';
import { createQrcodeRequestSchema } from '../../../shared/contracts/http/qrcodes/protocol';
import type { CreateQrcodeRequest } from '../../../shared/contracts/http/qrcodes/types';
import {
  QR_TEMPLATES,
  PROFILE_AVATAR_MAX_DATA_URL_CHARS,
  SYSTEM_PROMPT_MAX_LENGTH,
} from '../../../shared/contracts/http/qrcodes/types';
import type { z } from 'zod';

describe('createQrcodeRequestSchema', () => {
  it('accepts minimal body { agent_id, name }', () => {
    const result = createQrcodeRequestSchema.safeParse({ agent_id: 'a', name: 'n' });
    expect(result.success).toBe(true);
  });

  it('accepts full body with all fields', () => {
    const result = createQrcodeRequestSchema.safeParse({
      agent_id: 'a1',
      name: 'My QR',
      greeting: 'Hello',
      template: 'minimal',
      system_prompt: 'You are a helpful assistant',
      profile_avatar: 'data:image/png;base64,' + 'a'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing agent_id', () => {
    const result = createQrcodeRequestSchema.safeParse({ name: 'n' });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = createQrcodeRequestSchema.safeParse({ agent_id: 'a' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name after trim', () => {
    const result = createQrcodeRequestSchema.safeParse({ agent_id: 'a', name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid template value', () => {
    const result = createQrcodeRequestSchema.safeParse({
      agent_id: 'a',
      name: 'n',
      template: 'classic',
    });
    expect(result.success).toBe(false);
  });

  it.each(QR_TEMPLATES.map((t) => [t]))('accepts valid template "%s"', (template) => {
    const result = createQrcodeRequestSchema.safeParse({ agent_id: 'a', name: 'n', template });
    expect(result.success).toBe(true);
  });

  it('rejects profile_avatar > 600000 chars', () => {
    const result = createQrcodeRequestSchema.safeParse({
      agent_id: 'a',
      name: 'n',
      profile_avatar: 'x'.repeat(PROFILE_AVATAR_MAX_DATA_URL_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts profile_avatar at exactly 600000 chars (boundary)', () => {
    const result = createQrcodeRequestSchema.safeParse({
      agent_id: 'a',
      name: 'n',
      profile_avatar: 'x'.repeat(PROFILE_AVATAR_MAX_DATA_URL_CHARS),
    });
    expect(result.success).toBe(true);
  });

  it('accepts system_prompt of any length (no schema-level cap in Wave 1)', () => {
    const result = createQrcodeRequestSchema.safeParse({
      agent_id: 'a',
      name: 'n',
      system_prompt: 'z'.repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys (strict)', () => {
    const result = createQrcodeRequestSchema.safeParse({
      agent_id: 'a',
      name: 'n',
      extra_field: 'oops',
    });
    expect(result.success).toBe(false);
  });

  it('type parity: z.infer matches CreateQrcodeRequest', () => {
    expectTypeOf<z.infer<typeof createQrcodeRequestSchema>>().toEqualTypeOf<CreateQrcodeRequest>();
  });
});

describe('qrcodes contract constants', () => {
  it('QR_TEMPLATES has 4 entries', () => {
    expect(QR_TEMPLATES).toEqual(['default', 'minimal', 'showcase', 'custom']);
  });

  it('PROFILE_AVATAR_MAX_DATA_URL_CHARS is 600000', () => {
    expect(PROFILE_AVATAR_MAX_DATA_URL_CHARS).toBe(600_000);
  });

  it('SYSTEM_PROMPT_MAX_LENGTH is 1000', () => {
    expect(SYSTEM_PROMPT_MAX_LENGTH).toBe(1000);
  });
});
