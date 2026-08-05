import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDesktopForUpdates, getDesktopAppVersion, isDesktopMode } from './desktop-bridge';

describe('desktop bridge helpers', () => {
  afterEach(() => {
    delete window.qrclawDesktop;
    delete window.bibishengDesktop;
    vi.unstubAllEnvs();
  });

  it('detects desktop mode from the injected bridge', () => {
    window.qrclawDesktop = { platform: 'desktop' };

    expect(isDesktopMode()).toBe(true);
  });

  it('returns null version when desktop bridge is unavailable', async () => {
    expect(await getDesktopAppVersion()).toBeNull();
  });

  it('calls the native update checker when available', async () => {
    window.qrclawDesktop = {
      platform: 'desktop',
      getAppVersion: async () => ({
        status: 'ok',
        currentVersion: '0.2.0',
        currentBuild: '12',
        configured: true,
      }),
      checkForUpdates: async () => ({
        status: 'checking_started',
        currentVersion: '0.2.0',
        message: '已打开更新检测。',
      }),
    };

    await expect(getDesktopAppVersion()).resolves.toMatchObject({
      currentVersion: '0.2.0',
      currentBuild: '12',
    });
    await expect(checkDesktopForUpdates()).resolves.toMatchObject({
      status: 'checking_started',
      currentVersion: '0.2.0',
    });
  });
});
