import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Security Tests (Phase 6)
 *
 * Tests security hardening per §10 (OWASP Top 10) and §T3:
 * - XSS injection prevention (input sanitization)
 * - SQL injection via WS frames
 * - Auth bypass attempts (token manipulation, role escalation)
 * - CSRF token validation
 * - Rate limiting abuse
 * - Content-Security-Policy header validation
 *
 * Mock-based: defines the security contract for real implementation.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface SanitizeResult {
  clean: string;
  blocked: boolean;
  threats: string[];
}

interface AuthToken {
  sub: string;
  role: 'owner' | 'agent' | 'visitor';
  exp: number;
  iat: number;
  jti: string;
}

interface CsrfValidation {
  valid: boolean;
  reason?: string;
}

interface SecurityHeaders {
  'Content-Security-Policy': string;
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'Strict-Transport-Security': string;
  'X-XSS-Protection': string;
  'Referrer-Policy': string;
}

// ─── Mock Security Service ──────────────────────────────────────────

const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=\s*["']?[^"'>]+/gi,
  /javascript\s*:/gi,
  /<iframe\b[^>]*>/gi,
  /<object\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /<svg\b[^>]*on\w+/gi,
];

const SQL_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b.*\b(FROM|INTO|TABLE|SET|WHERE|ALL)\b)/gi,
  /(['";]\s*OR\s+['"]?\d+['"]?\s*=\s*['"]?\d+)/gi,
  /(--\s|\/\*|\*\/|;\s*(DROP|DELETE|UPDATE))/gi,
  /(\bUNION\b\s+\bSELECT\b)/gi,
];

const createSecurityService = () => {
  const sanitizeInput = (input: string): SanitizeResult => {
    const threats: string[] = [];
    let clean = input;

    for (const pattern of XSS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(clean)) {
        threats.push('xss');
        break;
      }
    }

    for (const pattern of SQL_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(clean)) {
        threats.push('sql_injection');
        break;
      }
    }

    // HTML entity encoding for XSS prevention
    clean = clean
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    return {
      clean,
      blocked: threats.length > 0,
      threats,
    };
  };

  const validateWsFrame = (
    frame: string
  ): { valid: boolean; sanitized: string; threats: string[] } => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(frame);
    } catch {
      return { valid: false, sanitized: '', threats: ['malformed_json'] };
    }

    const threats: string[] = [];

    if (typeof parsed.content === 'string') {
      const result = sanitizeInput(parsed.content);
      if (result.blocked) {
        threats.push(...result.threats);
      }
      parsed.content = result.clean;
    }

    if (typeof parsed.conversationId === 'string') {
      const sqlCheck = sanitizeInput(parsed.conversationId);
      if (sqlCheck.threats.includes('sql_injection')) {
        threats.push('sql_injection_in_id');
      }
    }

    return {
      valid: threats.length === 0,
      sanitized: JSON.stringify(parsed),
      threats,
    };
  };

  const verifyAuthToken = (
    token: string,
    requiredRole?: string
  ): { valid: boolean; payload?: AuthToken; error?: string } => {
    if (!token || token.trim().length === 0) {
      return { valid: false, error: 'missing_token' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'malformed_token' };
    }

    let payload: AuthToken;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch {
      return { valid: false, error: 'invalid_payload' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSec) {
      return { valid: false, error: 'token_expired' };
    }

    if (!payload.sub || !payload.role) {
      return { valid: false, error: 'missing_claims' };
    }

    if (requiredRole && payload.role !== requiredRole) {
      return { valid: false, error: 'insufficient_role' };
    }

    return { valid: true, payload };
  };

  const validateCsrfToken = (sessionToken: string, csrfToken: string): CsrfValidation => {
    if (!csrfToken || csrfToken.trim().length === 0) {
      return { valid: false, reason: 'missing_csrf_token' };
    }

    if (!sessionToken || sessionToken.trim().length === 0) {
      return { valid: false, reason: 'missing_session' };
    }

    // CSRF token must be derived from session (mock: prefix match)
    const expectedPrefix = `csrf_${sessionToken.slice(0, 16)}`;
    if (!csrfToken.startsWith(expectedPrefix)) {
      return { valid: false, reason: 'token_mismatch' };
    }

    return { valid: true };
  };

  const getSecurityHeaders = (): SecurityHeaders => ({
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-XSS-Protection': '0',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });

  return {
    sanitizeInput,
    validateWsFrame,
    verifyAuthToken,
    validateCsrfToken,
    getSecurityHeaders,
  };
};

// ─── Helper: create mock JWT ────────────────────────────────────────

const createMockJwt = (payload: Partial<AuthToken>): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: 'user-1',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      jti: 'token-1',
      ...payload,
    })
  ).toString('base64url');
  const signature = Buffer.from('mock-signature').toString('base64url');
  return `${header}.${body}.${signature}`;
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Security: XSS Injection Prevention', () => {
  let svc: ReturnType<typeof createSecurityService>;

  beforeEach(() => {
    svc = createSecurityService();
    vi.restoreAllMocks();
  });

  it('blocks <script> tags', () => {
    const result = svc.sanitizeInput('<script>alert("xss")</script>');
    expect(result.blocked).toBe(true);
    expect(result.threats).toContain('xss');
    expect(result.clean).not.toContain('<script>');
  });

  it('blocks inline event handlers', () => {
    const result = svc.sanitizeInput('<img src=x onerror="alert(1)">');
    expect(result.blocked).toBe(true);
    expect(result.threats).toContain('xss');
  });

  it('blocks javascript: protocol', () => {
    const result = svc.sanitizeInput('<a href="javascript:alert(1)">click</a>');
    expect(result.blocked).toBe(true);
    expect(result.threats).toContain('xss');
  });

  it('blocks iframe injection', () => {
    const result = svc.sanitizeInput('<iframe src="https://evil.com"></iframe>');
    expect(result.blocked).toBe(true);
    expect(result.threats).toContain('xss');
  });

  it('allows clean text content', () => {
    const result = svc.sanitizeInput('Hello, how can I help you?');
    expect(result.blocked).toBe(false);
    expect(result.threats).toHaveLength(0);
  });

  it('encodes HTML entities in output', () => {
    const result = svc.sanitizeInput('Price: $5 < $10 & tax > 0');
    expect(result.clean).toContain('&lt;');
    expect(result.clean).toContain('&gt;');
    expect(result.clean).toContain('&amp;');
  });

  it('allows Unicode and emoji content', () => {
    const result = svc.sanitizeInput('你好世界 🎉 مرحبا');
    expect(result.blocked).toBe(false);
    expect(result.threats).toHaveLength(0);
  });
});

describe('Security: SQL Injection via WS Frames', () => {
  let svc: ReturnType<typeof createSecurityService>;

  beforeEach(() => {
    svc = createSecurityService();
    vi.restoreAllMocks();
  });

  it('blocks UNION SELECT in message content', () => {
    const frame = JSON.stringify({
      type: 'message',
      content: "' UNION SELECT * FROM users --",
      conversationId: 'conv-1',
    });
    const result = svc.validateWsFrame(frame);
    expect(result.valid).toBe(false);
    expect(result.threats).toContain('sql_injection');
  });

  it('blocks DROP TABLE in message content', () => {
    const frame = JSON.stringify({
      type: 'message',
      content: "'; DROP TABLE messages; --",
      conversationId: 'conv-1',
    });
    const result = svc.validateWsFrame(frame);
    expect(result.valid).toBe(false);
  });

  it('blocks SQL injection in conversationId field', () => {
    const frame = JSON.stringify({
      type: 'message',
      content: 'normal message',
      conversationId: "conv-1' OR '1'='1",
    });
    const result = svc.validateWsFrame(frame);
    expect(result.valid).toBe(false);
    expect(result.threats).toContain('sql_injection_in_id');
  });

  it('blocks OR 1=1 tautology', () => {
    const frame = JSON.stringify({
      type: 'message',
      content: "admin' OR '1'='1",
      conversationId: 'conv-1',
    });
    const result = svc.validateWsFrame(frame);
    expect(result.valid).toBe(false);
  });

  it('allows normal message content', () => {
    const frame = JSON.stringify({
      type: 'message',
      content: 'Can you help me select the right product?',
      conversationId: 'conv-123',
    });
    const result = svc.validateWsFrame(frame);
    expect(result.valid).toBe(true);
    expect(result.threats).toHaveLength(0);
  });

  it('rejects malformed JSON frames', () => {
    const result = svc.validateWsFrame('not-json{{{');
    expect(result.valid).toBe(false);
    expect(result.threats).toContain('malformed_json');
  });
});

describe('Security: Auth Bypass Attempts', () => {
  let svc: ReturnType<typeof createSecurityService>;

  beforeEach(() => {
    svc = createSecurityService();
    vi.restoreAllMocks();
  });

  it('rejects empty token', () => {
    const result = svc.verifyAuthToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('missing_token');
  });

  it('rejects malformed token (not 3 parts)', () => {
    const result = svc.verifyAuthToken('not-a-jwt');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('malformed_token');
  });

  it('rejects token with invalid base64 payload', () => {
    const result = svc.verifyAuthToken('header.!!!invalid!!!.signature');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_payload');
  });

  it('rejects expired token', () => {
    const token = createMockJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });
    const result = svc.verifyAuthToken(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('token_expired');
  });

  it('rejects token missing sub claim', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        role: 'owner',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');
    const sig = Buffer.from('sig').toString('base64url');
    const result = svc.verifyAuthToken(`${header}.${body}.${sig}`);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('missing_claims');
  });

  it('rejects role escalation (visitor trying owner role)', () => {
    const token = createMockJwt({ role: 'visitor' });
    const result = svc.verifyAuthToken(token, 'owner');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('insufficient_role');
  });

  it('accepts valid token with correct role', () => {
    const token = createMockJwt({ sub: 'owner-1', role: 'owner' });
    const result = svc.verifyAuthToken(token, 'owner');
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe('owner-1');
    expect(result.payload?.role).toBe('owner');
  });

  it('accepts valid token without role check', () => {
    const token = createMockJwt({ sub: 'visitor-1', role: 'visitor' });
    const result = svc.verifyAuthToken(token);
    expect(result.valid).toBe(true);
  });
});

describe('Security: CSRF Token Validation', () => {
  let svc: ReturnType<typeof createSecurityService>;

  beforeEach(() => {
    svc = createSecurityService();
    vi.restoreAllMocks();
  });

  it('rejects missing CSRF token', () => {
    const result = svc.validateCsrfToken('session-abc', '');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_csrf_token');
  });

  it('rejects missing session', () => {
    const result = svc.validateCsrfToken('', 'csrf_token');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_session');
  });

  it('rejects mismatched CSRF token', () => {
    const result = svc.validateCsrfToken('session-abc12345', 'csrf_wrong-prefix_xyz');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_mismatch');
  });

  it('accepts valid CSRF token derived from session', () => {
    const session = 'session-abc1234567890';
    const csrf = `csrf_${session.slice(0, 16)}_extra_entropy`;
    const result = svc.validateCsrfToken(session, csrf);
    expect(result.valid).toBe(true);
  });
});

describe('Security: CSP and Security Headers', () => {
  let svc: ReturnType<typeof createSecurityService>;

  beforeEach(() => {
    svc = createSecurityService();
    vi.restoreAllMocks();
  });

  it('includes Content-Security-Policy with restrictive defaults', () => {
    const headers = svc.getSecurityHeaders();
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("script-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });

  it('includes X-Content-Type-Options: nosniff', () => {
    const headers = svc.getSecurityHeaders();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('includes X-Frame-Options: DENY', () => {
    const headers = svc.getSecurityHeaders();
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('includes HSTS with preload', () => {
    const headers = svc.getSecurityHeaders();
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(headers['Strict-Transport-Security']).toContain('preload');
  });

  it('disables X-XSS-Protection (modern CSP replaces it)', () => {
    const headers = svc.getSecurityHeaders();
    expect(headers['X-XSS-Protection']).toBe('0');
  });

  it('includes strict referrer policy', () => {
    const headers = svc.getSecurityHeaders();
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('CSP allows WebSocket connections', () => {
    const headers = svc.getSecurityHeaders();
    expect(headers['Content-Security-Policy']).toContain('wss:');
  });
});
