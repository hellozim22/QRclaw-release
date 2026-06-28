import { describe, it, expect } from 'vitest';
import { resolveAccounts, inspectAccount, type ResolvedQRClawAccount } from '../src/accounts.js';

describe('resolveAccounts', () => {
  it('resolves two valid accounts', () => {
    const accounts = resolveAccounts({
      default: {
        agentToken: 'qak_token_1',
        gatewayWsUrl: 'wss://gw.example.com/ws',
        supabaseUrl: 'https://xxx.supabase.co',
      },
      'my-bot': {
        agentToken: 'qak_token_2',
        gatewayWsUrl: 'wss://gw.example.com/ws',
        supabaseUrl: 'https://xxx.supabase.co',
        ticketUrl: 'https://custom.ticket/endpoint',
      },
    });

    expect(accounts).toHaveLength(2);
    expect(accounts[0].label).toBe('default');
    expect(accounts[0].agentToken).toBe('qak_token_1');
    expect(accounts[0].ticketUrl).toBeUndefined();
    expect(accounts[1].label).toBe('my-bot');
    expect(accounts[1].ticketUrl).toBe('https://custom.ticket/endpoint');
  });

  it('rejects an empty accounts map', () => {
    expect(() => resolveAccounts({})).toThrow(/at least one account/i);
  });

  it('rejects missing agentToken', () => {
    expect(() =>
      resolveAccounts({
        broken: {
          agentToken: '',
          gatewayWsUrl: 'wss://gw.example.com/ws',
          supabaseUrl: 'https://xxx.supabase.co',
        },
      })
    ).toThrow(/agentToken.*broken/i);
  });

  it('rejects missing gatewayWsUrl', () => {
    expect(() =>
      resolveAccounts({
        broken: {
          agentToken: 'qak_xxx',
          gatewayWsUrl: '',
          supabaseUrl: 'https://xxx.supabase.co',
        },
      })
    ).toThrow(/gatewayWsUrl.*broken/i);
  });

  it('rejects missing supabaseUrl', () => {
    expect(() =>
      resolveAccounts({
        broken: {
          agentToken: 'qak_xxx',
          gatewayWsUrl: 'wss://gw.example.com/ws',
          supabaseUrl: '',
        },
      })
    ).toThrow(/supabaseUrl.*broken/i);
  });
});

describe('inspectAccount', () => {
  it('returns hasToken true without echoing the token value', () => {
    const account: ResolvedQRClawAccount = {
      label: 'default',
      agentToken: 'qak_secret_123',
      gatewayWsUrl: 'wss://gw.example.com/ws',
      supabaseUrl: 'https://xxx.supabase.co',
    };

    const result = inspectAccount(account);
    expect(result.hasToken).toBe(true);
    expect(result.label).toBe('default');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('qak_secret_123');
  });

  it('returns hasToken false for empty token', () => {
    const account: ResolvedQRClawAccount = {
      label: 'empty',
      agentToken: '',
      gatewayWsUrl: 'wss://gw.example.com/ws',
      supabaseUrl: 'https://xxx.supabase.co',
    };

    const result = inspectAccount(account);
    expect(result.hasToken).toBe(false);
    expect(result.label).toBe('empty');
  });
});
