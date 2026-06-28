/**
 * Visual audit fixture for `/m/chat?audit=1` (Echo thread).
 * Sync: copy and timestamps must match `design/design-png-phone/Mobile!Chat.png` thread; Playwright waits on
 * "How can QRClaw help my business?". After design changes, re-run `npm run visual-audit:capture` in `tests/`.
 */
import type { ChatMessage } from '@/types/chat';

const T1 = '2026-01-15T10:30:00.000Z';
const T2 = '2026-01-15T10:31:00.000Z';
const T3 = '2026-01-15T10:32:00.000Z';
const T4 = '2026-01-15T10:33:00.000Z';

/** Playwright / `?audit=1` only — loaded via dynamic `import()` so it stays out of the main chat bundle. */
export const VISUAL_AUDIT_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'audit-v1',
    content: 'How can QRClaw help my business?',
    contentType: 'text',
    senderType: 'visitor',
    timestamp: T1,
    status: 'delivered',
  },
  {
    id: 'audit-a1',
    content:
      'QRClaw lets you turn any AI agent into a scannable QR code. Visitors can chat instantly — no downloads needed.',
    contentType: 'text',
    senderType: 'agent',
    timestamp: T2,
    status: 'delivered',
  },
  {
    id: 'audit-v2',
    content: 'Can visitors use it without downloading an app?',
    contentType: 'text',
    senderType: 'visitor',
    timestamp: T3,
    status: 'delivered',
  },
  {
    id: 'audit-a2',
    content: 'Yes! QRClaw works in the browser. Just scan and start chatting.',
    contentType: 'text',
    senderType: 'agent',
    timestamp: T4,
    status: 'delivered',
  },
];
