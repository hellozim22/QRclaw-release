// Defense-in-depth text sanitizer for user-generated content.
// React auto-escapes JSX children, but this utility provides
// a second layer if content is ever used in non-React contexts.

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const HTML_CHARS_RE = /[&<>"']/g;

/**
 * Escape HTML special characters in a string.
 * Use when rendering user content outside React's JSX (e.g., title attributes,
 * meta tags, or server-rendered HTML).
 */
export const escapeHtml = (str: string): string =>
  str.replace(HTML_CHARS_RE, (char) => HTML_ENTITY_MAP[char] ?? char);

/**
 * Strip all HTML tags from a string, leaving only text content.
 */
export const stripHtmlTags = (str: string): string => str.replace(/<[^>]*>/g, '');

/**
 * Sanitize chat message content: strip tags then escape remaining entities.
 * Returns safe plain text suitable for display.
 */
export const sanitizeMessageContent = (content: string): string =>
  escapeHtml(stripHtmlTags(content));
