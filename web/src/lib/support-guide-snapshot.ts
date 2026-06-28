import type { ChatMessage } from '@/types/chat';

/** Copy must stay aligned with design Mobile-ScanQR-AgentGuide (DFoBo); i18n would load this from content, not code. */
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

/**
 * Static copy for visual parity with design Mobile-ScanQR-AgentGuide (DFoBo).
 * Call from the client with a timestamp from useEffect (after mount) to avoid SSR/client clock skew in module scope.
 */
export function getSupportAgentGuideMessages(timestamp: string): ChatMessage[] {
  return [
    {
      id: 'static-support-welcome',
      content: WELCOME_BODY,
      contentType: 'markdown',
      senderType: 'agent',
      timestamp,
      status: 'delivered',
    },
    {
      id: 'static-support-followup',
      content: 'Need help? Just type your question...',
      contentType: 'text',
      senderType: 'agent',
      timestamp,
      status: 'delivered',
    },
  ];
}

/** Fixed-thread support audit messages live in `visual-audit/chat-support-audit-messages.ts` (dynamic import in chat page). */
