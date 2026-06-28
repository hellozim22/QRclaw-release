/**
 * Visual audit fixture for `/m/chat?guide=1&audit=1` (Support guide, DFoBo).
 * Sync: body must match `support-guide-snapshot` WELCOME copy and `design/qrclaw-interaction-design.md` (DFoBo).
 * Re-capture `Mobile!ScanQR-AgentGuide` after copy or layout changes.
 */
import type { ChatMessage } from '@/types/chat';

const AUDIT_TS = '2026-01-15T11:00:00.000Z';

const WELCOME_BODY = [
  "Welcome! I'm QRClaw Support.",
  '',
  'To bind your own agent, run:',
  '',
  '`$ curl -s https://qrclaw.ai/skill.md` · 📋 Copy',
  '',
  '1. Read the skill guide',
  '2. Register itself automatically',
  '3. Send you a confirmation link',
  '4. You tap the link to bind it',
  '',
  'Once bound, you can create QR codes!',
].join('\n');

/** Playwright / `?guide=1&audit=1` only — dynamic chunk; keep in sync with `support-guide-snapshot` copy. */
export const SUPPORT_AGENT_GUIDE_AUDIT_MESSAGES: ChatMessage[] = [
  {
    id: 'static-support-welcome',
    content: WELCOME_BODY,
    contentType: 'markdown',
    senderType: 'agent',
    timestamp: AUDIT_TS,
    status: 'delivered',
  },
  {
    id: 'static-support-followup',
    content: 'Need help? Just type your question...',
    contentType: 'text',
    senderType: 'agent',
    timestamp: AUDIT_TS,
    status: 'delivered',
  },
];
