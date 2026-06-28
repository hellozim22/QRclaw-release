import { describe, it, expect } from 'vitest';

describe('setup-entry', () => {
  it('exports a plugin object with setup surface', async () => {
    const setupEntry = await import('../setup-entry.js');
    const exported = setupEntry.default;
    expect(exported).toBeDefined();
    expect(exported.plugin).toBeDefined();
  });

  it('inspectAccount output does NOT contain agentToken', async () => {
    const { createQRClawChannelPlugin } = await import('../src/channel.js');
    const plugin = createQRClawChannelPlugin();

    const fakeConfig = {
      channels: {
        qrclaw: {
          accounts: {
            default: {
              agentToken: 'qak_super_secret_token_xyz',
              gatewayWsUrl: 'wss://gw.example.com/ws',
              supabaseUrl: 'https://xxx.supabase.co',
            },
            bot2: {
              agentToken: 'qak_another_secret_token_abc',
              gatewayWsUrl: 'wss://gw.example.com/ws',
              supabaseUrl: 'https://xxx.supabase.co',
            },
          },
        },
      },
    };

    const result1 = plugin.setup.inspectAccount!(fakeConfig as never, 'default');
    const result2 = plugin.setup.inspectAccount!(fakeConfig as never, 'bot2');

    const serialized = JSON.stringify([result1, result2]);
    expect(serialized).not.toContain('qak_super_secret_token_xyz');
    expect(serialized).not.toContain('qak_another_secret_token_abc');
  });

  it('setup summary contains account labels and configured status', async () => {
    const { createQRClawChannelPlugin } = await import('../src/channel.js');
    const plugin = createQRClawChannelPlugin();

    const fakeConfig = {
      channels: {
        qrclaw: {
          accounts: {
            main: {
              agentToken: 'qak_main_token',
              gatewayWsUrl: 'wss://gw.example.com/ws',
              supabaseUrl: 'https://xxx.supabase.co',
            },
          },
        },
      },
    };

    const result = plugin.setup.inspectAccount!(fakeConfig as never, 'main');
    expect(result).toHaveProperty('configured');
    expect(result).toHaveProperty('label');
    expect(result.label).toBe('main');
  });

  it('reports unconfigured for missing account', async () => {
    const { createQRClawChannelPlugin } = await import('../src/channel.js');
    const plugin = createQRClawChannelPlugin();

    const emptyConfig = { channels: {} };
    const result = plugin.setup.inspectAccount!(emptyConfig as never, 'nonexistent');
    expect(result.configured).toBe(false);
  });
});
