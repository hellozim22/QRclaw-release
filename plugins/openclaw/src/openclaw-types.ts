/**
 * Minimal type declarations for the OpenClaw Plugin SDK surface
 * used by @qrclaw/openclaw-plugin.
 *
 * These mirror the shapes from `openclaw/plugin-sdk/channel-core` but
 * are defined locally so the plugin compiles without a built dist/ in
 * the openclaw package. At runtime, the real OpenClaw host provides the
 * actual implementations.
 */

export interface ChannelPluginSetup<TResolvedAccount = unknown> {
  resolveAccount: (cfg: unknown, accountId?: string | null) => TResolvedAccount;
  inspectAccount?: (cfg: unknown, accountId?: string | null) => Record<string, unknown>;
}

export interface ChannelPluginBase<TResolvedAccount = unknown> {
  id: string;
  meta?: Record<string, unknown>;
  setup: ChannelPluginSetup<TResolvedAccount>;
  [key: string]: unknown;
}

export interface ChannelPlugin<
  TResolvedAccount = unknown,
> extends ChannelPluginBase<TResolvedAccount> {
  security?: unknown;
  pairing?: unknown;
  threading?: unknown;
  outbound?: unknown;
  conversationBindings?: { supportsCurrentConversationBinding?: boolean };
}

export interface PluginRuntime {
  config?: {
    loadConfig?: () => unknown;
  };
  [key: string]: unknown;
}

export interface OpenClawPluginApi {
  registrationMode?: string;
  runtime: PluginRuntime;
  registerChannel?: (opts: { plugin: ChannelPlugin }) => void;
  registerTool: (opts: {
    name: string;
    description: string;
    parameters: unknown;
    execute: (
      id: string,
      params: Record<string, unknown>
    ) => Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
  }) => void;
}

export interface DefinedChannelPluginEntry<TPlugin = ChannelPlugin> {
  id: string;
  name: string;
  description: string;
  configSchema: unknown;
  register: (api: OpenClawPluginApi) => void;
  channelPlugin: TPlugin;
}

export function createChannelPluginBase<TResolvedAccount>(params: {
  id: string;
  setup: ChannelPluginSetup<TResolvedAccount>;
  [key: string]: unknown;
}): ChannelPluginBase<TResolvedAccount> {
  return {
    id: params.id,
    setup: params.setup,
  };
}

export function createChatChannelPlugin<TResolvedAccount>(params: {
  base: ChannelPluginBase<TResolvedAccount>;
  security?: unknown;
  pairing?: unknown;
  threading?: unknown;
  outbound?: unknown;
}): ChannelPlugin<TResolvedAccount> {
  return {
    ...params.base,
    conversationBindings: { supportsCurrentConversationBinding: true },
    ...(params.security ? { security: params.security } : {}),
    ...(params.pairing ? { pairing: params.pairing } : {}),
    ...(params.threading ? { threading: params.threading } : {}),
    ...(params.outbound ? { outbound: params.outbound } : {}),
  };
}

export function defineChannelPluginEntry<TPlugin extends ChannelPlugin>(opts: {
  id: string;
  name: string;
  description: string;
  plugin: TPlugin;
  configSchema?: unknown;
  setRuntime?: (runtime: PluginRuntime) => void;
  registerCliMetadata?: (api: OpenClawPluginApi) => void;
  registerFull?: (api: OpenClawPluginApi) => void;
}): DefinedChannelPluginEntry<TPlugin> {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    configSchema: opts.configSchema ?? { type: 'object', additionalProperties: false },
    register(api: OpenClawPluginApi) {
      if (api.registrationMode === 'cli-metadata') {
        opts.registerCliMetadata?.(api);
        return;
      }
      opts.setRuntime?.(api.runtime);
      api.registerChannel?.({ plugin: opts.plugin });
      if (api.registrationMode !== 'full') return;
      opts.registerCliMetadata?.(api);
      opts.registerFull?.(api);
    },
    channelPlugin: opts.plugin,
  };
}

export function defineSetupPluginEntry<TPlugin>(plugin: TPlugin): { plugin: TPlugin } {
  return { plugin };
}
