/**
 * Unit tests for sanitize utility functions.
 * Tests escapeHtml, stripHtmlTags, and sanitizeMessageContent.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, stripHtmlTags, sanitizeMessageContent } from '@/lib/utils/sanitize';

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('should escape multiple special characters together', () => {
    expect(escapeHtml('<a href="test">&</a>')).toBe(
      '&lt;a href=&quot;test&quot;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not modify strings without special characters', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('should handle unicode characters safely', () => {
    expect(escapeHtml('Hello')).toBe('Hello');
  });
});

describe('stripHtmlTags', () => {
  it('should strip simple HTML tags', () => {
    expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello');
  });

  it('should strip self-closing tags', () => {
    expect(stripHtmlTags('Hello<br/>World')).toBe('HelloWorld');
  });

  it('should strip tags with attributes', () => {
    expect(stripHtmlTags('<a href="http://example.com">Link</a>')).toBe('Link');
  });

  it('should strip nested tags', () => {
    expect(stripHtmlTags('<div><p><b>Bold</b></p></div>')).toBe('Bold');
  });

  it('should return empty string for empty input', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('should return plain text unchanged', () => {
    expect(stripHtmlTags('Hello World')).toBe('Hello World');
  });

  it('should handle script tags', () => {
    expect(stripHtmlTags('<script>alert("xss")</script>')).toBe('alert("xss")');
  });
});

describe('sanitizeMessageContent', () => {
  it('should strip tags and escape remaining entities', () => {
    expect(sanitizeMessageContent('<b>Hello & World</b>')).toBe('Hello &amp; World');
  });

  it('should handle XSS attempt', () => {
    const xss = '<script>alert("xss")</script>';
    const result = sanitizeMessageContent(xss);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
    expect(result).toBe('alert(&quot;xss&quot;)');
  });

  it('should handle nested dangerous HTML', () => {
    const input = '<div onclick="evil()">Click <img src=x onerror="alert(1)">me</div>';
    const result = sanitizeMessageContent(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('should handle empty string', () => {
    expect(sanitizeMessageContent('')).toBe('');
  });

  it('should pass through clean text unchanged', () => {
    expect(sanitizeMessageContent('Hello World 123')).toBe('Hello World 123');
  });
});
