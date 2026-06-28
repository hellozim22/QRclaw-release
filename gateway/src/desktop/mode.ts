export const isDesktopLocalMode = (): boolean =>
  process.env.DESKTOP_LOCAL_MODE === '1';

export const isRedisDisabledForDesktop = (): boolean =>
  process.env.REDIS_DISABLED_FOR_DESKTOP === '1' || isDesktopLocalMode();
