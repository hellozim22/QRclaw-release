// Chat state management with Zustand
// Handles messages, connection status, streaming state, and optimistic sends

import { create } from 'zustand';
import type { ChatMessage, ConnectionStatus, StreamingState } from '@/types/chat';

interface ChatStore {
  // State
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  streaming: StreamingState | null;
  isAgentThinking: boolean;

  // Message actions
  addMessage: (message: ChatMessage) => void;
  updateMessageStatus: (messageId: string, status: ChatMessage['status']) => void;
  loadHistory: (messages: ChatMessage[]) => void;

  // Streaming actions
  startStream: (messageId: string) => void;
  appendStreamDelta: (messageId: string, delta: string, sequence: number | undefined) => void;
  endStream: (messageId: string, fullContent?: string) => void;

  // Connection actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  setAgentThinking: (thinking: boolean) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  messages: [] as ChatMessage[],
  connectionStatus: 'disconnected' as ConnectionStatus,
  streaming: null as StreamingState | null,
  isAgentThinking: false,
};

export const useChatStore = create<ChatStore>((set) => ({
  ...initialState,

  addMessage: (message) =>
    set((state) => {
      const existing = state.messages.find((m) => m.id === message.id);
      if (existing) {
        if (existing.status === message.status) return state;
        return {
          messages: state.messages.map((m) =>
            m.id === message.id ? { ...m, status: message.status } : m
          ),
        };
      }
      return { messages: [...state.messages, message], isAgentThinking: false };
    }),

  updateMessageStatus: (messageId, status) =>
    set((state) => ({
      messages: state.messages.map((msg) => (msg.id === messageId ? { ...msg, status } : msg)),
    })),

  loadHistory: (historyMessages) =>
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const newMessages = historyMessages.filter((m) => !existingIds.has(m.id));
      return { messages: [...newMessages, ...state.messages] };
    }),

  startStream: (messageId) =>
    set(() => ({
      streaming: { messageId, content: '', sequence: undefined },
      isAgentThinking: false,
    })),

  appendStreamDelta: (messageId, delta, sequence) =>
    set((state) => {
      if (!state.streaming || state.streaming.messageId !== messageId) {
        return { streaming: { messageId, content: delta, sequence } };
      }
      // Dedup only when BOTH sides have a concrete sequence; unsequenced
      // chunks always append (gateway is authoritative for ordering).
      if (
        sequence !== undefined &&
        state.streaming.sequence !== undefined &&
        sequence <= state.streaming.sequence
      ) {
        return state;
      }
      return {
        streaming: {
          messageId,
          content: state.streaming.content + delta,
          // Preserve the highest seen sequenced value; leave unchanged when
          // the incoming chunk is unsequenced.
          sequence: sequence ?? state.streaming.sequence,
        },
      };
    }),

  endStream: (messageId, fullContent) =>
    set((state) => {
      const content = fullContent ?? state.streaming?.content ?? '';
      if (!content.trim()) {
        return { streaming: null, isAgentThinking: false };
      }
      const agentMessage: ChatMessage = {
        id: messageId,
        content,
        contentType: 'markdown',
        senderType: 'agent',
        timestamp: new Date().toISOString(),
        status: 'delivered',
      };
      return {
        messages: [...state.messages, agentMessage],
        streaming: null,
        isAgentThinking: false,
      };
    }),

  setConnectionStatus: (status) =>
    set(() => ({
      connectionStatus: status,
      ...(status === 'disconnected' ? { isAgentThinking: false } : {}),
    })),

  setAgentThinking: (thinking) => set(() => ({ isAgentThinking: thinking })),

  reset: () => set(() => ({ ...initialState })),
}));
