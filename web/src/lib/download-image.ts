/**
 * Trigger a file download from an image URL (http(s) or data:).
 * Plain <a download> with data: URLs is unreliable across browsers; prefer Blob + object URL.
 */
export async function downloadImageUrl(url: string, filename: string): Promise<void> {
  if (url.startsWith('data:')) {
    try {
      const blob = dataUrlToBlob(url);
      triggerBlobDownload(blob, filename);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return;
  }

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const base64Marker = ';base64,';
  const base64Idx = dataUrl.indexOf(base64Marker);
  if (base64Idx !== -1) {
    const header = dataUrl.slice(5, base64Idx);
    const mime = header.split(';')[0]?.trim() || 'application/octet-stream';
    const base64 = dataUrl.slice(base64Idx + base64Marker.length);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    return new Blob();
  }
  const header = dataUrl.slice(5, comma);
  const mime = header.split(';')[0]?.trim() || 'text/plain;charset=utf-8';
  const decoded = decodeURIComponent(dataUrl.slice(comma + 1));
  return new Blob([decoded], { type: mime });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    /* ignore */
  }
}
