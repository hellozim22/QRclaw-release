import { CREATE_QR_TRANSPARENT_PIXEL_GIF } from '@/lib/create-qrcode-display';

/** True when API did not return a real QR image (success step should generate one client-side). */
export function needsClientGeneratedQr(qrImageUrl: string): boolean {
  return !qrImageUrl || qrImageUrl === CREATE_QR_TRANSPARENT_PIXEL_GIF;
}

/**
 * PNG data URL encoding `profileUrl` (the link visitors scan). ~304px wide for crisp display at 152px CSS.
 * Dynamic import keeps `qrcode` out of the main bundle until this runs (Success step only).
 */
export async function buildProfileQrDataUrl(profileUrl: string, dark: boolean): Promise<string> {
  const trimmed = profileUrl.trim();
  if (!trimmed) {
    return CREATE_QR_TRANSPARENT_PIXEL_GIF;
  }
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(trimmed, {
    width: 304,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: dark ? { dark: '#ffffff', light: '#111827ff' } : { dark: '#000000', light: '#ffffffff' },
  });
}
