interface CspOptions {
  gatewayUrl?: string;
  supabaseUrl?: string;
}

const stripProtocol = (url: string): string => url.replace(/^https?:\/\//, '');

export const buildCspDirectives = (options: CspOptions): string => {
  const { gatewayUrl = '', supabaseUrl = '' } = options;

  const connectSrcParts = [
    "'self'",
    'ws://localhost:*',
    'wss://localhost:*',
    supabaseUrl || null,
    'wss://*.supabase.co',
    'wss://*.qrclaw.ai',
    gatewayUrl || null,
    gatewayUrl ? `ws://${stripProtocol(gatewayUrl)}` : null,
  ];

  const imgSrcParts = ["'self'", 'data:', 'blob:', supabaseUrl || null];

  const isDev = process.env.NODE_ENV === 'development';
  const isLocalShell =
    process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1' ||
    gatewayUrl.startsWith('http://127.0.0.1') ||
    gatewayUrl.startsWith('http://localhost');
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSrcParts.filter(Boolean).join(' ')}`,
    `img-src ${imgSrcParts.filter(Boolean).join(' ')}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  // Bundled desktop app loads over plain http://127.0.0.1 — upgrading
  // subresources to https breaks CSS/JS in WKWebView (unstyled SSR flash).
  if (!isLocalShell) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
};

export const buildPermissionsPolicy = (): string => 'camera=(self), microphone=(), geolocation=()';
