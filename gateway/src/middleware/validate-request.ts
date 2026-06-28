import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Express middleware factory that validates `req.body` against a Zod schema.
 *
 * @example
 *   router.post('/foo', validateRequest(myRequestSchema), (req, res) => {
 *     // Body has been parsed and replaced by middleware.
 *     // Downstream handlers should still cast: `const data = req.body as MyRequest;`
 *     // (Express does not propagate the generic through handler chaining.)
 *   });
 *
 * On success: replaces `req.body` with the parsed (coerced) value and calls `next()`.
 * On failure: responds 400 — `{ error: { code: 'invalid_request', message: string } }`.
 * Non-Zod errors propagate to the error-handler middleware via `next(err)`.
 */
export const validateRequest = <T>(schema: z.ZodType<T>) => {
  return (
    req: Request<Record<string, string>, unknown, T>,
    res: Response,
    next: NextFunction
  ): void => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        const path = firstIssue?.path.join('.') || '';
        const detail = firstIssue?.message || 'unknown error';
        res.status(400).json({
          error: {
            code: 'invalid_request',
            message: `Validation failed${path ? ` at ${path}` : ''}: ${detail}`,
          },
        });
        return;
      }
      next(err);
    }
  };
};
