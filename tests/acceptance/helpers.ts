import { request } from '@playwright/test';

export const GATEWAY_URL = 'http://localhost:3001';
export const FRONTEND_URL = 'http://localhost:3000';
export const WS_URL = 'ws://localhost:3001/ws';

export async function gatewayAPI(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  const ctx = await request.newContext({ baseURL: GATEWAY_URL });
  const opts: Record<string, unknown> = {
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.data = body;

  const fn = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
  const res = await ctx[fn](path, opts);
  return {
    status: res.status(),
    body: await res.json().catch(() => null),
    headers: res.headers(),
  };
}

export async function frontendFetch(path: string) {
  const ctx = await request.newContext({ baseURL: FRONTEND_URL });
  const res = await ctx.get(path);
  return {
    status: res.status(),
    text: await res.text(),
    headers: res.headers(),
  };
}
