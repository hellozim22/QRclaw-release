// Mask sensitive data (API keys, tokens, emails) for safe display in UI and logs.

/**
 * Mask a string, showing only the first `visiblePrefix` and last `visibleSuffix` chars.
 * Example: maskString('sk-abc123xyz', 3, 3) → 'sk-*****xyz'
 */
export const maskString = (value: string, visiblePrefix = 4, visibleSuffix = 4): string => {
  if (value.length <= visiblePrefix + visibleSuffix) {
    return '*'.repeat(value.length);
  }
  const prefix = value.slice(0, visiblePrefix);
  const suffix = value.slice(-visibleSuffix);
  const masked = '*'.repeat(Math.min(value.length - visiblePrefix - visibleSuffix, 8));
  return `${prefix}${masked}${suffix}`;
};

/**
 * Mask an API key for display. Shows prefix and last 4 chars.
 * Example: 'eyJhbGciOiJIUzI...' → 'eyJh********UzI.'
 */
export const maskApiKey = (key: string): string => maskString(key, 4, 4);

/**
 * Mask a session token for display.
 * Example: 'sess_abc123def456' → 'sess********f456'
 */
export const maskSessionToken = (token: string): string => maskString(token, 4, 4);

/**
 * Mask an email address. Shows first 2 chars and domain.
 * Example: 'user@example.com' → 'us***@example.com'
 */
export const maskEmail = (email: string): string => {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return maskString(email);
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  return `${visibleLocal}${'*'.repeat(Math.min(local.length - visibleLocal.length, 5))}${domain}`;
};
