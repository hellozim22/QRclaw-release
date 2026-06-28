/**
 * Re-exports audit fixtures for tests / tooling that resolve this path.
 * Production chat loads these via dynamic `import()` from `./visual-audit/*` (see `m/chat/[agentId]/page.tsx`).
 */
export { VISUAL_AUDIT_CHAT_MESSAGES } from './visual-audit/chat-echo-messages';
