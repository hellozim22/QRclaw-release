import path from 'node:path';

/** Parent of the Next standalone `web/` folder inside QRClaw.app Resources. */
export function bundledRuntimeRoot(): string {
  return path.resolve(process.cwd(), '..');
}
