import type {
  OwnerAgentProvider,
  OwnerAgentSummary,
} from '@shared/contracts/http/owner-agent-chat/types';

export const DEFAULT_AGENT_DISPLAY_NAMES: Record<OwnerAgentProvider, string> = {
  openclaw: 'OpenClaw',
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  pi: 'Pi',
};

export const getProviderDisplayName = (provider: OwnerAgentProvider): string =>
  DEFAULT_AGENT_DISPLAY_NAMES[provider] ?? provider;

export const isSystemDefaultAgent = (agent: OwnerAgentSummary): boolean =>
  agent.is_default || agent.source === 'system_default';

export const getAgentDisplayName = (agent: OwnerAgentSummary): string =>
  isSystemDefaultAgent(agent)
    ? getProviderDisplayName(agent.backend_provider)
    : agent.name;
