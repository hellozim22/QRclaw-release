'use client';

import { useMemo, useRef } from 'react';
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type MessageStatus,
  type TextMessagePartComponent,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import type { ChatMessage } from '@/stores/owner-agent-chat-store';
import ChatComposer from '@/components/chat/ChatComposer';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';

export interface OwnerAssistantThreadProps {
  agentId: string;
  agentName: string;
  canSend: boolean;
  isRunning: boolean;
  messages: ChatMessage[];
  onSend: (content: string) => void;
  onStop: () => void;
}

const toAssistantRole = (senderType: ChatMessage['sender_type']): ThreadMessageLike['role'] => {
  if (senderType === 'owner') return 'user';
  if (senderType === 'agent') return 'assistant';
  return 'system';
};

const toAssistantStatus = (message: ChatMessage): MessageStatus | undefined => {
  if (message.sender_type !== 'agent') return undefined;
  if (message.status === 'streaming' || message.run_status === 'running') {
    return { type: 'running' };
  }
  if (message.status === 'failed' || message.run_status === 'failed') {
    return {
      type: 'incomplete',
      reason: 'error',
      error: 'Agent response failed',
    };
  }
  return { type: 'complete', reason: 'stop' };
};

export const toAssistantThreadMessage = (message: ChatMessage): ThreadMessageLike => ({
  id: message.id,
  role: toAssistantRole(message.sender_type),
  content: [{ type: 'text', text: message.content }],
  createdAt: new Date(message.created_at),
  status: toAssistantStatus(message),
  metadata: {
    custom: {
      qrclawStatus: message.status,
      runId: message.run_id ?? null,
    },
  },
});

export const getAppendMessageText = (message: AppendMessage): string => {
  if (typeof message.content === 'string') return message.content;
  return message.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
};

export const createOwnerAssistantAdapter = ({
  canSend,
  isRunning,
  messages,
  onSend,
  onStop,
}: Pick<
  OwnerAssistantThreadProps,
  'canSend' | 'isRunning' | 'messages' | 'onSend' | 'onStop'
>) => ({
  messages,
  isRunning,
  isDisabled: !canSend && !isRunning,
  convertMessage: toAssistantThreadMessage,
  onNew: async (message: AppendMessage) => {
    const text = getAppendMessageText(message).trim();
    if (text) onSend(text);
  },
  onCancel: async () => {
    onStop();
  },
});

/**
 * Text-part renderer that swaps assistant-ui's default plain-text output for
 * QRClaw's `MarkdownRenderer` (remark-gfm + remark-math + rehype-highlight +
 * rehype-katex + CodeBlock). This is what keeps fenced code blocks rendering
 * as rounded panels with language labels, inline code styled, and KaTeX math
 * working — all the things MessagePart.Text's bare `<p>` would drop.
 */
const MarkdownTextPart: TextMessagePartComponent = ({ text }) => (
  <MarkdownRenderer content={text} stripImages />
);
MarkdownTextPart.displayName = 'OwnerFlatAssistantTextPart';

/**
 * Flat assistant message (Claude.ai style).
 *
 * Replaces assistant-ui's default `AssistantMessage`, which renders as a grid
 * with Avatar + bubble + action bar. We drop the avatar and the bubble
 * chrome so assistant replies read as clean typography on the thread
 * background, matching the look the product design asks for:
 *   - no avatar on the left
 *   - no bubble background / border
 *   - text aligns left, can span full conversation width
 *   - code blocks keep their existing rounded frame + language label
 *     (via MarkdownTextPart → MarkdownRenderer → CodeBlock)
 *
 * User messages keep the default gray right-aligned bubble because we only
 * override `components.AssistantMessage`.
 */
const ThinkingIndicator = () => (
  <MessagePrimitive.If hasContent={false}>
    <div
      role="status"
      aria-live="polite"
      className="qrclaw-thinking-wave"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        color: 'var(--color-gray-500)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span>思考中</span>
      <span aria-hidden="true" className="qrclaw-thinking-dots">
        <span />
        <span />
        <span />
      </span>
    </div>
  </MessagePrimitive.If>
);
ThinkingIndicator.displayName = 'OwnerAssistantThinkingIndicator';

const FlatAssistantMessage = () => (
  <MessagePrimitive.Root
    className="qrclaw-assistant-message"
    style={{
      width: '100%',
      padding: 'var(--space-4) 0',
      color: 'var(--color-gray-800)',
      fontFamily: 'var(--font-primary)',
      fontSize: 'var(--text-md)',
      lineHeight: 1.75,
    }}
  >
    <ThinkingIndicator />
    <MessagePrimitive.Content components={{ Text: MarkdownTextPart }} />
  </MessagePrimitive.Root>
);
FlatAssistantMessage.displayName = 'OwnerFlatAssistantMessage';

/**
 * Owner (user) message — right-aligned brand bubble.
 *
 * We render this ourselves instead of relying on `@assistant-ui/react-ui`'s
 * default `UserMessage`: that package (v0.2.x) was built against an older
 * `@assistant-ui/react` and its default message components fail to render
 * against the v0.12 runtime, which blanks the entire thread. Composing the
 * thread from the version-matched `ThreadPrimitive` + `MessagePrimitive`
 * primitives keeps rendering reliable.
 */
const FlatUserMessage = () => (
  <MessagePrimitive.Root
    className="qrclaw-user-message"
    style={{
      width: '100%',
      display: 'flex',
      justifyContent: 'flex-end',
      padding: 'var(--space-2) 0',
    }}
  >
    <div
      style={{
        maxWidth: '80%',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-lg, 12px)',
        background: 'var(--color-off-white)',
        border: '1px solid var(--color-dashboard-divider)',
        color: 'var(--color-gray-800)',
        fontFamily: 'var(--font-primary)',
        fontSize: 'var(--text-md)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <MessagePrimitive.Content components={{ Text: ({ text }) => <>{text}</> }} />
    </div>
  </MessagePrimitive.Root>
);
FlatUserMessage.displayName = 'OwnerFlatUserMessage';

/**
 * Returns a stable reference for `messages` when the logical content
 * (id + content + status + run_status tuple) hasn't changed.
 *
 * Streaming produces dozens of new `messages` array refs per second (each
 * delta does `messagesByAgent[agentId].map(...)` in the Zustand store). That
 * cascades through `useMemo(adapter, [..., messages])` → a new adapter object
 * → `useExternalStoreRuntime`'s `setAdapter` outer guard falls through → the
 * runtime re-imports the whole repository on every delta. That re-import
 * triggers `_notifySubscribers()`, which re-renders every subscriber —
 * including the Composer's `useAuiState` hooks. Even though we replaced the
 * library Composer with `ChatComposer`, keeping the adapter stable avoids
 * unnecessary repository churn on hot paths.
 *
 * This hook does a shallow tuple comparison per message and returns the
 * previous array ref if nothing changed. Cheap: O(n) in message count, runs
 * at most once per parent render.
 *
 * Reading prevRef.current during render is deliberate here: the whole point
 * is to hand the adapter a stable array reference synchronously in the same
 * render (an effect-based rewrite would return the stale array for one frame
 * and re-trigger the adapter churn this hook exists to prevent).
 */
/* eslint-disable react-hooks/refs -- deliberate synchronous memoization of the previous messages array ref; rationale in the JSDoc above. */
function useStableMessages(messages: ChatMessage[]): ChatMessage[] {
  const prevRef = useRef<ChatMessage[]>(messages);
  const prev = prevRef.current;
  if (prev === messages) return prev;
  if (prev.length === messages.length) {
    let same = true;
    for (let i = 0; i < messages.length; i++) {
      const a = prev[i];
      const b = messages[i];
      if (
        a.id !== b.id ||
        a.content !== b.content ||
        a.status !== b.status ||
        a.run_status !== b.run_status
      ) {
        same = false;
        break;
      }
    }
    if (same) return prev;
  }
  prevRef.current = messages;
  return messages;
}
/* eslint-enable react-hooks/refs */

function OwnerAssistantThread({
  agentId,
  agentName,
  canSend,
  isRunning,
  messages,
  onSend,
  onStop,
}: OwnerAssistantThreadProps) {
  const stableMessages = useStableMessages(messages);
  const hasMessages = messages.length > 0;
  const adapter = useMemo(
    () =>
      createOwnerAssistantAdapter({
        canSend,
        isRunning,
        messages: stableMessages,
        onSend,
        onStop,
      }),
    [canSend, isRunning, stableMessages, onSend, onStop]
  );
  const runtime = useExternalStoreRuntime(adapter);

  return (
    <div
      className="aui-root qrclaw-assistant-thread"
      data-agent-id={agentId}
      data-testid="owner-assistant-thread"
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root
          style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}
        >
          <ThreadPrimitive.Viewport
            autoScroll
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: 'var(--space-4) var(--space-6)',
            }}
          >
            {!hasMessages && (
              <div
                data-testid="owner-assistant-welcome"
                style={{
                  display: 'flex',
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 200,
                  color: 'var(--color-gray-500)',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 'var(--text-md)',
                }}
              >
                {`Start chatting with ${agentName}`}
              </div>
            )}
            <ThreadPrimitive.Messages
              components={{
                UserMessage: FlatUserMessage,
                AssistantMessage: FlatAssistantMessage,
              }}
            />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
        <div
          style={{
            flexShrink: 0,
            position: 'sticky',
            bottom: 0,
            zIndex: 5,
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-dashboard-divider)',
            background: 'var(--color-white)',
          }}
        >
          <ChatComposer
            onSend={onSend}
            onStop={onStop}
            isStreaming={isRunning}
            disabled={!canSend && !isRunning}
            placeholder={
              canSend || isRunning
                ? 'Type a message... (Shift+Enter for newline)'
                : 'Runtime offline'
            }
          />
        </div>
      </AssistantRuntimeProvider>
    </div>
  );
}

export default OwnerAssistantThread;
