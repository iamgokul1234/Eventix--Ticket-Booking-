import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils';
import { ErrorCode } from '../constants';
import { config } from '../config';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    res.status(400).json({
      success: false,
      message,
      errorCode: ErrorCode.INVALID_REQUEST,
    });
    return;
  }

  // Our operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorCode: err.errorCode,
    });
    return;
  }

  // Unknown/unexpected errors — never leak stack traces in production
  const isDev = config.nodeEnv === 'development';
  console.error('Unexpected error:', err);

  res.status(500).json({
    success: false,
    message: isDev && err instanceof Error ? err.message : 'Internal server error',
    errorCode: ErrorCode.INTERNAL_ERROR,
  });
}
