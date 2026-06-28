export interface DesktopAppVersion {
  status: 'ok' | 'unavailable' | 'error';
  currentVersion: string;
  currentBuild?: string;
  configured?: boolean;
  feedURL?: string;
  message?: string;
}

export type DesktopUpdateCheckStatus =
  | 'checking_started'
  | 'not_configured'
  | 'unavailable'
  | 'error';

export interface DesktopUpdateCheckResult {
  status: DesktopUpdateCheckStatus;
  currentVersion?: string;
  currentBuild?: string;
  feedURL?: string;
  message: string;
}

export type QRClawDesktopBridge = {
  platform: 'desktop' | 'web';
  ready?: () => void;
  getAppVersion?: () => Promise<DesktopAppVersion> | DesktopAppVersion;
  checkForUpdates?: () => Promise<DesktopUpdateCheckResult> | DesktopUpdateCheckResult;
};

declare global {
  interface Window {
    qrclawDesktop?: QRClawDesktopBridge;
    /** @deprecated use qrclawDesktop */
    bibishengDesktop?: QRClawDesktopBridge;
  }
}

export function isDesktopMode(): boolean {
  if (process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1') return true;
  if (typeof window === 'undefined') return false;
  if (window.qrclawDesktop?.platform === 'desktop') return true;
  if (window.bibishengDesktop?.platform === 'desktop') return true;
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('QRClawDesktop')) {
    return true;
  }
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('desktop') === '1') return true;
  }
  return false;
}

const unavailableUpdateResult = (): DesktopUpdateCheckResult => ({
  status: 'unavailable',
  message: '桌面更新检测仅在 QRClaw macOS 应用内可用。',
});

export async function getDesktopAppVersion(): Promise<DesktopAppVersion | null> {
  if (typeof window === 'undefined') return null;
  const bridge = window.qrclawDesktop ?? window.bibishengDesktop;
  if (!bridge?.getAppVersion) return null;

  try {
    return await bridge.getAppVersion();
  } catch (error) {
    return {
      status: 'error',
      currentVersion: '0.1.0',
      message: error instanceof Error ? error.message : '读取桌面版本失败',
    };
  }
}

export async function checkDesktopForUpdates(): Promise<DesktopUpdateCheckResult> {
  if (typeof window === 'undefined') return unavailableUpdateResult();
  const bridge = window.qrclawDesktop ?? window.bibishengDesktop;
  if (!bridge?.checkForUpdates) return unavailableUpdateResult();

  try {
    return await bridge.checkForUpdates();
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '检测更新失败，请稍后重试。',
    };
  }
}
