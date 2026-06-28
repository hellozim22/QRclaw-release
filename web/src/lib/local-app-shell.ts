/** Bundled QRClaw.app sets DESKTOP_AUTO_BOOTSTRAP=1 at runtime (never in Vercel). */
export function isDesktopBootstrap(): boolean {
  return process.env.DESKTOP_AUTO_BOOTSTRAP === '1';
}

/**
 * True when the local shell (next dev OR bundled desktop app) should skip
 * cloud login gates and use POST /api/dev/bootstrap auto sign-in.
 */
export function isLocalAppShell(): boolean {
  if (isDesktopBootstrap()) return true;
  return (
    process.env.NEXT_PUBLIC_LOCAL_DEV === '1' &&
    process.env.NODE_ENV !== 'production' &&
    !process.env.VERCEL
  );
}

export function isLocalHostRequest(host: string, origin: string): boolean {
  return (
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  );
}
