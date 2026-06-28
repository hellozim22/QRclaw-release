/**
 * Ensures create-qrcode handler builds profile JSON including optional template.
 * Logic mirrored from gateway/src/routes/create-qrcode.ts (contract for web wizard Step1).
 */
import { describe, it, expect } from 'vitest';

const VALID_QR_TEMPLATES = new Set(['default', 'minimal', 'showcase', 'custom']);

function buildProfilePayload(
  name: string,
  greeting: unknown,
  template: unknown,
  systemPrompt: unknown,
  profileAvatar: unknown
): Record<string, unknown> {
  const profile: Record<string, unknown> = { name: name.trim() };
  if (greeting && typeof greeting === 'string' && greeting.trim().length > 0) {
    profile.greeting = greeting.trim();
  }
  if (template !== undefined && template !== null && String(template).trim().length > 0) {
    const t = String(template).trim();
    if (!VALID_QR_TEMPLATES.has(t)) {
      throw new Error('invalid template');
    }
    profile.template = t;
  }
  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim().length > 0) {
    profile.system_prompt = systemPrompt.trim().slice(0, 1000);
  }
  // Avatar: Gateway uploads to Storage after insert; profile JSON stores public URL only (not data URLs).
  return profile;
}

describe('create-qrcode profile payload', () => {
  it('includes template when provided', () => {
    expect(buildProfilePayload('My QR', 'Hi', 'minimal', undefined, undefined)).toEqual({
      name: 'My QR',
      greeting: 'Hi',
      template: 'minimal',
    });
    expect(buildProfilePayload('C', '', 'custom', undefined, undefined)).toEqual({
      name: 'C',
      template: 'custom',
    });
  });

  it('omits empty greeting and template', () => {
    expect(buildProfilePayload('X', '', '', undefined, undefined)).toEqual({ name: 'X' });
    expect(buildProfilePayload('X', '   ', undefined, undefined, undefined)).toEqual({ name: 'X' });
  });

  it('rejects unknown template values', () => {
    expect(() => buildProfilePayload('X', '', 'evil', undefined, undefined)).toThrow(
      'invalid template'
    );
  });

  it('includes system_prompt truncated to 1000 chars', () => {
    const long = 'a'.repeat(5000);
    const p = buildProfilePayload('N', '', '', long, undefined) as { system_prompt?: string };
    expect(p.system_prompt?.length).toBe(1000);
  });

  it('does not embed avatar data URL in profile (handled by Gateway + Storage)', () => {
    expect(buildProfilePayload('N', '', '', '', 'data:image/png;base64,xx')).toEqual({ name: 'N' });
  });
});
