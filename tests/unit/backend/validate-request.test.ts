/**
 * validateRequest middleware — Express middleware factory that validates
 * req.body against a Zod schema.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateRequest } from '../../../gateway/src/middleware/validate-request.js';

// ─── Test helpers ────────────────────────────────────────────────────

interface MockRequest {
  body: unknown;
}

interface MockResponse {
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  _statusCode: number;
  _body: unknown;
}

const createReq = (body: unknown): MockRequest => ({ body });

const createRes = (): MockResponse => {
  const res: MockResponse = {
    _statusCode: 200,
    _body: null,
    status(code: number) {
      res._statusCode = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
    },
  };
  return res;
};

// ─── Fixture schema ──────────────────────────────────────────────────

const testSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0),
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('validateRequest', () => {
  const middleware = validateRequest(testSchema);

  it('(a) valid body passes through and mutates req.body to parsed data', () => {
    const req = createReq({ email: 'a@b.com', age: 25 });
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(req.body).toEqual({ email: 'a@b.com', age: 25 });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._statusCode).toBe(200);
  });

  it('(b) invalid body returns 400 with error code and Validation failed message', () => {
    const req = createReq({ email: 'not-an-email', age: -5 });
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(res._statusCode).toBe(400);
    const body = res._body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toMatch(/Validation failed/);
  });

  it('(c) next called exactly once for valid, zero times for invalid', () => {
    const validReq = createReq({ email: 'ok@ok.com', age: 1 });
    const validRes = createRes();
    const validNext = vi.fn();
    middleware(validReq as any, validRes as any, validNext);
    expect(validNext).toHaveBeenCalledTimes(1);

    const invalidReq = createReq({ email: 'bad', age: 'not-a-number' });
    const invalidRes = createRes();
    const invalidNext = vi.fn();
    middleware(invalidReq as any, invalidRes as any, invalidNext);
    expect(invalidNext).toHaveBeenCalledTimes(0);
  });

  it('(d) error includes the failing JSON path', () => {
    const req = createReq({ email: 'bad-email', age: 10 });
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    const body = res._body as { error: { code: string; message: string } };
    expect(body.error.message).toContain('email');
  });

  // ─── Edge cases ──────────────────────────────────────────────────

  it('undefined body is treated as invalid', () => {
    const req = createReq(undefined);
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(res._statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('null body is treated as invalid', () => {
    const req = createReq(null);
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(res._statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('array body is treated as invalid', () => {
    const req = createReq([1, 2, 3]);
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(res._statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('primitive body is treated as invalid', () => {
    const req = createReq('just a string');
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(res._statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not mutate req.body on failure', () => {
    const originalBody = { email: 'bad', age: 'not-a-number' };
    const req = createReq(originalBody);
    const res = createRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(req.body).toBe(originalBody);
  });

  it('non-Zod errors propagate to next (not swallowed)', () => {
    const throwingSchema = z.object({}).transform(() => {
      throw new TypeError('unexpected runtime error');
    });
    const mw = validateRequest(throwingSchema);

    const req = createReq({});
    const res = createRes();
    const next = vi.fn();

    mw(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(TypeError);
  });
});
