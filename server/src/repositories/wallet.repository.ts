import mongoose from 'mongoose';
import { User, IUser } from '../models/User';
import { WalletTransaction, IWalletTransaction } from '../models/WalletTransaction';
import {
  WalletTransactionType,
  WalletReferenceType,
  WalletTransactionStatus,
} from '../constants/enums';

export interface CreateWalletTransactionData {
  _id?: mongoose.Types.ObjectId | string;
  userId: mongoose.Types.ObjectId | string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: WalletReferenceType;
  referenceId?: mongoose.Types.ObjectId | string | null;
  idempotencyKey?: string | null;
  status?: WalletTransactionStatus;
}

export interface PaginatedWalletTransactions {
  transactions: IWalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * ATOMIC CREDIT PRIMITIVE: Increments user wallet balance by `amount`.
 * Returns the updated user document (with balanceAfter).
 */
export async function atomicCreditUserBalance(
  userId: string | mongoose.Types.ObjectId,
  amount: number,
  session?: mongoose.ClientSession
): Promise<{ user: IUser; balanceBefore: number; balanceAfter: number } | null> {
  // First fetch current balance for balanceBefore snapshot
  const currentUser = await User.findById(userId, 'walletBalance', { session }).exec();
  if (!currentUser) return null;

  const balanceBefore = currentUser.walletBalance;

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { walletBalance: amount } },
    { new: true, runValidators: true, session }
  ).exec();

  if (!updatedUser) return null;

  return {
    user: updatedUser,
    balanceBefore,
    balanceAfter: updatedUser.walletBalance,
  };
}

/**
 * ATOMIC DEBIT PRIMITIVE: Decrements user wallet balance by `amount` ONLY IF
 * `walletBalance >= amount`.
 * Baked into update filter — NEVER read balance -> check -> subtract -> save!
 * Returns null if user not found or balance insufficient.
 */
export async function atomicDebitUserBalance(
  userId: string | mongoose.Types.ObjectId,
  amount: number,
  session?: mongoose.ClientSession
): Promise<{ user: IUser; balanceBefore: number; balanceAfter: number } | null> {
  // Atomic conditional update with filter checking balance >= amount
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      walletBalance: { $gte: amount }, // <--- CRITICAL INVARIANT: filter condition prevents negative balance
    },
    { $inc: { walletBalance: -amount } },
    { new: true, runValidators: true, session }
  ).exec();

  if (!updatedUser) {
    return null; // Either user doesn't exist or balance was insufficient
  }

  // balanceAfter is updatedUser.walletBalance; balanceBefore was balanceAfter + amount
  const balanceAfter = updatedUser.walletBalance;
  const balanceBefore = balanceAfter + amount;

  return {
    user: updatedUser,
    balanceBefore,
    balanceAfter,
  };
}

/**
 * Appends a new transaction entry to the WalletTransaction ledger.
 */
export async function createWalletTransactionRecord(
  data: CreateWalletTransactionData,
  session?: mongoose.ClientSession
): Promise<IWalletTransaction> {
  const docData: Record<string, unknown> = {
    userId: data.userId,
    type: data.type,
    amount: data.amount,
    balanceBefore: data.balanceBefore,
    balanceAfter: data.balanceAfter,
    referenceType: data.referenceType,
    referenceId: data.referenceId ?? null,
    idempotencyKey: data.idempotencyKey ?? null,
    status: data.status ?? WalletTransactionStatus.COMPLETED,
  };

  if (data._id) {
    docData._id = data._id;
  }

  const docs = await WalletTransaction.create([docData], { session });

  return docs[0];
}

/**
 * Retrieves paginated transaction history for a user.
 */
export async function findWalletTransactionsByUser(
  userId: string | mongoose.Types.ObjectId,
  page = 1,
  limit = 20
): Promise<PaginatedWalletTransactions> {
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    WalletTransaction.countDocuments({ userId }).exec(),
  ]);

  return {
    transactions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
