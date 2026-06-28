import type { QRCode } from '@/hooks/useQRCodes';
import { resolveCreateQrDisplayUrls } from '@/lib/create-qrcode-display';

/** Display name on profile card / list (design uses `profile.name` over agent name). */
export function getQrProfileDisplayName(item: QRCode): string {
  const p = item.profile as Record<string, unknown> | undefined;
  const n = p?.name;
  if (typeof n === 'string' && n.trim().length > 0) return n.trim();
  return item.agents?.name?.trim() || item.slug;
}

export function getQrProfileGreeting(item: QRCode): string {
  const p = item.profile as Record<string, unknown> | undefined;
  const g = p?.greeting;
  return typeof g === 'string' ? g : '';
}

export function getQrProfileScanCount(item: QRCode): number {
  const p = item.profile as Record<string, unknown> | undefined;
  const v = p?.scan_count;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function getQrProfileConversationCount(item: QRCode): number {
  const p = item.profile as Record<string, unknown> | undefined;
  const v = p?.conversation_count ?? p?.conversations;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function getQrProfileImageUrl(item: QRCode): string | undefined {
  const p = item.profile as Record<string, unknown> | undefined;
  const u = p?.qr_image_url;
  return typeof u === 'string' && u.length > 0 ? u : undefined;
}

export function getQrProfilePublicUrl(item: QRCode, origin: string): string {
  const p = item.profile as Record<string, unknown> | undefined;
  return resolveCreateQrDisplayUrls({ slug: item.slug, profile_url: p?.profile_url }, origin)
    .profileUrl;
}
