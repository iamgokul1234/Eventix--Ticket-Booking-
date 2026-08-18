import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { findUserByEmail, findUserById, createUser } from '../repositories/user.repository';
import { IUser } from '../models/User';
import { UserRole } from '../constants/enums';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { ErrorCode } from '../constants/errorCodes';
import { SignupInput, LoginInput } from '../validators/auth';

const BCRYPT_ROUNDS = 12;

export interface AuthTokenPayload {
  userId: string;
  role: UserRole;
}

export interface AuthResult {
  user: Omit<IUser, 'passwordHash'>;
  token: string;
}

function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}

/**
 * signup — registers a new user.
 * Role is ALWAYS forced to USER regardless of request payload.
 * Never called with role in the input.
 */
export async function signup(input: SignupInput): Promise<AuthResult> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError('Email already in use', ErrorCode.INVALID_REQUEST);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    role: UserRole.USER, // Always USER — never from input
    walletBalance: 0,
  });

  const token = signToken({ userId: user._id.toString(), role: user.role });

  return { user: user.toObject() as Omit<IUser, 'passwordHash'>, token };
}

/**
 * login — verifies credentials and returns a JWT.
 * Deliberately generic error message to prevent email enumeration.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  // Must select passwordHash explicitly (select: false on model)
  const user = await findUserByEmail(input.email, true);

  const INVALID_CREDS_ERROR = new UnauthorizedError('Invalid email or password');

  if (!user) {
    // Still run bcrypt to prevent timing attacks
    await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    throw INVALID_CREDS_ERROR;
  }

  const isMatch = await bcrypt.compare(input.password, user.passwordHash);
  if (!isMatch) {
    throw INVALID_CREDS_ERROR;
  }

  const token = signToken({ userId: user._id.toString(), role: user.role });

  return { user: user.toObject() as Omit<IUser, 'passwordHash'>, token };
}

/**
 * getMe — fetches the current authenticated user from the DB.
 * Authoritative server-side fetch — never trusts JWT payload for profile data.
 */
export async function getMe(userId: string): Promise<IUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError('User not found', ErrorCode.UNAUTHORIZED);
  }
  return user;
}
