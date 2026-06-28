import { defineChannelPluginEntry } from './src/openclaw-types.js';
import type { OpenClawPluginApi } from './src/openclaw-types.js';
import { createQRClawChannelPlugin } from './src/channel.js';
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  createQrcodeToolInputSchema,
  handleCreateQrcode,
} from './src/tools/create-qrcode.js';

const qrclawPlugin = createQRClawChannelPlugin();

export default defineChannelPluginEntry({
  id: 'qrclaw',
  name: 'QRClaw',
  description: 'QRClaw QR-code chat channel plugin for OpenClaw',
  plugin: qrclawPlugin,
  registerFull(api: OpenClawPluginApi) {
    api.registerTool({
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      parameters: createQrcodeToolInputSchema as never,
      async execute(_id: string, params: Record<string, unknown>) {
        const cfg = api.runtime?.config?.loadConfig?.() as
          | {
              channels?: {
                qrclaw?: {
                  accounts?: Record<string, { agentToken: string; gatewayWsUrl?: string }>;
                };
              };
            }
          | undefined;

        const accounts = cfg?.channels?.qrclaw?.accounts;
        if (!accounts) {
          return {
            content: [{ type: 'text' as const, text: 'Error: QRClaw accounts not configured' }],
          };
        }

        const accountLabel = (params.agent_account_label as string) ?? Object.keys(accounts)[0];
        const account = accounts[accountLabel];
        if (!account) {
          return {
            content: [
              { type: 'text' as const, text: `Error: account "${accountLabel}" not found` },
            ],
          };
        }

        try {
          const result = await handleCreateQrcode(
            {
              agentToken: account.agentToken,
              gatewayWsUrl: account.gatewayWsUrl ?? '',
            },
            {
              label: params.label as string,
              system_prompt: params.system_prompt as string | undefined,
              callback_hint: params.callback_hint as string | undefined,
              agent_account_label: params.agent_account_label as string | undefined,
            }
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          };
        }
      },
    });
  },
});
