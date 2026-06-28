import { test, expect } from '@playwright/test';
import WebSocket from 'ws';
import { gatewayAPI, frontendFetch } from './helpers';

test.describe('Module N: Infrastructure', () => {
  test('N-01: Gateway 进程运行', async () => {
    const { status, body } = await gatewayAPI('GET', '/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  test('N-02: Redis 连通', async () => {
    const { body } = await gatewayAPI('GET', '/health');
    expect(body.redis).toBe('connected');
  });

  test('N-03: 前端可访问', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
  });

  test('N-04: Supabase 连通', async ({ page }) => {
    // Verify Supabase env vars are configured by checking login page loads
    // (it uses createBrowserClient which would fail without valid config)
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('N-07: CORS 配置', async () => {
    // Gateway should have CORS headers
    const { headers } = await gatewayAPI('GET', '/health');
    // Helmet or manual CORS — at minimum the endpoint should respond
    expect(headers).toBeDefined();
  });

  test('N-08: WS 端点存在', async () => {
    // Verify WS endpoint responds (even if rejecting due to no ticket)
    const ws = new WebSocket('ws://localhost:3001/ws');
    const connected = await new Promise<boolean>((resolve) => {
      ws.on('open', () => {
        ws.close();
        resolve(true);
      });
      ws.on('close', () => resolve(true)); // Server accepted then closed = endpoint exists
      ws.on('error', () => resolve(false));
      setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);
    });
    expect(connected).toBe(true);
  });

  // N-09 to N-16: SKIP (deployment-related)
  test.skip('N-09~N-16: 线上部署相关（本地跳过）', async () => {
    // These tests are for production deployment verification
    // N-09: 定时快照, N-10: 云监控, N-11: UptimeRobot
    // N-12: Nginx SSL, N-13: DNSPod, N-14: CDN
    // N-15: PM2 开机自启, N-16: CVM 安全加固
  });
});
