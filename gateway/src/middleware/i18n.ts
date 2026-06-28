/**
 * i18n foundation — locale detection and message key structure
 * Per Phase 5: Prepare for multi-language support.
 *
 * Supported locales: en (default), zh-CN, zh-TW, ja
 * Detection order: query param → cookie → Accept-Language header → default
 */
import type { Request, Response, NextFunction } from 'express';

export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Express middleware that detects locale and sets req.locale.
 * Detection priority: ?lang= → cookie(lang) → Accept-Language → default.
 */
export const localeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const detected = detectLocale(req);
  (req as Request & { locale: SupportedLocale }).locale = detected;
  next();
};

/**
 * Detect the best locale from a request.
 */
const detectLocale = (req: Request): SupportedLocale => {
  // 1. Query param: ?lang=zh-CN
  const queryLang = req.query.lang as string | undefined;
  if (queryLang && isSupported(queryLang)) {
    return queryLang as SupportedLocale;
  }

  // 2. Cookie: lang=zh-CN
  const cookieLang = parseCookieValue(req.headers.cookie, 'lang');
  if (cookieLang && isSupported(cookieLang)) {
    return cookieLang as SupportedLocale;
  }

  // 3. Accept-Language header
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    const matched = matchAcceptLanguage(acceptLang);
    if (matched) return matched;
  }

  return DEFAULT_LOCALE;
};

/**
 * Check if a locale string is in our supported set.
 */
const isSupported = (locale: string): boolean => {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
};

/**
 * Parse Accept-Language header and find the best supported match.
 * Example: "zh-CN,zh;q=0.9,en;q=0.8" → "zh-CN"
 */
const matchAcceptLanguage = (header: string): SupportedLocale | null => {
  const entries = header
    .split(',')
    .map((part) => {
      const [lang, qPart] = part.trim().split(';');
      const q = qPart ? parseFloat(qPart.replace('q=', '')) : 1.0;
      return { lang: lang.trim(), q };
    })
    .sort((a, b) => b.q - a.q);

  for (const entry of entries) {
    // Exact match
    if (isSupported(entry.lang)) {
      return entry.lang as SupportedLocale;
    }

    // Prefix match: "zh" → "zh-CN"
    const prefix = entry.lang.split('-')[0];
    const prefixMatch = SUPPORTED_LOCALES.find((l) => l.startsWith(prefix));
    if (prefixMatch) return prefixMatch;
  }

  return null;
};

/**
 * Simple cookie parser for a single value (avoids adding cookie-parser dependency).
 */
const parseCookieValue = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));

  return match ? match.substring(name.length + 1) : null;
};

// ─── Message Key Structure ───────────────────────────────────────────

/**
 * Message keys namespace for i18n. Keys follow dot notation:
 *   error.rate_limited → "Rate limit exceeded"
 *   error.invalid_session → "Invalid session"
 *   ws.connection_ack → "Connected successfully"
 *   ws.agent_offline → "Agent is currently offline"
 *
 * Actual translations will be loaded from JSON files per locale
 * in Phase 5+. This structure establishes the key convention.
 */
export const MESSAGE_KEYS = {
  // WebSocket errors
  'error.rate_limited': 'Message rate limit exceeded',
  'error.invalid_session': 'Invalid session',
  'error.invalid_json': 'Failed to parse message as JSON',
  'error.invalid_frame': 'Message must include type and timestamp fields',
  'error.unknown_type': 'Unknown message type',
  'error.agent_unreachable': 'Agent is currently unreachable',

  // WebSocket status
  'ws.connected': 'Connected successfully',
  'ws.agent_online': 'Agent is online',
  'ws.agent_offline': 'Agent is currently offline',
  'ws.queued': 'Message queued for delivery',

  // HTTP errors
  'http.not_found': 'Endpoint not found',
  'http.unauthorized': 'Authentication required',
  'http.forbidden': 'Access denied',
  'http.server_error': 'Internal server error',
} as const;

export type MessageKey = keyof typeof MESSAGE_KEYS;

/**
 * Get a message string by key (returns English default for now).
 * In Phase 5+, this will accept a locale parameter and load translations.
 */
export const getMessage = (key: MessageKey): string => {
  return MESSAGE_KEYS[key];
};
