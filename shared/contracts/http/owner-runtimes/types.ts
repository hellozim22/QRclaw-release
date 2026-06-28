// Dependency-free TypeScript interfaces for Owner Runtimes HTTP DTOs.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

export const OWNER_RUNTIME_TYPES = ['openclaw', 'claude', 'cursor', 'codex', 'pi'] as const;
export type OwnerRuntimeType = (typeof OWNER_RUNTIME_TYPES)[number];

export const OWNER_RUNTIME_STATUSES = [
  'online',
  'offline',
  'updating',
  'not_installed',
  'needs_login',
  'error',
] as const;
export type OwnerRuntimeStatus = (typeof OWNER_RUNTIME_STATUSES)[number];

export interface OwnerRuntimeInstallHint {
  label: string;
  command: string;
  docs_url: string;
}

export interface OwnerRuntimeDefaultAgent {
  id: string;
  name: string;
  avatar_url: string | null;
  status: 'active' | 'archived';
  is_default: boolean;
  source: 'system_default' | 'user_created' | 'imported';
}

export interface OwnerRuntime {
  id: string | null;
  runtime_type: OwnerRuntimeType;
  display_name: string;
  runtime_status: OwnerRuntimeStatus;
  status_reason: string | null;
  version: string | null;
  capabilities: Record<string, unknown>;
  last_seen_at: string | null;
  install_hint: OwnerRuntimeInstallHint;
  default_agent: OwnerRuntimeDefaultAgent | null;
}

export interface OwnerRuntimesResponse {
  data: OwnerRuntime[];
  meta: {
    total: number;
    online_count: number;
  };
}