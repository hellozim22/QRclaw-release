import { describe, expect, it } from 'vitest';

const buildMobileChatPath = (agentId: string, qrCodeId: string): string =>
  `/m/chat/${agentId}?qr=${qrCodeId}`;

describe('mobile chat route building', () => {
  it('uses agent_id in pathname and qrcode_id in query', () => {
    expect(buildMobileChatPath('agent-123', 'qr-456')).toBe('/m/chat/agent-123?qr=qr-456');
  });
});
