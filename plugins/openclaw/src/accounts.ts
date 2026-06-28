export interface AccountConfig {
  agentToken: string;
  gatewayWsUrl?: string;
  supabaseUrl?: string;
  ticketUrl?: string;
}

export interface ResolvedQRClawAccount {
  label: string;
  agentToken: string;
  gatewayWsUrl: string;
  supabaseUrl: string;
  ticketUrl?: string;
  supabaseAnonKey?: string;
}

export interface AccountInspection {
  hasToken: boolean;
  label: string;
}

export function resolveAccounts(
  configAccounts: Record<string, AccountConfig>
): ResolvedQRClawAccount[] {
  const labels = Object.keys(configAccounts);
  if (labels.length === 0) {
    throw new Error('resolveAccounts: config must contain at least one account');
  }

  const resolved: ResolvedQRClawAccount[] = [];

  for (const label of labels) {
    const entry = configAccounts[label];

    if (!entry.agentToken) {
      throw new Error(`resolveAccounts: agentToken is required on account "${label}"`);
    }
    if (!entry.gatewayWsUrl) {
      throw new Error(`resolveAccounts: gatewayWsUrl is required on account "${label}"`);
    }
    if (!entry.supabaseUrl) {
      throw new Error(`resolveAccounts: supabaseUrl is required on account "${label}"`);
    }

    resolved.push({
      label,
      agentToken: entry.agentToken,
      gatewayWsUrl: entry.gatewayWsUrl,
      supabaseUrl: entry.supabaseUrl,
      ticketUrl: entry.ticketUrl,
    });
  }

  return resolved;
}

export function inspectAccount(account: ResolvedQRClawAccount): AccountInspection {
  return {
    hasToken: Boolean(account.agentToken),
    label: account.label,
  };
}
