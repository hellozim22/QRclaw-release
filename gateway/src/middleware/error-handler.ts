/**
 * Global error handler middleware
 */
import type { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'internal_error';
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  console.error(`[Error] ${code}: ${err.message}`, {
    stack: err.stack,
    statusCode,
  });

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
};

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: 'The requested resource was not found',
    },
  });
};
