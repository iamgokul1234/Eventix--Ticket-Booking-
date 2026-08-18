import { Request, Response, NextFunction } from 'express';
import { signup, login, getMe } from '../services/auth.service';
import { sendSuccess } from '../utils/response';
import { SignupInput, LoginInput } from '../validators/auth';

/**
 * POST /api/auth/signup
 * Body is pre-validated by Zod middleware before this runs.
 */
export async function signupController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as SignupInput;
    const { user, token } = await signup(input);
    sendSuccess(res, { user, token }, 'Account created successfully', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body is pre-validated by Zod middleware before this runs.
 */
export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as LoginInput;
    const { user, token } = await login(input);
    sendSuccess(res, { user, token }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Requires authenticate middleware. req.user is guaranteed to be set.
 */
export async function getMeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // req.user is set by authenticate middleware — userId is a validated string
    const user = await getMe(req.user!.userId);
    sendSuccess(res, { user }, 'User fetched successfully');
  } catch (err) {
    next(err);
  }
}
