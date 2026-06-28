import { createChatChannelPlugin, createChannelPluginBase } from './openclaw-types.js';
import { resolveAccounts, inspectAccount } from './accounts.js';
import type { ResolvedQRClawAccount, AccountConfig } from './accounts.js';
import { QRClawRuntime } from './runtime.js';
import { handleInboundFrame, getLiveSeenSet } from './inbound.js';
import type { InboundDeps } from './inbound.js';
import { sendText as outboundSendText } from './outbound/text.js';
import { createStream as outboundCreateStream } from './outbound/stream.js';
import type { QRClawStreamController } from './outbound/stream.js';
import { replayHistory } from './history.js';
import { listConversations, AgentConversationsError } from './agent-conversations-client.js';
import type { ConnectionState } from './client.js';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';

export interface PluginConfig {
  accounts: Record<string, AccountConfig>;
  defaultAccount?: string;
}

export interface LifecycleDeps {
  dispatchInbound: InboundDeps['dispatchInbound'];
  logger: NonNullable<InboundDeps['logger']>;
}

export interface PluginLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendText(params: { accountLabel: string; conversationId: string; text: string }): string;
  createStream(params: { accountLabel: string; conversationId: string }): QRClawStreamController;
  onConnectionStateChange(accountLabel: string, state: ConnectionState): Promise<void>;
}

type InspectResult = {
  configured: boolean;
  label: string;
  hasToken: boolean;
};

export function createQRClawChannelPlugin() {
  const channelPlugin = createChatChannelPlugin<
    ResolvedQRClawAccount & { accountId: string | null }
  >({
    base: createChannelPluginBase({
      id: 'qrclaw',
      setup: {
        resolveAccount(
          cfg: unknown,
          accountId?: string | null
        ): ResolvedQRClawAccount & { accountId: string | null } {
          const section = extractChannelSection(cfg);
          if (!section?.accounts) {
            throw new Error('qrclaw: accounts configuration is required');
          }
          const label = accountId ?? section.defaultAccount ?? Object.keys(section.accounts)[0];
          if (!label) throw new Error('qrclaw: no account found');

          const entry = section.accounts[label];
          if (!entry) throw new Error(`qrclaw: account "${label}" not found`);

          const accounts = resolveAccounts({ [label]: entry });
          return { ...accounts[0], accountId: label };
        },
        inspectAccount(cfg: unknown, accountId?: string | null): InspectResult {
          const section = extractChannelSection(cfg);
          const label = accountId ?? 'default';

          if (!section?.accounts?.[label]) {
            return { configured: false, label, hasToken: false };
          }

          const entry = section.accounts[label];
          return {
            configured: Boolean(entry.agentToken),
            label,
            hasToken: Boolean(entry.agentToken),
          };
        },
      },
    }),
    outbound: {
      attachedResults: {
        channel: 'qrclaw',
        sendText: async (ctx: { to: string; text: string }) => {
          return { messageId: `placeholder-${Date.now()}` };
        },
      },
      base: {},
    },
    threading: { topLevelReplyToMode: 'reply' },
  });

  function createLifecycle(config: PluginConfig, deps: LifecycleDeps): PluginLifecycle {
    let runtime: QRClawRuntime | null = null;
    // Per-account in-flight replay promise. Guards against the hook firing
    // twice in quick succession (e.g. runtime auto-fire on WS ack + a manual
    // invocation from the host). Second caller awaits the same promise.
    const inflightReplays = new Map<string, Promise<void>>();

    async function triggerReplay(accountLabel: string): Promise<void> {
      if (!runtime) return;
      const account = runtime.accounts().find((a) => a.label === accountLabel);
      if (!account) return;

      const existing = inflightReplays.get(accountLabel);
      if (existing) return existing;

      const task = (async (): Promise<void> => {
        let conversationIds: string[] = [];
        try {
          const items = await listConversations({ logger: deps.logger }, { account });
          conversationIds = items.map((it) => it.conversation_id);
        } catch (err) {
          const asErr = err as AgentConversationsError | Error;
          const status = err instanceof AgentConversationsError ? err.status : 0;
          const code = err instanceof AgentConversationsError ? err.code : 'unknown_error';
          deps.logger.warn(
            `[channel] history replay: failed to list conversations for "${accountLabel}" (status=${status}, code=${code}):`,
            asErr instanceof Error ? asErr.message : String(asErr)
          );
          return;
        }

        if (conversationIds.length === 0) {
          deps.logger.debug(
            `[channel] history replay: no conversations visible for "${accountLabel}"; skipping`
          );
          return;
        }

        try {
          await replayHistory(
            {
              dispatchInbound: deps.dispatchInbound,
              logger: deps.logger,
            },
            {
              account,
              conversationIds,
              seen: getLiveSeenSet(accountLabel),
            }
          );
        } catch (err) {
          deps.logger.warn(
            `[channel] history replay: unexpected error for "${accountLabel}":`,
            err instanceof Error ? err.message : err
          );
        }
      })().finally(() => {
        inflightReplays.delete(accountLabel);
      });

      inflightReplays.set(accountLabel, task);
      return task;
    }

    return {
      async start(): Promise<void> {
        const accounts = resolveAccounts(config.accounts);

        runtime = new QRClawRuntime(accounts, {
          onInboundFrame(accountLabel: string, frame: ServerFrame): void {
            handleInboundFrame(
              {
                dispatchInbound: deps.dispatchInbound,
                logger: deps.logger,
              },
              accountLabel,
              frame
            );
          },
          onStateChange(accountLabel: string, state: ConnectionState): void {
            if (state !== 'connected') return;
            // Defer one macrotask so the WS message queue drains first.
            // This guarantees that any live frame already delivered by the
            // server (or that lands during the same event-loop tick as the
            // connection_ack) registers in the live-dedup Set BEFORE replay
            // reads it, giving live-arrivals proper "win" over historical
            // copies of the same message_id.
            setTimeout(() => {
              if (!runtime) return;
              triggerReplay(accountLabel).catch((err: unknown) => {
                deps.logger.warn(
                  `[channel] history replay: auto-trigger failed for "${accountLabel}":`,
                  err instanceof Error ? err.message : err
                );
              });
            }, 0);
          },
          logger: deps.logger,
        });

        await runtime.start();
      },

      async stop(): Promise<void> {
        if (runtime) {
          await runtime.stop();
          runtime = null;
        }
      },

      sendText(params: { accountLabel: string; conversationId: string; text: string }): string {
        if (!runtime) throw new Error('Plugin not started');
        return outboundSendText(
          { runtime, logger: deps.logger },
          {
            accountLabel: params.accountLabel,
            conversationId: params.conversationId,
            text: params.text,
          }
        );
      },

      createStream(params: {
        accountLabel: string;
        conversationId: string;
      }): QRClawStreamController {
        if (!runtime) throw new Error('Plugin not started');
        return outboundCreateStream(
          { runtime, logger: deps.logger },
          {
            accountLabel: params.accountLabel,
            conversationId: params.conversationId,
          }
        );
      },

      /**
       * Host-invokable hook. The OpenClaw host may call this explicitly on
       * lifecycle transitions it observes; the runtime also fires this
       * automatically when the WS ack lands. Both paths route through
       * `triggerReplay` which is in-flight-deduped per account, so firing
       * twice is safe.
       */
      async onConnectionStateChange(accountLabel: string, state: ConnectionState): Promise<void> {
        if (state !== 'connected' || !runtime) return;
        await triggerReplay(accountLabel);
      },
    };
  }

  return {
    ...channelPlugin,
    createLifecycle,
  };
}

function extractChannelSection(cfg: unknown): PluginConfig | undefined {
  if (!cfg || typeof cfg !== 'object') return undefined;
  const c = cfg as Record<string, unknown>;
  const channels = c.channels as Record<string, unknown> | undefined;
  return channels?.qrclaw as PluginConfig | undefined;
}
