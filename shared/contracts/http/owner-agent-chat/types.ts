// Dependency-free TypeScript interfaces for Owner Agent Chat HTTP DTOs.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

export const OWNER_AGENT_PROVIDERS = ['openclaw', 'claude', 'cursor', 'codex', 'pi'] as const;
export type OwnerAgentProvider = (typeof OWNER_AGENT_PROVIDERS)[number];

export const OWNER_AGENT_BACKEND_SOURCES = ['local', 'cloud'] as const;
export type OwnerAgentBackendSource = (typeof OWNER_AGENT_BACKEND_SOURCES)[number];

export const OWNER_AGENT_EXECUTION_MODES = ['standard', 'full_access'] as const;
export type OwnerAgentExecutionMode = (typeof OWNER_AGENT_EXECUTION_MODES)[number];

export const OWNER_AGENT_SOURCES = ['system_default', 'user_created', 'imported'] as const;
export type OwnerAgentSource = (typeof OWNER_AGENT_SOURCES)[number];

export const OWNER_AGENT_RUNTIME_STATUSES = ['online', 'offline', 'updating'] as const;
export type OwnerAgentRuntimeStatus = (typeof OWNER_AGENT_RUNTIME_STATUSES)[number];

export const OWNER_AGENT_RUN_STATUSES = [
  'pending',
  'queued',
  'host_dispatched',
  'accepted',
  'running',
  'completed',
  'failed',
  'cancelled',
  'timeout',
] as const;
export type OwnerAgentRunStatus = (typeof OWNER_AGENT_RUN_STATUSES)[number];

export const OWNER_AGENT_MESSAGE_CONTENT_TYPES = ['text'] as const;
export type OwnerAgentMessageContentType = (typeof OWNER_AGENT_MESSAGE_CONTENT_TYPES)[number];

export const OWNER_AGENT_MESSAGE_SENDER_TYPES = ['owner', 'agent', 'system'] as const;
export type OwnerAgentMessageSenderType = (typeof OWNER_AGENT_MESSAGE_SENDER_TYPES)[number];

export const OWNER_AGENT_RUN_EVENT_TYPES = [
  'text',
  'status',
  'error',
  'tool_use',
  'tool_result',
  'thinking',
] as const;
export type OwnerAgentRunEventType = (typeof OWNER_AGENT_RUN_EVENT_TYPES)[number];

export const OWNER_AGENT_HOST_TYPES = ['local', 'cloud'] as const;
export type OwnerAgentHostType = (typeof OWNER_AGENT_HOST_TYPES)[number];

export const OWNER_AGENT_HOST_STATUSES = ['online', 'offline', 'revoked'] as const;
export type OwnerAgentHostStatus = (typeof OWNER_AGENT_HOST_STATUSES)[number];

export const OWNER_AGENT_PROVIDER_STATUSES = ['available', 'unavailable', 'version_unsupported'] as const;
export type OwnerAgentProviderStatus = (typeof OWNER_AGENT_PROVIDER_STATUSES)[number];

export const OWNER_AGENT_NAME_MAX = 128;
export const OWNER_AGENT_DESCRIPTION_MAX = 512;
export const OWNER_AGENT_INSTRUCTIONS_MAX = 8_000;
export const OWNER_AGENT_SUGGESTED_PROMPTS_MAX = 10;
export const OWNER_AGENT_SUGGESTED_PROMPT_MAX = 200;
export const OWNER_AGENT_MESSAGE_CONTENT_MAX = 16_384;
export const OWNER_AGENT_HOST_LABEL_MAX = 128;
export const OWNER_AGENT_SESSION_TITLE_MAX = 120;

export interface HostTokenScope {
  owner_id: string;
  allowed_provider_set: OwnerAgentProvider[];
  can_register_local: boolean;
  can_receive_private_runs: boolean;
}

export interface OwnerAgentCreateAgentRequest {
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  backend_provider: OwnerAgentProvider;
  backend_source: OwnerAgentBackendSource;
  instructions?: string | null;
  suggested_prompts?: string[];
  execution_mode: OwnerAgentExecutionMode;
  execution_mode_ack: boolean;
}

export interface OwnerAgentUpdateAgentRequest {
  name?: string;
  avatar_url?: string | null;
  description?: string | null;
  instructions?: string | null;
  suggested_prompts?: string[];
  execution_mode?: OwnerAgentExecutionMode;
  status?: 'active' | 'archived';
}

export interface OwnerAgentSummary {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  instructions?: string | null;
  backend_provider: OwnerAgentProvider;
  backend_source: OwnerAgentBackendSource;
  execution_mode: OwnerAgentExecutionMode;
  status: 'active' | 'archived';
  runtime_id: string | null;
  runtime_status: OwnerAgentRuntimeStatus | null;
  runtime_version?: string | null;
  runtime_models?: string[];
  is_default: boolean;
  source: OwnerAgentSource;
  last_active_at: string | null;
  created_at: string;
}

export interface OwnerAgentListResponse {
  data: OwnerAgentSummary[];
}

export interface OwnerAgentConversationResponse {
  conversation_id: string;
  agent_id: string;
  owner_id: string;
  provider_session_id: string | null;
  provider_work_dir: string | null;
  status: 'active' | 'archived';
  last_active_at: string | null;
  created_at: string;
}

export interface OwnerAgentCreateSessionRequest {
  title?: string;
}

export interface OwnerAgentRenameSessionRequest {
  title: string;
}

export interface OwnerAgentSessionResponse {
  session_id: string;
  conversation_id: string;
  agent_id: string;
  owner_id: string;
  title: string;
  provider_session_id: string | null;
  provider_work_dir: string | null;
  status: 'active' | 'archived';
  last_active_at: string | null;
  created_at: string;
}

export interface OwnerAgentSessionMutationResponse {
  data: OwnerAgentSessionResponse;
}

export interface OwnerAgentSendMessageRequest {
  content: string;
  content_type: OwnerAgentMessageContentType;
  client_message_id?: string;
  requested_model?: string;
}

export interface OwnerAgentSendMessageResponse {
  message_id: string;
  conversation_id: string;
  run_id: string;
  status: OwnerAgentRunStatus;
}

export interface OwnerAgentRun {
  id: string;
  conversation_id: string;
  agent_id: string;
  host_id: string | null;
  provider: OwnerAgentProvider;
  status: OwnerAgentRunStatus;
  requested_model: string | null;
  actual_model: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface OwnerAgentRunResponse {
  data: OwnerAgentRun;
}

export interface OwnerAgentProviderCapability {
  provider: OwnerAgentProvider;
  version: string | null;
  status: OwnerAgentProviderStatus;
  capabilities: {
    streaming: boolean;
    full_access: boolean;
    models?: string[];
  };
}

export interface OwnerAgentHost {
  host_id: string;
  host_type: OwnerAgentHostType;
  display_name: string | null;
  status: OwnerAgentHostStatus;
  last_seen_at: string | null;
  providers: OwnerAgentProviderCapability[];
}

export interface OwnerAgentHostsResponse {
  data: OwnerAgentHost[];
}

export interface OwnerAgentCreateHostTokenRequest {
  label?: string;
  host_id?: string;
  scope: HostTokenScope;
  expires_at?: string;
}

export interface OwnerAgentCreateHostTokenResponse {
  token_id: string;
  token: string;
  scope: HostTokenScope;
  expires_at: string | null;
  created_at: string;
}

export const OWNER_AGENT_CHAT_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'host_offline',
  'pending_limit_reached',
  'internal_error',
] as const;
export type OwnerAgentChatErrorCode = (typeof OWNER_AGENT_CHAT_ERROR_CODES)[number];
