import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Auth Middleware Unit Tests
 *
 * Tests the Express-style auth middleware for REST API endpoints:
 * - Validates Bearer token from Authorization header
 * - Sets req.user on success
 * - Returns 401 on failure
 *
 * Import path matches planned backend structure:
 *   gateway/src/middleware/auth → authMiddleware function
 */

// ─── Types (expected interface) ─────────────────────────────────────

interface UserPayload {
  id: string;
  role: string;
  ownerId?: string;
}

interface MockRequest {
  headers: Record<string, string | undefined>;
  user?: UserPayload;
}

interface MockResponse {
  status: (code: number) => MockResponse;
  json: (body: Record<string, unknown>) => void;
  statusCode?: number;
}

type NextFunction = () => void;

// ─── Mock JWT verify ────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-secret';

const mockJwtVerify = vi.fn<(token: string, secret: string) => UserPayload>();

// ─── Mock authMiddleware (TDD: implementation doesn't exist yet) ────

const authMiddleware = (req: MockRequest, res: MockResponse, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    res
      .status(401)
      .json({ error: { code: 'unauthorized', message: 'Missing Authorization header' } });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res
      .status(401)
      .json({ error: { code: 'unauthorized', message: 'Invalid Authorization format' } });
    return;
  }

  const token = parts[1];

  try {
    const payload = mockJwtVerify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid or expired token' } });
  }
};

// ─── Test Helpers ───────────────────────────────────────────────────

const createMockReq = (headers: Record<string, string | undefined> = {}): MockRequest => ({
  headers,
});

const createMockRes = (): MockResponse & {
  _statusCode: number;
  _body: Record<string, unknown> | null;
} => {
  const res = {
    _statusCode: 200,
    _body: null as Record<string, unknown> | null,
    status(code: number) {
      res._statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      res._body = body;
    },
  };
  return res;
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('valid Bearer token → sets req.user and calls next()', () => {
    const userPayload: UserPayload = { id: 'user-001', role: 'owner' };
    mockJwtVerify.mockReturnValue(userPayload);

    const req = createMockReq({ authorization: 'Bearer valid-token-123' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(mockJwtVerify).toHaveBeenCalledWith('valid-token-123', JWT_SECRET);
    expect(req.user).toEqual(userPayload);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._statusCode).toBe(200); // unchanged
  });

  it('missing Authorization header → 401', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
    expect(res._body).toEqual({
      error: { code: 'unauthorized', message: 'Missing Authorization header' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('invalid token → 401', () => {
    mockJwtVerify.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    const req = createMockReq({ authorization: 'Bearer bad-token' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
    expect(res._body).toEqual({
      error: { code: 'unauthorized', message: 'Invalid or expired token' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('expired token → 401', () => {
    mockJwtVerify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const req = createMockReq({ authorization: 'Bearer expired-token' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
    expect(res._body).toEqual({
      error: { code: 'unauthorized', message: 'Invalid or expired token' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('malformed "Bearer xxx" format → 401', () => {
    const req = createMockReq({ authorization: 'Basic some-credentials' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
    expect(res._body).toEqual({
      error: { code: 'unauthorized', message: 'Invalid Authorization format' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('Authorization header with only "Bearer" (no token) → 401', () => {
    const req = createMockReq({ authorization: 'Bearer' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
