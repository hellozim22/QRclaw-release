import type {
  AgentCreateQrcodeRequest,
  AgentCreateQrcodeResponse,
} from '../../../../shared/contracts/http/agent/types.js';

export const TOOL_NAME = 'qrclaw_create_qrcode';

export const TOOL_DESCRIPTION =
  'Create a new QRClaw QR code that links to a conversation with this agent. ' +
  'Returns the QR code ID, a public URL for visitors, and a QR image URL.';

/**
 * Hand-written JSON schema for the tool input.
 *
 * Intentionally not importing zod at runtime — the plugin should not
 * depend on zod in production builds. A test verifies this schema stays
 * in sync with the canonical Zod definition in shared/contracts.
 */
export const createQrcodeToolInputSchema = {
  type: 'object' as const,
  required: ['label'] as const,
  properties: {
    label: {
      type: 'string' as const,
      description: 'Display name for the QR code (1–64 characters)',
    },
    system_prompt: {
      type: 'string' as const,
      description: 'Optional system prompt for conversations started via this QR code',
    },
    callback_hint: {
      type: 'string' as const,
      description: 'Optional callback URL hint for the QR code',
    },
    agent_account_label: {
      type: 'string' as const,
      description: 'Optional account label to associate with this QR code',
    },
  },
};

export class CreateQrcodeToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CreateQrcodeToolError';
    this.code = code;
  }
}

/**
 * Derive a plain HTTP(S) base URL from a WebSocket URL.
 *
 * ws://  → http://
 * wss:// → https://
 * Trailing /ws path is stripped.
 * Already-HTTP URLs pass through unchanged.
 */
export function deriveGatewayBaseUrl(gatewayWsUrl: string): string {
  let url = gatewayWsUrl;

  if (url.startsWith('wss://')) {
    url = 'https://' + url.slice(6);
  } else if (url.startsWith('ws://')) {
    url = 'http://' + url.slice(5);
  }

  if (url.endsWith('/ws')) {
    url = url.slice(0, -3);
  }

  return url;
}

interface HandleContext {
  agentToken: string;
  gatewayWsUrl: string;
}

/**
 * Execute the create-qrcode tool against the QRClaw Gateway.
 *
 * Never propagates raw fetch exceptions — all errors are wrapped.
 */
export async function handleCreateQrcode(
  ctx: HandleContext,
  params: AgentCreateQrcodeRequest
): Promise<AgentCreateQrcodeResponse> {
  const baseUrl = deriveGatewayBaseUrl(ctx.gatewayWsUrl);
  const endpoint = `${baseUrl}/api/agent/create-qrcode`;

  const body: Record<string, unknown> = { label: params.label };
  if (params.system_prompt !== undefined) body.system_prompt = params.system_prompt;
  if (params.callback_hint !== undefined) body.callback_hint = params.callback_hint;
  if (params.agent_account_label !== undefined)
    body.agent_account_label = params.agent_account_label;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.agentToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CreateQrcodeToolError('network_error', `fetch failed: ${msg}`);
  }

  if (!response.ok) {
    let errorBody: { error?: { code?: string; message?: string } } | undefined;
    try {
      errorBody = (await response.json()) as { error?: { code?: string; message?: string } };
    } catch {
      /* ignore parse failures */
    }

    const code = errorBody?.error?.code ?? `http_${response.status}`;
    const message = errorBody?.error?.message ?? `HTTP ${response.status}`;
    throw new CreateQrcodeToolError(code, message);
  }

  const json = (await response.json()) as { data: AgentCreateQrcodeResponse };
  return json.data;
}
