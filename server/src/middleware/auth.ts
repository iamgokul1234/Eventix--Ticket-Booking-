import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { UserRole } from '../constants/enums';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Extend Express Request to carry the authenticated payload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * authenticate — Phase 3 implementation.
 * Extracts and verifies the Bearer JWT from the Authorization header.
 * On success: attaches decoded payload to req.user and calls next().
 * On failure: calls next(UnauthorizedError) — never throws directly.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Sanity-check payload shape — reject tokens that don't carry our required fields
    if (!decoded.userId || !decoded.role) {
      return next(new UnauthorizedError('Invalid token payload'));
    }

    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Token expired'));
    }
    return next(new UnauthorizedError('Invalid token'));
  }
}

/**
 * authorizeAdmin — Phase 3 implementation.
 * Must be chained AFTER authenticate.
 * Rejects any non-ADMIN role with 403 FORBIDDEN.
 */
export function authorizeAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    // authenticate was not called first — defensive guard
    return next(new UnauthorizedError('Authentication required'));
  }

  if (req.user.role !== UserRole.ADMIN) {
    return next(new ForbiddenError('Admin access required'));
  }

  next();
}
