import mongoose from 'mongoose';
import { User, IUser } from '../models/User';
import { UserRole } from '../constants/enums';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  walletBalance?: number;
}

/**
 * Find a user by email.
 * @param selectPassword - if true, includes the passwordHash field in the result.
 */
export async function findUserByEmail(
  email: string,
  selectPassword = false
): Promise<IUser | null> {
  const query = User.findOne({ email: email.toLowerCase() });
  if (selectPassword) {
    query.select('+passwordHash');
  }
  return query.exec();
}

/**
 * Find a user by ID. Never includes passwordHash.
 */
export async function findUserById(
  id: string | mongoose.Types.ObjectId
): Promise<IUser | null> {
  return User.findById(id).exec();
}

/**
 * Create a new user. Role is always set by the caller (service layer),
 * never from raw client input.
 */
export async function createUser(data: CreateUserData): Promise<IUser> {
  const user = new User({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    role: data.role ?? UserRole.USER,
    walletBalance: data.walletBalance ?? 0,
  });
  return user.save();
}
