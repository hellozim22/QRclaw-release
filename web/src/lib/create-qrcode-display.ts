/**
 * Pure helpers for Create QR success step — testable without React / fetch.
 */

export const CREATE_QR_TRANSPARENT_PIXEL_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface CreateQrApiShape {
  slug: string;
  profile_url?: unknown;
  qr_image_url?: unknown;
}

/**
 * @param origin — e.g. window.location.origin in the browser; use "" on SSR (profile falls back to path-only /q/:slug)
 */
export function resolveCreateQrDisplayUrls(
  qrData: CreateQrApiShape,
  origin: string
): { profileUrl: string; qrImageUrl: string } {
  const slug = qrData.slug;
  const profileUrl =
    typeof qrData.profile_url === 'string' && qrData.profile_url.length > 0
      ? qrData.profile_url
      : buildProfileUrlFallback(slug, origin);

  const qrImageUrl =
    typeof qrData.qr_image_url === 'string' && qrData.qr_image_url.length > 0
      ? qrData.qr_image_url
      : CREATE_QR_TRANSPARENT_PIXEL_GIF;

  return { profileUrl, qrImageUrl };
}

function buildProfileUrlFallback(slug: string, origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, '');
  if (trimmed.length > 0) {
    return `${trimmed}/q/${slug}`;
  }
  return `/q/${slug}`;
}
