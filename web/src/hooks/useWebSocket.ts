// WebSocket hook for chat pages
// Bridges WSClient lifecycle with chatStore actions
// Acquires a visitor ticket before connecting to the Gateway

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { WSClient } from '@/lib/ws/client';
import { fetchVisitorTicket } from '@/lib/ws/ticket';
import { fetchMessageHistory } from '@/lib/ws/history';
import { useChatStore } from '@/stores/chatStore';
import type { ConnectionStatus, ChatMessage } from '@/types/chat';
import type { AckFrame, MessageFrame, StreamChunkFrame, StreamEndFrame } from '@/types/ws';

interface UseWebSocketOptions {
  agentId: string;
  qrCodeId: string | null;
  /** When set, skip ticket/WS and only show these messages (visual audit / design parity). */
  staticSnapshotMessages?: ChatMessage[];
}

interface UseWebSocketReturn {
  sendMessage: (content: string) => void;
  connectionStatus: ConnectionStatus;
  /** True when staticSnapshotMessages is used (no live WS; UI should disable send). */
  isStaticSnapshot: boolean;
}

const GATEWAY_WS_URL = process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? 'ws://localhost:3001/ws';
const GATEWAY_HTTP_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://gateway-test.qrclaw.ai';

export function useWebSocket({
  agentId,
  qrCodeId,
  staticSnapshotMessages,
}: UseWebSocketOptions): UseWebSocketReturn {
  const isStaticSnapshot = Boolean(staticSnapshotMessages && staticSnapshotMessages.length > 0);
  const clientRef = useRef<WSClient | null>(null);
  const streamStartedRef = useRef<Set<string>>(new Set());

  const {
    connectionStatus,
    addMessage,
    updateMessageStatus,
    loadHistory,
    startStream,
    appendStreamDelta,
    endStream,
    setConnectionStatus,
    setAgentThinking,
    reset,
  } = useChatStore();

  /** Stable across object key order / whitespace in content — ids identify audit fixtures. */
  const staticSnapshotKey = useMemo(() => {
    if (!staticSnapshotMessages?.length) return '';
    const ids = staticSnapshotMessages.map((m) => String(m.id ?? ''));
    return [...ids].sort().join('\u0001');
  }, [staticSnapshotMessages]);

  const staticSnapshotRef = useRef(staticSnapshotMessages);
  useEffect(() => {
    staticSnapshotRef.current = staticSnapshotMessages;
  });

  useEffect(() => {
    reset();

    const snap = staticSnapshotRef.current;
    if (staticSnapshotKey && snap && snap.length > 0) {
      // reset() above clears the store; loadHistory then prepends these ids (no merge with prior).
      setConnectionStatus('connected');
      loadHistory(snap);
      return () => {
        streamStartedRef.current.clear();
      };
    }

    // HIGH-2: If no qrCodeId, don't attempt to connect — show disconnected state
    if (!qrCodeId) {
      setConnectionStatus('disconnected');
      return;
    }

    let cancelled = false;

    const initConnection = async () => {
      setConnectionStatus('connecting');

      try {
        // Step 1: Acquire visitor ticket from Gateway HTTP API
        const { ticket, sessionToken } = await fetchVisitorTicket(qrCodeId, GATEWAY_HTTP_URL);

        if (cancelled) return;

        // Step 2: Connect WebSocket with ticket
        const client = new WSClient({
          gatewayUrl: GATEWAY_WS_URL,
          agentId,
          ticket,
          role: 'visitor',
          sessionToken,

          onStatusChange: (status: ConnectionStatus) => {
            setConnectionStatus(status);
          },

          onAck: (frame: AckFrame) => {
            // Phase 2 Wave 2 D5 widened `AckFrame.payload.status` with the
            // router-emitted values (`'accepted'`, `'duplicate'`,
            // `'rejected:*'`) that the chat store's narrower
            // `ChatMessage['status']` union does not yet enumerate. The
            // store simply records the string; UI consumers that switch
            // on status fall through to the default branch for unknown
            // values. Mapping new statuses into the chat-store vocabulary
            // is deferred to a dedicated UX follow-up.
            updateMessageStatus(
              frame.payload.message_id,
              frame.payload.status as ChatMessage['status']
            );
          },

          onMessage: (frame: MessageFrame) => {
            const message: ChatMessage = {
              id: frame.id,
              content: frame.payload.content,
              contentType: frame.payload.content_type,
              senderType: frame.payload.sender_type,
              timestamp: frame.timestamp,
              status: 'delivered',
            };
            addMessage(message);
          },

          onStreamChunk: (frame: StreamChunkFrame) => {
            const streamId = frame.id;
            if (!streamStartedRef.current.has(streamId)) {
              streamStartedRef.current.add(streamId);
              startStream(streamId);
            }
            appendStreamDelta(streamId, frame.payload.delta, frame.payload.sequence);
          },

          onStreamEnd: (frame: StreamEndFrame) => {
            const streamId = frame.id;
            streamStartedRef.current.delete(streamId);
            endStream(streamId, frame.payload.full_content);
          },

          onAgentTyping: () => {
            setAgentThinking(true);
          },

          onError: (frame) => {
            console.error('[WSClient] Server error:', frame.payload.code, frame.payload.message);
          },
        });

        clientRef.current = client;
        client.connect();

        // Step 3: Load message history (best-effort, non-blocking)
        fetchMessageHistory(qrCodeId, sessionToken)
          .then((history) => {
            if (!cancelled && history.length > 0) {
              loadHistory(history);
            }
          })
          .catch(() => {
            // History load failure should not affect real-time chat
          });
      } catch (err) {
        console.error('[useWebSocket] Failed to acquire visitor ticket:', err);
        if (!cancelled) {
          setConnectionStatus('disconnected');
        }
      }
    };

    initConnection();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
      streamStartedRef.current.clear();
    };
  }, [agentId, qrCodeId, staticSnapshotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(
    (content: string) => {
      const client = clientRef.current;
      if (!client) return;

      const messageId = crypto.randomUUID();
      const optimisticMessage: ChatMessage = {
        id: messageId,
        content,
        contentType: 'text',
        senderType: 'visitor',
        timestamp: new Date().toISOString(),
        status: 'sending',
      };
      addMessage(optimisticMessage);

      client.sendMessage(content, 'text', messageId);
    },
    [addMessage]
  );

  return { sendMessage, connectionStatus, isStaticSnapshot };
}
