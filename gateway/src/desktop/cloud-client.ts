import { env } from '../env.js';
import { isDesktopLocalMode } from './mode.js';

export interface CloudProxyOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export const getCloudGatewayUrl = (): string => {
  const url = process.env.DESKTOP_CLOUD_GATEWAY_URL?.trim();
  if (!url) {
    throw new Error('DESKTOP_CLOUD_GATEWAY_URL is not configured');
  }
  return url.replace(/\/+$/, '');
};

export const getDesktopRuntimeToken = (): string => {
  const token = process.env.DESKTOP_RUNTIME_TOKEN?.trim();
  if (!token && isDesktopLocalMode()) {
    throw new Error('DESKTOP_RUNTIME_TOKEN is not configured');
  }
  return token ?? '';
};

export async function proxyToCloud(options: CloudProxyOptions): Promise<Response> {
  const base = getCloudGatewayUrl();
  const url = `${base}${options.path.startsWith('/') ? options.path : `/${options.path}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getDesktopRuntimeToken()}`,
    ...options.headers,
  };

  return fetch(url, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export const getLocalWsTicketSecret = (): string => {
  return (
    process.env.DESKTOP_LOCAL_TICKET_KEY?.trim() ||
    process.env.WS_TICKET_SECRET?.trim() ||
    ''
  );
};

export const desktopEnvSummary = (): Record<string, string> => ({
  mode: isDesktopLocalMode() ? 'desktop-local' : 'cloud',
  cloudGateway: isDesktopLocalMode() ? getCloudGatewayUrl() : env.GATEWAY_BASE_URL,
});
