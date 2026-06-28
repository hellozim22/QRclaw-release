import type { NextConfig } from 'next';
import { buildCspDirectives, buildPermissionsPolicy } from './src/lib/csp';

const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const cspDirectives = buildCspDirectives({ gatewayUrl, supabaseUrl });
const isDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: buildPermissionsPolicy() },
  ...(isDesktopShell
    ? []
    : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
