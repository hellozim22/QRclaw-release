const DEFAULT_MAX_EDGE = 256;

interface ResizeProfileAvatarOptions {
  maxEdge?: number;
  outputMime?: 'image/png' | 'image/jpeg' | 'image/webp';
}

function outputMime(file: File): 'image/png' | 'image/jpeg' | 'image/webp' {
  const t = file.type.toLowerCase();
  if (t === 'image/png') return 'image/png';
  if (t === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Downscale image to fit within MAX_EDGE×MAX_EDGE (aspect preserved) for profile avatars.
 * Browser-only (Image/canvas); safe if module is imported on server — call only from client handlers.
 */
export function resizeProfileAvatarToDataUrl(
  file: File,
  quality = 0.88,
  options: ResizeProfileAvatarOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof Image === 'undefined'
    ) {
      reject(new Error('resizeProfileAvatarToDataUrl requires a browser environment'));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: width, naturalHeight: height } = img;
      if (width < 1 || height < 1) {
        reject(new Error('Invalid image dimensions'));
        return;
      }
      const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const mime = options.outputMime ?? outputMime(file);
      const q = mime === 'image/png' ? undefined : quality;
      try {
        resolve(canvas.toDataURL(mime, q));
      } catch {
        resolve(canvas.toDataURL('image/jpeg', quality));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}
