// Visitor chat (legacy / Wave ≤9)
export { default as ChatInputBar } from './ChatInputBar';
export { default as ChatMenu } from './ChatMenu';
export { default as ConnectionStatusBanner } from './ConnectionStatusBanner';
export { default as RegisterBanner } from './RegisterBanner';
export { default as MessageList } from './MessageList';

// Wave 10 Sprint 1 — owner→agent chat surface
export { default as MarkdownRenderer } from './MarkdownRenderer';
export { default as CodeBlock } from './CodeBlock';
export { default as StreamingText } from './StreamingText';
export { default as ChatMessageBubble } from './ChatMessageBubble';
export { default as ChatComposer } from './ChatComposer';

export type { MarkdownRendererProps } from './MarkdownRenderer';
export type { CodeBlockProps } from './CodeBlock';
export type { StreamingTextProps } from './StreamingText';
export type { ChatMessageBubbleProps, ChatRole } from './ChatMessageBubble';
export type { ChatComposerProps, ChatComposerHandle } from './ChatComposer';

// Wave 10 Sprint 1 — runtime rail + onboarding + session list
export { default as AgentCard, StatusDot } from './AgentCard';
export { default as AgentRuntimeRail } from './AgentRuntimeRail';
export { default as OnboardingEmptyState } from './OnboardingEmptyState';
export { default as RuntimeInstallHint } from './RuntimeInstallHint';
export { default as SessionList } from './SessionList';

export type { AgentCardProps, RuntimeStatus } from './AgentCard';
export type { AgentRuntimeRailProps, RuntimeSlot } from './AgentRuntimeRail';
export type {
  OnboardingEmptyStateProps,
  OnboardingRuntimeRow,
  OnboardingState,
} from './OnboardingEmptyState';
export type { RuntimeInstallHintProps } from './RuntimeInstallHint';
export type { SessionListProps, SessionItem } from './SessionList';
