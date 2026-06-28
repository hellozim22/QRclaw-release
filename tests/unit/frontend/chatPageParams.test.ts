import { describe, it, expect } from 'vitest';
import {
  buildAgentProfilePath,
  buildChatPath,
  getQrCodeIdFromSearchParams,
} from '@/lib/chat-routing';

describe('chat routing helpers', () => {
  it('returns qrCodeId from ?qr= when present', () => {
    const params = new URLSearchParams('qr=550e8400-e29b-41d4-a716-446655440000');
    expect(getQrCodeIdFromSearchParams(params)).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('returns null when ?qr= is missing', () => {
    expect(getQrCodeIdFromSearchParams(new URLSearchParams(''))).toBeNull();
  });

  it('returns null when ?qr= is empty or whitespace', () => {
    expect(getQrCodeIdFromSearchParams(new URLSearchParams('qr='))).toBeNull();
    expect(getQrCodeIdFromSearchParams(new URLSearchParams('qr=%20%20'))).toBeNull();
  });

  it('builds agent profile path with qrCodeId when present', () => {
    expect(buildAgentProfilePath('agent-123', 'qr-456')).toBe('/agent/agent-123?qr=qr-456');
  });

  it('builds chat path with qrCodeId when present', () => {
    expect(buildChatPath('agent-123', 'qr-456')).toBe('/chat/agent-123?qr=qr-456');
  });

  it('builds plain paths when qrCodeId is absent', () => {
    expect(buildAgentProfilePath('agent-123')).toBe('/agent/agent-123');
    expect(buildChatPath('agent-123')).toBe('/chat/agent-123');
  });
});
