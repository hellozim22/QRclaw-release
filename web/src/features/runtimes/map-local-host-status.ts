import type { OwnerAgentProvider } from '@shared/contracts/http/owner-agent-chat/types';

export interface RuntimeRow {
  provider: OwnerAgentProvider;
  status: 'online' | 'offline' | 'updating' | string;
  detected: boolean;
}

const DEFAULT_RUNTIME_ROWS: RuntimeRow[] = [
  { provider: 'claude', status: 'offline', detected: false },
  { provider: 'cursor', status: 'offline', detected: false },
  { provider: 'codex', status: 'offline', detected: false },
  { provider: 'openclaw', status: 'offline', detected: false },
];

export interface LocalHostStatus {
  providers: RuntimeRow[];
  onlineRuntimeCount: number;
  hostConnected: boolean;
  installHint: string | null;
}

interface LocalHostStatusResponse {
  data?: {
    providers?: RuntimeRow[];
    online_runtime_count?: number;
    host_connected?: boolean;
    install_hint?: string | null;
  };
}

export const mapLocalHostStatusToRuntimeRows = (
  response: LocalHostStatusResponse,
): LocalHostStatus => {
  const providers = response.data?.providers?.length
    ? response.data.providers
    : DEFAULT_RUNTIME_ROWS;
  return {
    providers,
    onlineRuntimeCount: response.data?.online_runtime_count ?? providers.filter((row) => row.status === 'online').length,
    hostConnected: response.data?.host_connected ?? providers.some((row) => row.status === 'online'),
    installHint: response.data?.install_hint ?? null,
  };
};
